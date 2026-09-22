#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import psycopg2
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import psycopg2.extras
import requests
from dotenv import load_dotenv

ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard"

# ESPN a veces usa abreviaturas distintas a las que vienen en tus CSV.
# La clave puede matchear por abbreviation, displayName o shortDisplayName.
TEAM_MAP = {
    "LV": "LVA", "LVA": "LVA", "LAS VEGAS ACES": "LVA", "ACES": "LVA",
    "LA": "LAS", "LAS": "LAS", "LOS ANGELES SPARKS": "LAS", "SPARKS": "LAS",
    "GS": "GSV", "GSV": "GSV", "GOLDEN STATE VALKYRIES": "GSV", "VALKYRIES": "GSV",
    "NY": "NYL", "NYL": "NYL", "NEW YORK LIBERTY": "NYL", "LIBERTY": "NYL",
    "PHO": "PHX", "PHX": "PHX", "PHOENIX MERCURY": "PHX", "MERCURY": "PHX",
    "CONN": "CON", "CON": "CON", "CONNECTICUT SUN": "CON", "SUN": "CON",
    "ATL": "ATL", "ATLANTA DREAM": "ATL", "DREAM": "ATL",
    "CHI": "CHI", "CHICAGO SKY": "CHI", "SKY": "CHI",
    "DAL": "DAL", "DALLAS WINGS": "DAL", "WINGS": "DAL",
    "IND": "IND", "INDIANA FEVER": "IND", "FEVER": "IND",
    "MIN": "MIN", "MINNESOTA LYNX": "MIN", "LYNX": "MIN",
    "SEA": "SEA", "SEATTLE STORM": "SEA", "STORM": "SEA",
    "WAS": "WAS", "WSH": "WAS", "WASHINGTON MYSTICS": "WAS", "MYSTICS": "WAS",
}

@dataclass
class TeamInfo:
    abbr: str
    name: str
    logo: str | None
    score: int | None


def load_env() -> None:
    candidates = [
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
        Path.cwd() / "motor_python/.env.local",
        Path.cwd() / "motor_python/.env",
        Path.home() / "stats-app/.env.local",
        Path.home() / "stats-app/.env",
        Path.home() / "stats-app/motor_python/.env.local",
        Path.home() / "stats-app/motor_python/.env",
    ]
    for p in candidates:
        if p.exists():
            load_dotenv(p, override=False)


def get_db_url() -> str:
    load_env()
    keys = [
        "DATABASE_URL",
        "SUPABASE_DATABASE_URL",
        "SUPABASE_DB_URL",
        "POSTGRES_URL",
        "POSTGRES_DATABASE_URL",
    ]
    for k in keys:
        v = os.getenv(k)
        if v:
            return v
    raise RuntimeError("No encontré DATABASE_URL/SUPABASE_DATABASE_URL/POSTGRES_URL en tus .env")


def norm_abbr(team: dict[str, Any]) -> str:
    candidates = [
        team.get("abbreviation"),
        team.get("displayName"),
        team.get("shortDisplayName"),
        team.get("name"),
    ]
    for c in candidates:
        if not c:
            continue
        key = str(c).strip().upper()
        if key in TEAM_MAP:
            return TEAM_MAP[key]
    return str(team.get("abbreviation") or team.get("shortDisplayName") or "").upper()


def parse_score(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except Exception:
        return None


def parse_team(comp: dict[str, Any]) -> TeamInfo:
    team = comp.get("team") or {}
    logo = None
    logos = team.get("logos") or []
    if logos:
        logo = logos[0].get("href")
    return TeamInfo(
        abbr=norm_abbr(team),
        name=team.get("displayName") or team.get("shortDisplayName") or norm_abbr(team),
        logo=logo,
        score=parse_score(comp.get("score")),
    )


def fetch_scoreboard(target_date: date) -> dict[str, Any]:
    params = {"dates": target_date.strftime("%Y%m%d"), "limit": "100"}
    headers = {"User-Agent": "Mozilla/5.0 MoskProps-WNBA-Sync/1.0"}
    r = requests.get(ESPN_SCOREBOARD_URL, params=params, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()


def get_team_strength(conn, schema: str, team_abbr: str) -> dict[str, float | str | None]:
    sql = f"""
        select
            t.team_abbr,
            s.season,
            s.w_pct,
            s.plus_minus,
            s.pts
        from {schema}.team_season_stats s
        join {schema}.teams t on t.team_id = s.team_id
        where t.team_abbr = %s
          and s.season_type = 'Regular Season'
        order by s.season desc
        limit 1
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, (team_abbr,))
        row = cur.fetchone()
    if not row:
        return {"team_abbr": team_abbr, "season": None, "w_pct": 0.5, "plus_minus": 0.0, "pts": 0.0}
    return {
        "team_abbr": team_abbr,
        "season": row.get("season"),
        "w_pct": float(row.get("w_pct") or 0.5),
        "plus_minus": float(row.get("plus_minus") or 0.0),
        "pts": float(row.get("pts") or 0.0),
    }


def get_h2h(conn, schema: str, home_abbr: str, away_abbr: str, before: date) -> dict[str, int]:
    sql = f"""
        select home_team_abbr, away_team_abbr, home_wl, away_wl, game_date
        from {schema}.games
        where game_date < %s
          and (
            (home_team_abbr = %s and away_team_abbr = %s)
            or
            (home_team_abbr = %s and away_team_abbr = %s)
          )
        order by game_date desc
        limit 10
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, (before, home_abbr, away_abbr, away_abbr, home_abbr))
        rows = cur.fetchall()
    home_wins = 0
    away_wins = 0
    for r in rows:
        if r["home_team_abbr"] == home_abbr and r.get("home_wl") == "W":
            home_wins += 1
        elif r["away_team_abbr"] == home_abbr and r.get("away_wl") == "W":
            home_wins += 1
        elif r["home_team_abbr"] == away_abbr and r.get("home_wl") == "W":
            away_wins += 1
        elif r["away_team_abbr"] == away_abbr and r.get("away_wl") == "W":
            away_wins += 1
    return {"home_wins": home_wins, "away_wins": away_wins, "total": len(rows)}


def clamp(x: float, lo: float = 0.15, hi: float = 0.85) -> float:
    return max(lo, min(hi, x))


def compute_prob(home_strength: dict[str, Any], away_strength: dict[str, Any], h2h: dict[str, int]) -> tuple[float, str]:
    home_w_pct = float(home_strength.get("w_pct") or 0.5)
    away_w_pct = float(away_strength.get("w_pct") or 0.5)
    home_pm = float(home_strength.get("plus_minus") or 0.0)
    away_pm = float(away_strength.get("plus_minus") or 0.0)

    h2h_total = int(h2h.get("total") or 0)
    h2h_edge = 0.0
    if h2h_total:
        h2h_edge = ((h2h["home_wins"] / h2h_total) - 0.5) * 0.16

    raw = (
        0.50
        + ((home_w_pct - away_w_pct) * 0.28)
        + ((home_pm - away_pm) * 0.012)
        + h2h_edge
        + 0.025  # leve ventaja local
    )
    prob = clamp(raw)
    season_note = home_strength.get("season") or away_strength.get("season") or "última disponible"
    note = f"Estimación simple: win_pct + plus_minus + H2H últimos 10 + localía. Base stats season {season_note}. No es modelo de apuestas."
    return prob, note


def event_to_row(event: dict[str, Any], target_date: date, conn, schema: str) -> dict[str, Any] | None:
    comp = (event.get("competitions") or [{}])[0]
    competitors = comp.get("competitors") or []
    home_comp = next((c for c in competitors if c.get("homeAway") == "home"), None)
    away_comp = next((c for c in competitors if c.get("homeAway") == "away"), None)
    if not home_comp or not away_comp:
        return None

    home = parse_team(home_comp)
    away = parse_team(away_comp)

    status = (comp.get("status") or event.get("status") or {}).get("type") or {}
    state = status.get("state")
    name = status.get("name")
    detail = status.get("detail") or status.get("shortDetail")

    home_strength = get_team_strength(conn, schema, home.abbr)
    away_strength = get_team_strength(conn, schema, away.abbr)
    h2h = get_h2h(conn, schema, home.abbr, away.abbr, target_date)
    home_prob, note = compute_prob(home_strength, away_strength, h2h)
    away_prob = 1.0 - home_prob

    scheduled_at = event.get("date") or comp.get("date")

    return {
        "source_event_id": str(event.get("id")),
        "game_date": target_date.isoformat(),
        "scheduled_at": scheduled_at,
        "season": str((event.get("season") or {}).get("year") or target_date.year),
        "season_type": str((event.get("season") or {}).get("type") or ""),
        "status_state": state,
        "status_name": name,
        "status_detail": detail,
        "away_team_abbr": away.abbr,
        "away_team_name": away.name,
        "away_team_logo": away.logo,
        "away_score": away.score,
        "home_team_abbr": home.abbr,
        "home_team_name": home.name,
        "home_team_logo": home.logo,
        "home_score": home.score,
        "home_win_prob": round(home_prob, 4),
        "away_win_prob": round(away_prob, 4),
        "h2h_home_wins": h2h["home_wins"],
        "h2h_away_wins": h2h["away_wins"],
        "h2h_total": h2h["total"],
        "model_note": note,
        "raw_json": json.dumps(event),
    }


def upsert_rows(conn, schema: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return

    sql = f"""
        insert into {schema}.daily_games (
            source_event_id, game_date, scheduled_at, season, season_type,
            status_state, status_name, status_detail,
            away_team_abbr, away_team_name, away_team_logo, away_score,
            home_team_abbr, home_team_name, home_team_logo, home_score,
            home_win_prob, away_win_prob,
            h2h_home_wins, h2h_away_wins, h2h_total,
            model_note, raw_json, updated_at
        ) values (
            %(source_event_id)s, %(game_date)s, %(scheduled_at)s, %(season)s, %(season_type)s,
            %(status_state)s, %(status_name)s, %(status_detail)s,
            %(away_team_abbr)s, %(away_team_name)s, %(away_team_logo)s, %(away_score)s,
            %(home_team_abbr)s, %(home_team_name)s, %(home_team_logo)s, %(home_score)s,
            %(home_win_prob)s, %(away_win_prob)s,
            %(h2h_home_wins)s, %(h2h_away_wins)s, %(h2h_total)s,
            %(model_note)s, %(raw_json)s::jsonb, now()
        )
        on conflict (source_event_id) do update set
            game_date = excluded.game_date,
            scheduled_at = excluded.scheduled_at,
            season = excluded.season,
            season_type = excluded.season_type,
            status_state = excluded.status_state,
            status_name = excluded.status_name,
            status_detail = excluded.status_detail,
            away_team_abbr = excluded.away_team_abbr,
            away_team_name = excluded.away_team_name,
            away_team_logo = excluded.away_team_logo,
            away_score = excluded.away_score,
            home_team_abbr = excluded.home_team_abbr,
            home_team_name = excluded.home_team_name,
            home_team_logo = excluded.home_team_logo,
            home_score = excluded.home_score,
            home_win_prob = excluded.home_win_prob,
            away_win_prob = excluded.away_win_prob,
            h2h_home_wins = excluded.h2h_home_wins,
            h2h_away_wins = excluded.h2h_away_wins,
            h2h_total = excluded.h2h_total,
            model_note = excluded.model_note,
            raw_json = excluded.raw_json,
            updated_at = now()
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, rows, page_size=50)
    conn.commit()



def clean_postgres_url(url: str) -> str:
    """
    Quita parámetros que psycopg2 no acepta, por ejemplo pgbouncer=true.
    Mantiene parámetros válidos como sslmode.
    """
    parts = urlsplit(url)
    allowed = {
        "sslmode",
        "sslcert",
        "sslkey",
        "sslrootcert",
        "connect_timeout",
        "application_name",
        "options",
        "target_session_attrs",
    }
    query = urlencode([
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k in allowed
    ])
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def main() -> int:
    ap = argparse.ArgumentParser(description="Sync diario de partidos WNBA desde ESPN scoreboard hacia Postgres/Supabase")
    ap.add_argument("--date", default=None, help="Fecha YYYY-MM-DD. Si omitís, usa hoy.")
    ap.add_argument("--schema", default="wnba_api_data")
    ap.add_argument("--days-around", type=int, default=0, help="0=hoy, 1=ayer/hoy/mañana, etc.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    target = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    dates = [target + timedelta(days=offset) for offset in range(-args.days_around, args.days_around + 1)]

    db_url = get_db_url()
    conn = psycopg2.connect(clean_postgres_url(db_url))

    total = 0
    try:
        for d in dates:
            print(f"📡 ESPN WNBA scoreboard {d.isoformat()}")
            payload = fetch_scoreboard(d)
            events = payload.get("events") or []
            rows = []
            for ev in events:
                row = event_to_row(ev, d, conn, args.schema)
                if row:
                    rows.append(row)
            print(f"   Eventos detectados: {len(rows)}")
            for r in rows:
                print(
                    f"   {r['away_team_abbr']} @ {r['home_team_abbr']} | "
                    f"{r['status_name']} | "
                    f"{r['away_score'] if r['away_score'] is not None else '-'}-"
                    f"{r['home_score'] if r['home_score'] is not None else '-'} | "
                    f"home_prob={r['home_win_prob']:.1%}"
                )
            if not args.dry_run:
                upsert_rows(conn, args.schema, rows)
            total += len(rows)
        if args.dry_run:
            print("✅ Dry-run OK. No se escribió en la base.")
        else:
            print(f"✅ Sync completo. Filas procesadas: {total}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
