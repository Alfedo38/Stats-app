#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
06_fetch_missing_player_game_logs.py

Versión corregida:
- Usa BoxScoreSummaryV3 si está disponible.
- Si Summary V3 falla o no existe, NO se cae: arma fallback desde BoxScoreTraditionalV3.
- No usa BoxScoreSummaryV2.
- Completa partidos pendientes en nba_api_data.missing_player_game_logs_games.
- Inserta/actualiza nba_api_data.player_game_logs_v2.

Descarga por game_id:
- BoxScoreTraditionalV3
- BoxScoreAdvancedV3
- BoxScorePlayerTrackV3
- BoxScoreSummaryV3 opcional/fallback

Notas:
- potential_ast queda opcional.
- El script limpia parámetros tipo pgbouncer=true del DSN porque psycopg2 no los acepta.
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

from nba_api.stats.endpoints import (
    boxscoretraditionalv3,
    boxscoreadvancedv3,
    boxscoreplayertrackv3,
)

try:
    from nba_api.stats.endpoints import boxscoresummaryv3
except Exception:
    boxscoresummaryv3 = None


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(ROOT / ".env")


NBA_HEADERS = {
    "Host": "stats.nba.com",
    "Connection": "keep-alive",
    "Accept": "application/json, text/plain, */*",
    "x-nba-stats-token": "true",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "x-nba-stats-origin": "stats",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "Accept-Language": "en-US,en;q=0.9",
}


def normalize_psycopg2_dsn(raw_url: str) -> str:
    raw_url = (raw_url or "").strip()
    if not raw_url:
        return raw_url

    parts = urlsplit(raw_url)
    query_pairs = parse_qsl(parts.query, keep_blank_values=True)

    allowed = {
        "sslmode",
        "connect_timeout",
        "application_name",
        "keepalives",
        "keepalives_idle",
        "keepalives_interval",
        "keepalives_count",
    }

    clean_pairs = [(k, v) for k, v in query_pairs if k in allowed]

    if not any(k == "sslmode" for k, _ in clean_pairs):
        clean_pairs.append(("sslmode", "require"))

    clean_query = urlencode(clean_pairs)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, clean_query, parts.fragment))


DB_URL_RAW = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
DB_URL = normalize_psycopg2_dsn(DB_URL_RAW or "")

if not DB_URL:
    raise SystemExit("ERROR: falta SUPABASE_DB_URL o DATABASE_URL en nba_data_pipeline/.env")


def connect():
    return psycopg2.connect(DB_URL)


def pick_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    if df is None or df.empty:
        return None

    lower = {str(c).lower(): c for c in df.columns}

    for cand in candidates:
        if cand.lower() in lower:
            return lower[cand.lower()]

    return None


def getv(row: pd.Series | dict | None, candidates: list[str], default: Any = None) -> Any:
    if row is None:
        return default

    keys = row.keys() if hasattr(row, "keys") else []
    lower = {str(k).lower(): k for k in keys}

    for cand in candidates:
        key = lower.get(cand.lower())
        if key is not None:
            try:
                value = row[key]
                if pd.isna(value):
                    return default
                return value
            except Exception:
                return default

    return default


def to_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return default
        if pd.isna(value):
            return default
        return float(str(value).replace(",", "."))
    except Exception:
        return default


def to_int(value: Any, default: int | None = None) -> int | None:
    try:
        if value is None or value == "":
            return default
        if pd.isna(value):
            return default
        return int(float(str(value).replace(",", ".")))
    except Exception:
        return default


def parse_minutes(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    s = str(value).strip()

    if not s:
        return None

    m = re.match(r"PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?", s)
    if m:
        minutes = float(m.group(1) or 0)
        seconds = float(m.group(2) or 0)
        return minutes + seconds / 60.0

    if ":" in s:
        try:
            parts = s.split(":")
            minutes = float(parts[0])
            seconds = float(parts[1]) if len(parts) > 1 else 0
            return minutes + seconds / 60.0
        except Exception:
            return None

    return to_float(s)


def normalize_pct(value: Any) -> float | None:
    x = to_float(value)
    if x is None:
        return None

    if x > 1.5:
        return x / 100.0

    return x


def fetch_endpoint(endpoint_cls, game_id: str, cache_name: str, retries: int = 3, timeout: int = 90) -> list[pd.DataFrame]:
    last_error = None

    for attempt in range(1, retries + 1):
        try:
            print(f"📡 {cache_name} game_id={game_id} intento {attempt}/{retries}")

            endpoint = endpoint_cls(
                game_id=game_id,
                headers=NBA_HEADERS,
                timeout=timeout,
            )

            frames = endpoint.get_data_frames()

            for i, df in enumerate(frames):
                if isinstance(df, pd.DataFrame) and not df.empty:
                    out = CACHE_DIR / f"{cache_name}_{game_id}_df{i}.csv"
                    df.to_csv(out, index=False)

            return frames

        except Exception as e:
            last_error = e
            print(f"⚠️ Error {cache_name} {game_id}: {type(e).__name__}: {e}")
            time.sleep(4 * attempt)

    raise RuntimeError(f"Falló {cache_name} {game_id}: {last_error}")


def find_player_df(frames: list[pd.DataFrame]) -> pd.DataFrame:
    for df in frames:
        if not isinstance(df, pd.DataFrame) or df.empty:
            continue

        pid_col = pick_col(df, ["personId", "PLAYER_ID", "playerId"])
        team_col = pick_col(df, ["teamId", "TEAM_ID"])

        if pid_col and team_col:
            return df

    return pd.DataFrame()


def find_team_df(frames: list[pd.DataFrame]) -> pd.DataFrame:
    for df in frames:
        if not isinstance(df, pd.DataFrame) or df.empty:
            continue

        team_col = pick_col(df, ["teamId", "TEAM_ID"])
        pts_col = pick_col(df, ["points", "PTS", "teamPoints"])

        # Evita confundir PlayerStats con TeamStats.
        pid_col = pick_col(df, ["personId", "PLAYER_ID", "playerId"])
        if team_col and pts_col and not pid_col:
            return df

    return pd.DataFrame()


def build_summary_from_traditional(base_df: pd.DataFrame, team_df: pd.DataFrame | None = None) -> dict:
    """
    Fallback sin Summary:
    - team_map desde TeamStats si está disponible.
    - si no, desde PlayerStats agrupando por equipo.
    - home/away queda desconocido, pero al menos arma un matchup estable.
    """
    team_map: dict[int, dict] = {}

    if team_df is not None and not team_df.empty:
        for _, r in team_df.iterrows():
            tid = to_int(getv(r, ["teamId", "TEAM_ID"]))
            if tid is None:
                continue

            abbr = str(getv(r, ["teamTricode", "TEAM_ABBREVIATION", "teamAbbreviation"], "") or "").upper()
            name = str(getv(r, ["teamName", "TEAM_NAME"], "") or "")
            pts = to_float(getv(r, ["points", "PTS", "teamPoints"]))

            team_map[tid] = {
                "abbr": abbr,
                "name": name,
                "pts": pts,
            }

    if not team_map and base_df is not None and not base_df.empty:
        grouped: dict[int, dict] = {}
        for _, r in base_df.iterrows():
            tid = to_int(getv(r, ["teamId", "TEAM_ID"]))
            if tid is None:
                continue

            abbr = str(getv(r, ["teamTricode", "TEAM_ABBREVIATION", "teamAbbreviation"], "") or "").upper()
            name = str(getv(r, ["teamName", "TEAM_NAME"], "") or "")
            pts = to_float(getv(r, ["points", "PTS"]), 0.0) or 0.0

            if tid not in grouped:
                grouped[tid] = {"abbr": abbr, "name": name, "pts": 0.0}
            grouped[tid]["pts"] += pts

        team_map = grouped

    teams = list(team_map.items())
    teams.sort(key=lambda x: x[1].get("abbr", ""))

    home_team_id = None
    away_team_id = None
    home_abbr = ""
    away_abbr = ""

    # Sin summary no sabemos home/away. Igual usamos orden alfabético para matchup fallback.
    if len(teams) >= 2:
        away_team_id = teams[0][0]
        home_team_id = teams[1][0]
        away_abbr = teams[0][1].get("abbr", "")
        home_abbr = teams[1][1].get("abbr", "")

    matchup = ""
    if away_abbr and home_abbr:
        matchup = f"{away_abbr} @ {home_abbr}"

    return {
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "home_abbr": home_abbr,
        "away_abbr": away_abbr,
        "matchup": matchup,
        "team_map": team_map,
        "summary_source": "traditional_fallback",
    }


def fetch_summary_v3_optional(game_id: str) -> dict | None:
    if boxscoresummaryv3 is None:
        print("⚠️ BoxScoreSummaryV3 no está disponible en esta versión de nba_api. Uso fallback.")
        return None

    try:
        frames = fetch_endpoint(
            boxscoresummaryv3.BoxScoreSummaryV3,
            game_id,
            "boxscore_summary_v3",
            retries=1,
            timeout=45,
        )
    except Exception as e:
        print(f"⚠️ SummaryV3 falló. Uso fallback desde traditional. Error: {type(e).__name__}: {e}")
        return None

    game_summary = pd.DataFrame()
    line_score = pd.DataFrame()

    for df in frames:
        if not isinstance(df, pd.DataFrame) or df.empty:
            continue

        cols = {str(c).lower() for c in df.columns}

        if {"hometeamid", "awayteamid"}.issubset(cols) or {"home_team_id", "visitor_team_id"}.issubset({str(c).lower() for c in df.columns}):
            game_summary = df.copy()

        if (
            ("teamid" in cols or "team_id" in cols)
            and (
                "teamtricode" in cols
                or "teamabbreviation" in cols
                or "team_abbreviation" in cols
            )
        ):
            line_score = df.copy()

    home_team_id = None
    away_team_id = None

    if not game_summary.empty:
        r = game_summary.iloc[0]
        home_team_id = to_int(getv(r, ["homeTeamId", "HOME_TEAM_ID", "home_team_id"]))
        away_team_id = to_int(getv(r, ["awayTeamId", "visitorTeamId", "VISITOR_TEAM_ID", "away_team_id"]))

    team_map: dict[int, dict] = {}

    if not line_score.empty:
        for _, r in line_score.iterrows():
            tid = to_int(getv(r, ["teamId", "TEAM_ID", "team_id"]))
            if tid is None:
                continue

            team_map[tid] = {
                "abbr": str(getv(r, ["teamTricode", "TEAM_ABBREVIATION", "teamAbbreviation"], "") or "").upper(),
                "name": str(getv(r, ["teamName", "TEAM_NAME"], "") or ""),
                "pts": to_float(getv(r, ["points", "PTS", "teamPoints"])),
            }

    home_abbr = team_map.get(home_team_id, {}).get("abbr", "") if home_team_id else ""
    away_abbr = team_map.get(away_team_id, {}).get("abbr", "") if away_team_id else ""

    matchup = ""
    if away_abbr and home_abbr:
        matchup = f"{away_abbr} @ {home_abbr}"

    if not team_map and not home_team_id and not away_team_id:
        return None

    return {
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "home_abbr": home_abbr,
        "away_abbr": away_abbr,
        "matchup": matchup,
        "team_map": team_map,
        "summary_source": "summary_v3",
    }


def rows_by_player_id(df: pd.DataFrame) -> dict[int, pd.Series]:
    if df is None or df.empty:
        return {}

    pid_col = pick_col(df, ["personId", "PLAYER_ID", "playerId"])

    if not pid_col:
        return {}

    out = {}

    for _, r in df.iterrows():
        pid = to_int(r.get(pid_col))
        if pid is not None:
            out[pid] = r

    return out


def build_records(
    game: dict,
    base_df: pd.DataFrame,
    adv_df: pd.DataFrame,
    track_df: pd.DataFrame,
    summary: dict,
) -> list[dict]:
    adv_by_pid = rows_by_player_id(adv_df)
    track_by_pid = rows_by_player_id(track_df)

    records: list[dict] = []

    home_team_id = summary.get("home_team_id")
    away_team_id = summary.get("away_team_id")
    team_map = summary.get("team_map", {})
    matchup = summary.get("matchup", "")

    for _, r in base_df.iterrows():
        player_id = to_int(getv(r, ["personId", "PLAYER_ID", "playerId"]))
        if player_id is None:
            continue

        minutes = parse_minutes(getv(r, ["minutes", "MIN", "min"]))
        if minutes is None:
            continue

        team_id = to_int(getv(r, ["teamId", "TEAM_ID"]))
        team_abbr = str(getv(r, ["teamTricode", "TEAM_ABBREVIATION", "teamAbbreviation"], "") or "").upper()
        team_name = str(getv(r, ["teamName", "TEAM_NAME"], "") or "")

        if not team_name and team_id in team_map:
            team_name = str(team_map[team_id].get("name") or "")

        player_name = str(getv(r, ["playerName", "PLAYER_NAME", "name", "nameI"], "") or "")

        if not player_name:
            first = str(getv(r, ["firstName"], "") or "")
            last = str(getv(r, ["familyName"], "") or "")
            player_name = f"{first} {last}".strip()

        home_away = None
        opponent_abbr = None

        if team_id == home_team_id:
            home_away = "HOME"
            opponent_abbr = summary.get("away_abbr")
        elif team_id == away_team_id:
            home_away = "AWAY"
            opponent_abbr = summary.get("home_abbr")

        wl = None
        if team_id in team_map:
            own_pts = team_map.get(team_id, {}).get("pts")
            opp_id = away_team_id if team_id == home_team_id else home_team_id
            opp_pts = team_map.get(opp_id, {}).get("pts") if opp_id else None

            if own_pts is not None and opp_pts is not None:
                wl = "W" if own_pts > opp_pts else "L"

        adv = adv_by_pid.get(player_id)
        trk = track_by_pid.get(player_id)

        usage_pct = normalize_pct(
            getv(
                adv,
                [
                    "usagePercentage",
                    "USG_PCT",
                    "usage_pct",
                    "usagePct",
                    "usage",
                ],
            )
        )

        touches = to_float(getv(trk, ["touches", "TOUCHES"]))

        passes_made = to_float(
            getv(
                trk,
                [
                    "passes",
                    "passesMade",
                    "PASSES_MADE",
                    "PASS",
                ],
            )
        )

        potential_ast = to_float(
            getv(
                trk,
                [
                    "potentialAssists",
                    "potential_ast",
                    "POTENTIAL_AST",
                    "POTENTIAL_ASSISTS",
                ],
            )
        )

        rebound_chances = to_float(
            getv(
                trk,
                [
                    "reboundChancesTotal",
                    "REB_CHANCES",
                    "rebound_chances",
                    "REBOUND_CHANCES",
                ],
            )
        )

        rebound_off = to_float(
            getv(
                trk,
                [
                    "reboundChancesOffensive",
                    "REB_CHANCES_OFF",
                    "rebound_off",
                ],
            )
        )

        rebound_def = to_float(
            getv(
                trk,
                [
                    "reboundChancesDefensive",
                    "REB_CHANCES_DEF",
                    "rebound_def",
                ],
            )
        )

        rec = {
            "season": game["season"],
            "season_type": game["season_type"],
            "game_id": game["game_id"],
            "game_date": game["game_date"],

            "player_id": player_id,
            "player_name": player_name,
            "team_id": team_id,
            "team_abbreviation": team_abbr,
            "team_name": team_name,
            "matchup": matchup,
            "home_away": home_away,
            "opponent_abbr": opponent_abbr,
            "wl": wl,

            "min": minutes,
            "pts": to_float(getv(r, ["points", "PTS"])),
            "reb": to_float(getv(r, ["reboundsTotal", "REB", "rebounds"])),
            "ast": to_float(getv(r, ["assists", "AST"])),
            "stl": to_float(getv(r, ["steals", "STL"])),
            "blk": to_float(getv(r, ["blocks", "BLK"])),
            "tov": to_float(getv(r, ["turnovers", "TO", "TOV"])),
            "pf": to_float(getv(r, ["foulsPersonal", "PF", "personalFouls"])),

            "fgm": to_float(getv(r, ["fieldGoalsMade", "FGM"])),
            "fga": to_float(getv(r, ["fieldGoalsAttempted", "FGA"])),
            "fg_pct": normalize_pct(getv(r, ["fieldGoalsPercentage", "FG_PCT"])),

            "fg3m": to_float(getv(r, ["threePointersMade", "FG3M", "FG3_MADE"])),
            "fg3a": to_float(getv(r, ["threePointersAttempted", "FG3A", "FG3_ATTEMPTED"])),
            "fg3_pct": normalize_pct(getv(r, ["threePointersPercentage", "FG3_PCT"])),

            "ftm": to_float(getv(r, ["freeThrowsMade", "FTM"])),
            "fta": to_float(getv(r, ["freeThrowsAttempted", "FTA"])),
            "ft_pct": normalize_pct(getv(r, ["freeThrowsPercentage", "FT_PCT"])),

            "plus_minus": to_float(getv(r, ["plusMinusPoints", "PLUS_MINUS", "plusMinus"])),

            "usage_pct": usage_pct,

            "touches": touches,
            "passes_made": passes_made,
            "potential_ast": potential_ast,
            "rebound_chances": rebound_chances,
            "rebound_off": rebound_off,
            "rebound_def": rebound_def,

            "source_base": True,
            "source_advanced": adv is not None,
            "source_usage": usage_pct is not None,
            "source_tracking": trk is not None,
        }

        records.append(rec)

    return records


UPSERT_COLS = [
    "season",
    "season_type",
    "game_id",
    "game_date",

    "player_id",
    "player_name",
    "team_id",
    "team_abbreviation",
    "team_name",
    "matchup",
    "home_away",
    "opponent_abbr",
    "wl",

    "min",
    "pts",
    "reb",
    "ast",
    "stl",
    "blk",
    "tov",
    "pf",

    "fgm",
    "fga",
    "fg_pct",
    "fg3m",
    "fg3a",
    "fg3_pct",
    "ftm",
    "fta",
    "ft_pct",
    "plus_minus",

    "usage_pct",

    "touches",
    "passes_made",
    "potential_ast",
    "rebound_chances",
    "rebound_off",
    "rebound_def",

    "source_base",
    "source_advanced",
    "source_usage",
    "source_tracking",
]


def upsert_records(conn, records: list[dict]) -> int:
    if not records:
        return 0

    values = [tuple(rec.get(col) for col in UPSERT_COLS) for rec in records]
    cols_sql = ", ".join(UPSERT_COLS)

    update_cols = [
        c for c in UPSERT_COLS
        if c not in {"season", "season_type", "game_id", "player_id"}
    ]

    set_sql_parts = []

    for c in update_cols:
        if c.startswith("source_"):
            set_sql_parts.append(
                f"{c} = nba_api_data.player_game_logs_v2.{c} OR EXCLUDED.{c}"
            )
        else:
            set_sql_parts.append(
                f"{c} = COALESCE(EXCLUDED.{c}, nba_api_data.player_game_logs_v2.{c})"
            )

    set_sql_parts.append("updated_at = now()")

    sql = f"""
        INSERT INTO nba_api_data.player_game_logs_v2 (
            {cols_sql}
        )
        VALUES %s
        ON CONFLICT (season, season_type, game_id, player_id)
        DO UPDATE SET
            {", ".join(set_sql_parts)}
    """

    with conn.cursor() as cur:
        execute_values(cur, sql, values, page_size=500)

    return len(records)


def load_queue(conn, limit: int | None = None, only_game_id: str | None = None) -> list[dict]:
    params: list[Any] = []
    where = "WHERE status IN ('pending', 'partial', 'error')"

    if only_game_id:
        where += " AND game_id = %s"
        params.append(only_game_id)

    sql = f"""
        SELECT
            game_id,
            season,
            season_type,
            game_date
        FROM nba_api_data.missing_player_game_logs_games
        {where}
        ORDER BY game_date, game_id
    """

    if limit:
        sql += " LIMIT %s"
        params.append(limit)

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    return [
        {
            "game_id": r[0],
            "season": r[1],
            "season_type": r[2],
            "game_date": r[3],
        }
        for r in rows
    ]


def mark_queue(conn, game_id: str, status: str, last_error: str | None = None) -> None:
    with conn.cursor() as cur:
        if status == "error":
            cur.execute(
                """
                UPDATE nba_api_data.missing_player_game_logs_games
                SET
                    status = %s,
                    attempts = attempts + 1,
                    last_error = %s,
                    updated_at = now()
                WHERE game_id = %s
                """,
                (status, last_error, game_id),
            )
        else:
            cur.execute(
                """
                UPDATE nba_api_data.missing_player_game_logs_games
                SET
                    status = %s,
                    last_error = %s,
                    updated_at = now()
                WHERE game_id = %s
                """,
                (status, last_error, game_id),
            )


def audit_game_required_tracking(conn, game_id: str) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) AS rows,
                COUNT(*) FILTER (WHERE touches IS NULL) AS missing_touches,
                COUNT(*) FILTER (WHERE passes_made IS NULL) AS missing_passes_made,
                COUNT(*) FILTER (WHERE rebound_chances IS NULL) AS missing_rebound_chances,
                COUNT(*) FILTER (WHERE usage_pct IS NULL) AS missing_usage_pct,
                COUNT(*) FILTER (
                    WHERE min >= 10
                      AND touches = 0
                ) AS hard_zero_touches_min10
            FROM nba_api_data.player_game_logs_v2
            WHERE game_id = %s
            """,
            (game_id,),
        )
        r = cur.fetchone()

    return {
        "rows": int(r[0] or 0),
        "missing_touches": int(r[1] or 0),
        "missing_passes_made": int(r[2] or 0),
        "missing_rebound_chances": int(r[3] or 0),
        "missing_usage_pct": int(r[4] or 0),
        "hard_zero_touches_min10": int(r[5] or 0),
    }


def process_game(conn, game: dict) -> None:
    game_id = game["game_id"]

    print("=" * 72)
    print(f"🏀 Procesando {game_id} | {game['season_type']} | {game['game_date']}")

    base_frames = fetch_endpoint(
        boxscoretraditionalv3.BoxScoreTraditionalV3,
        game_id,
        "boxscore_traditional_v3",
    )

    base_df = find_player_df(base_frames)
    team_df = find_team_df(base_frames)

    if base_df.empty:
        raise RuntimeError(f"{game_id}: base_df vacío. No puedo insertar partido.")

    summary = fetch_summary_v3_optional(game_id)
    if summary is None:
        summary = build_summary_from_traditional(base_df, team_df)

    adv_frames = fetch_endpoint(
        boxscoreadvancedv3.BoxScoreAdvancedV3,
        game_id,
        "boxscore_advanced_v3",
    )

    track_frames = fetch_endpoint(
        boxscoreplayertrackv3.BoxScorePlayerTrackV3,
        game_id,
        "boxscore_playertrack_v3",
    )

    adv_df = find_player_df(adv_frames)
    track_df = find_player_df(track_frames)

    print(f"   base rows    : {len(base_df)}")
    print(f"   team rows    : {len(team_df)}")
    print(f"   advanced rows: {len(adv_df)}")
    print(f"   tracking rows: {len(track_df)}")
    print(f"   matchup      : {summary.get('matchup')}")
    print(f"   summary src  : {summary.get('summary_source')}")

    records = build_records(game, base_df, adv_df, track_df, summary)

    if not records:
        raise RuntimeError(f"{game_id}: no se generaron records para insertar.")

    inserted = upsert_records(conn, records)
    conn.commit()

    audit = audit_game_required_tracking(conn, game_id)

    required_missing = (
        audit["missing_touches"]
        + audit["missing_passes_made"]
        + audit["missing_rebound_chances"]
        + audit["missing_usage_pct"]
    )

    if required_missing == 0:
        status = "done"
        error = None
    else:
        status = "partial"
        error = (
            f"faltantes requeridos: "
            f"touches={audit['missing_touches']}, "
            f"passes={audit['missing_passes_made']}, "
            f"rebound_chances={audit['missing_rebound_chances']}, "
            f"usage={audit['missing_usage_pct']}"
        )

    mark_queue(conn, game_id, status, error)
    conn.commit()

    print(f"✅ Upsert records: {inserted}")
    print(f"🔎 Audit: {audit}")
    print(f"📌 Queue status: {status}")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Completa partidos faltantes en player_game_logs_v2.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--game-id", default=None)
    args = parser.parse_args()

    conn = connect()

    try:
        queue = load_queue(conn, limit=args.limit, only_game_id=args.game_id)

        print("=" * 72)
        print("🏀 FETCH MISSING PLAYER GAME LOGS — V3 FIXED")
        print("=" * 72)
        print(f"Pendientes: {len(queue)}")

        if not queue:
            return

        for game in queue:
            try:
                process_game(conn, game)
                time.sleep(2)
            except Exception as e:
                conn.rollback()
                msg = f"{type(e).__name__}: {e}"
                print(f"❌ Error procesando {game['game_id']}: {msg}")
                mark_queue(conn, game["game_id"], "error", msg[:1000])
                conn.commit()

        print("=" * 72)
        print("✅ Proceso terminado")

    finally:
        conn.close()


if __name__ == "__main__":
    main()