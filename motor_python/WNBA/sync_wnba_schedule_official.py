#!/usr/bin/env python3
"""Sincroniza calendario, estados y resultados WNBA desde ScheduleLeagueV2.

Reemplaza al scoreboard de ESPN. Solo sube la ventana solicitada y no toca
las tablas históricas ni los box scores.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv
from nba_api.stats.endpoints import ScheduleLeagueV2


LEAGUE_ID = "10"
TIMEZONE = ZoneInfo("America/Argentina/Buenos_Aires")


def load_env() -> None:
    script_dir = Path(__file__).resolve().parent
    for path in (
        Path.cwd() / ".env.local", Path.cwd() / ".env",
        script_dir.parent.parent / ".env.local", script_dir.parent.parent / ".env",
        Path.home() / "stats-app/.env.local", Path.home() / "stats-app/.env",
        Path.home() / "stats-app/motor_python/.env.local", Path.home() / "stats-app/motor_python/.env",
    ):
        if path.exists():
            load_dotenv(path, override=False)


def get_db_url() -> str:
    load_env()
    for key in ("DATABASE_URL", "SUPABASE_DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL", "POSTGRES_DATABASE_URL"):
        if os.getenv(key):
            return clean_db_url(os.environ[key])
    raise RuntimeError("Falta DATABASE_URL/SUPABASE_DATABASE_URL/POSTGRES_URL")


def clean_db_url(value: str) -> str:
    parts = urlsplit(value)
    allowed = {"sslmode", "connect_timeout", "application_name", "keepalives", "keepalives_idle", "keepalives_interval", "keepalives_count"}
    query = [(key, val) for key, val in parse_qsl(parts.query) if key in allowed]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def qident(value: str) -> str:
    if not value.replace("_", "").isalnum():
        raise ValueError(f"Schema inválido: {value}")
    return '"' + value + '"'


def clean(value: Any) -> Any:
    return None if value is None or pd.isna(value) else value


def number(value: Any) -> int | None:
    value = clean(value)
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def game_date(value: Any) -> date:
    parsed = pd.to_datetime(value, errors="raise")
    return parsed.date()


def team_name(city: Any, name: Any, tricode: Any) -> str:
    city_text = str(clean(city) or "").strip()
    name_text = str(clean(name) or "").strip()
    if city_text and name_text and city_text.lower() not in name_text.lower():
        return f"{city_text} {name_text}"
    return name_text or city_text or str(clean(tricode) or "Equipo")


def season_type(row: pd.Series) -> str:
    text = " ".join(str(clean(row.get(key)) or "") for key in ("gameLabel", "gameSubLabel", "seriesText", "gameSubtype")).lower()
    playoff_tokens = ("first round", "semifinal", "finals", "playoff", "postseason")
    return "Playoffs" if any(token in text for token in playoff_tokens) else "Regular Season"


def status_fields(row: pd.Series) -> tuple[str, str, str]:
    status = number(row.get("gameStatus")) or 1
    detail = str(clean(row.get("gameStatusText")) or "A confirmar")
    if status >= 3:
        return "post", "STATUS_FINAL", detail
    if status == 2:
        return "in", "STATUS_IN_PROGRESS", detail
    return "pre", "STATUS_SCHEDULED", detail


def get_team_strength(conn, schema: str, team_abbr: str) -> tuple[float, float]:
    with conn.cursor() as cur:
        cur.execute(
            f"""select coalesce(s.w_pct, .5), coalesce(s.plus_minus, 0)
                from {qident(schema)}.team_season_stats s
                join {qident(schema)}.teams t on t.team_id=s.team_id
                where t.team_abbr=%s and s.season_type='Regular Season'
                order by s.season desc limit 1""",
            (team_abbr,),
        )
        row = cur.fetchone()
    return (float(row[0]), float(row[1])) if row else (0.5, 0.0)


def get_h2h(conn, schema: str, home: str, away: str, before: date) -> tuple[int, int, int]:
    with conn.cursor() as cur:
        cur.execute(
            f"""select home_team_abbr, away_team_abbr, home_wl, away_wl
                from {qident(schema)}.games
                where game_date < %s and ((home_team_abbr=%s and away_team_abbr=%s)
                   or (home_team_abbr=%s and away_team_abbr=%s))
                order by game_date desc limit 10""",
            (before, home, away, away, home),
        )
        rows = cur.fetchall()
    home_wins = sum(1 for h, a, hw, aw in rows if (h == home and hw == "W") or (a == home and aw == "W"))
    away_wins = sum(1 for h, a, hw, aw in rows if (h == away and hw == "W") or (a == away and aw == "W"))
    return home_wins, away_wins, len(rows)


def probability(conn, schema: str, home: str, away: str, before: date) -> tuple[float, float, int, int, int]:
    home_w_pct, home_pm = get_team_strength(conn, schema, home)
    away_w_pct, away_pm = get_team_strength(conn, schema, away)
    home_h2h, away_h2h, total = get_h2h(conn, schema, home, away, before)
    edge = ((home_h2h / total) - .5) * .16 if total else 0.0
    home_prob = max(.15, min(.85, .5 + (home_w_pct - away_w_pct) * .28 + (home_pm - away_pm) * .012 + edge + .025))
    return round(home_prob, 4), round(1 - home_prob, 4), home_h2h, away_h2h, total


def row_to_record(row: pd.Series, conn, schema: str) -> dict[str, Any] | None:
    home = str(clean(row.get("homeTeam_teamTricode")) or "").upper()
    away = str(clean(row.get("awayTeam_teamTricode")) or "").upper()
    if not home or not away or home == "NONE" or away == "NONE":
        return None
    played_on = game_date(row.get("gameDate"))
    state, status_name, detail = status_fields(row)
    home_prob, away_prob, home_h2h, away_h2h, h2h_total = probability(conn, schema, home, away, played_on)
    raw = {key: clean(value) for key, value in row.to_dict().items()}
    use_scores = state in {"in", "post"}
    return {
        "source_event_id": str(row.get("gameId")),
        "game_date": played_on,
        "scheduled_at": clean(row.get("gameDateTimeUTC")),
        "season": str(clean(row.get("seasonYear")) or played_on.year),
        "season_type": season_type(row),
        "status_state": state,
        "status_name": status_name,
        "status_detail": detail,
        "away_team_abbr": away,
        "away_team_name": team_name(row.get("awayTeam_teamCity"), row.get("awayTeam_teamName"), away),
        "away_team_logo": None,
        "away_score": number(row.get("awayTeam_score")) if use_scores else None,
        "home_team_abbr": home,
        "home_team_name": team_name(row.get("homeTeam_teamCity"), row.get("homeTeam_teamName"), home),
        "home_team_logo": None,
        "home_score": number(row.get("homeTeam_score")) if use_scores else None,
        "home_win_prob": home_prob,
        "away_win_prob": away_prob,
        "h2h_home_wins": home_h2h,
        "h2h_away_wins": away_h2h,
        "h2h_total": h2h_total,
        "model_note": "Estimación informativa basada en temporada, diferencial, H2H y localía.",
        "raw_json": json.dumps(raw, default=str),
    }


def upsert(conn, schema: str, rows: list[dict[str, Any]]) -> None:
    sql = f"""insert into {qident(schema)}.daily_games (
        source_event_id, game_date, scheduled_at, season, season_type,
        status_state, status_name, status_detail,
        away_team_abbr, away_team_name, away_team_logo, away_score,
        home_team_abbr, home_team_name, home_team_logo, home_score,
        home_win_prob, away_win_prob, h2h_home_wins, h2h_away_wins, h2h_total,
        model_note, raw_json, updated_at
      ) values (
        %(source_event_id)s, %(game_date)s, %(scheduled_at)s, %(season)s, %(season_type)s,
        %(status_state)s, %(status_name)s, %(status_detail)s,
        %(away_team_abbr)s, %(away_team_name)s, %(away_team_logo)s, %(away_score)s,
        %(home_team_abbr)s, %(home_team_name)s, %(home_team_logo)s, %(home_score)s,
        %(home_win_prob)s, %(away_win_prob)s, %(h2h_home_wins)s, %(h2h_away_wins)s, %(h2h_total)s,
        %(model_note)s, %(raw_json)s::jsonb, now()
      ) on conflict (source_event_id) do update set
        game_date=excluded.game_date, scheduled_at=excluded.scheduled_at,
        season=excluded.season, season_type=excluded.season_type,
        status_state=excluded.status_state, status_name=excluded.status_name,
        status_detail=excluded.status_detail, away_team_abbr=excluded.away_team_abbr,
        away_team_name=excluded.away_team_name, away_score=excluded.away_score,
        home_team_abbr=excluded.home_team_abbr, home_team_name=excluded.home_team_name,
        home_score=excluded.home_score, home_win_prob=excluded.home_win_prob,
        away_win_prob=excluded.away_win_prob, h2h_home_wins=excluded.h2h_home_wins,
        h2h_away_wins=excluded.h2h_away_wins, h2h_total=excluded.h2h_total,
        model_note=excluded.model_note, raw_json=excluded.raw_json, updated_at=now()"""
    with conn.cursor() as cur:
        execute_batch(cur, sql, rows, page_size=50)


def main() -> int:
    parser = argparse.ArgumentParser(description="Calendario oficial WNBA -> daily_games")
    parser.add_argument("--season", default=str(datetime.now(TIMEZONE).year))
    parser.add_argument("--date", help="Fecha central YYYY-MM-DD; por defecto hoy en Argentina")
    parser.add_argument("--days-back", type=int, default=3)
    parser.add_argument("--days-forward", type=int, default=45)
    parser.add_argument("--schema", default="wnba_api_data")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    target = date.fromisoformat(args.date) if args.date else datetime.now(TIMEZONE).date()
    start, end = target - timedelta(days=args.days_back), target + timedelta(days=args.days_forward)
    print(f"Calendario WNBA {args.season} · ventana {start} -> {end}")
    result = ScheduleLeagueV2(league_id=LEAGUE_ID, season=args.season, timeout=90)
    frame = result.get_data_frames()[0]
    frame["_date"] = pd.to_datetime(frame["gameDate"], errors="coerce").dt.date
    frame = frame[(frame["_date"] >= start) & (frame["_date"] <= end)].copy()

    conn = psycopg2.connect(get_db_url(), application_name="wnba_schedule_official")
    try:
        rows = [record for _, row in frame.iterrows() if (record := row_to_record(row, conn, args.schema))]
        print(f"Partidos utilizables: {len(rows)}")
        for row in rows:
            print(f"  {row['game_date']} · {row['away_team_abbr']} @ {row['home_team_abbr']} · {row['status_detail']}")
        if args.dry_run:
            conn.rollback()
            print("Dry-run: no se escribió en la base")
        else:
            upsert(conn, args.schema, rows)
            conn.commit()
            print(f"OK: {len(rows)} filas insertadas/actualizadas en {args.schema}.daily_games")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
