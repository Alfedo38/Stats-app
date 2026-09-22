#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
daily_period_splits_pbp.py
Reconstruye splits reales por jugador usando PlayByPlayV3.

IMPORTANTE:
- Reemplaza al intento con BoxScoreTraditionalV3, porque ese método puede devolver full game
  y repetir los mismos números para Q1/H1/H2.
- Carga Q1, H1 y H2_REG en nba_api_data.player_period_splits_v2.
- Usa player_game_logs_v2 como roster base para crear filas cero cuando un jugador no suma stats
  en un tramo. Si ese roster falta, baja el roster real desde BoxScoreTraditional y conserva ceros.

Ejemplo:
  python3 daily_period_splits_pbp.py \
    --source db \
    --season 2026-27 \
    --start 2026-10-21 \
    --end 2027-05-15 \
    --splits Q1,H1,H2_REG \
    --force
"""

import argparse
import os
import random
import re
import time
import unicodedata
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Any

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import text
from db import get_engine

from nba_api.stats.endpoints import leaguegamefinder, playbyplayv3

try:
    from nba_api.stats.endpoints import boxscoretraditionalv3
except Exception:
    boxscoretraditionalv3 = None

try:
    from nba_api.stats.endpoints import boxscoretraditionalv2
except Exception:
    boxscoretraditionalv2 = None

# =========================================================
# ENV
# =========================================================
for env_path in [".env.local", ".env", "../.env.local", "../.env"]:
    p = Path(env_path)
    if p.exists():
        load_dotenv(p, override=False)

HEADERS = {
    "Host": "stats.nba.com",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

SPLIT_MAP: Dict[str, Tuple[int, int]] = {
    "Q1": (1, 1),
    "Q2": (2, 2),
    "Q3": (3, 3),
    "Q4": (4, 4),
    "H1": (1, 2),
    "H2_REG": (3, 4),
}

NUMERIC_COLS = [
    "fgm", "fga", "fg3m", "fg3a", "ftm", "fta",
    "oreb", "dreb", "reb", "ast", "stl", "blk", "tov", "pf", "pts", "plus_minus",
]

UPSERT_COLS = [
    "game_id", "game_date", "season", "season_type", "split_code", "start_period", "end_period",
    "team_id", "team_abbreviation", "player_id", "player_name", "min_text",
    *NUMERIC_COLS,
]

REQUEST_TIMEOUT = int(os.getenv("NBA_REQUEST_TIMEOUT", "90"))
MAX_RETRIES = int(os.getenv("NBA_MAX_RETRIES", "5"))
SLEEP_MIN = float(os.getenv("NBA_SLEEP_MIN", "1.7"))
SLEEP_MAX = float(os.getenv("NBA_SLEEP_MAX", "3.0"))
LEAGUE_ID = os.getenv("NBA_LEAGUE_ID", "00")

REGULAR_START = os.getenv("NBA_REGULAR_START", "2026-10-21")
REGULAR_END = os.getenv("NBA_REGULAR_END", "2026-04-12")
PLAYIN_START = os.getenv("NBA_PLAYIN_START", "2026-04-14")
PLAYIN_END = os.getenv("NBA_PLAYIN_END", "2026-04-17")
PLAYOFFS_START = os.getenv("NBA_PLAYOFFS_START", "2026-04-18")


def parse_date(s: str) -> date:
    return datetime.strptime(str(s), "%Y-%m-%d").date()


def random_sleep() -> None:
    time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))


def backoff_sleep(attempt: int, base_seconds: int = 6, max_wait: int = 90) -> None:
    wait = min(max_wait, base_seconds * attempt + random.uniform(1.0, 5.0))
    print(f"   -> reintentando en {wait:.1f}s...")
    time.sleep(wait)


def make_engine():
    return get_engine()


def infer_season_type_from_game_id(game_id: str, game_date: date) -> str:
    gid = str(game_id).zfill(10)
    prefix = gid[:3]
    if prefix == "002":
        return "Regular Season"
    if prefix == "004":
        return "Playoffs"
    if prefix == "005":
        return "Play-In"
    if prefix == "006":
        return "NBA Cup"

    if parse_date(REGULAR_START) <= game_date <= parse_date(REGULAR_END):
        return "Regular Season"
    if parse_date(PLAYIN_START) <= game_date <= parse_date(PLAYIN_END):
        return "Play-In"
    if game_date >= parse_date(PLAYOFFS_START):
        return "Playoffs"
    return "Unknown"


# =========================================================
# SQL / DB
# =========================================================
def qi(name: str) -> str:
    """Quote identifier simple."""
    return '"' + name.replace('"', '""') + '"'


def ensure_table(engine, target_schema: str, target_table: str) -> None:
    sql = f"""
    CREATE SCHEMA IF NOT EXISTS {qi(target_schema)};

    CREATE TABLE IF NOT EXISTS {qi(target_schema)}.{qi(target_table)} (
        game_id TEXT NOT NULL,
        game_date DATE NOT NULL,
        season TEXT,
        season_type TEXT,

        split_code TEXT NOT NULL,
        start_period INT NOT NULL,
        end_period INT NOT NULL,

        team_id BIGINT,
        team_abbreviation TEXT,

        player_id BIGINT NOT NULL,
        player_name TEXT,

        min_text TEXT,

        fgm NUMERIC DEFAULT 0,
        fga NUMERIC DEFAULT 0,
        fg3m NUMERIC DEFAULT 0,
        fg3a NUMERIC DEFAULT 0,
        ftm NUMERIC DEFAULT 0,
        fta NUMERIC DEFAULT 0,

        oreb NUMERIC DEFAULT 0,
        dreb NUMERIC DEFAULT 0,
        reb NUMERIC DEFAULT 0,
        ast NUMERIC DEFAULT 0,
        stl NUMERIC DEFAULT 0,
        blk NUMERIC DEFAULT 0,
        tov NUMERIC DEFAULT 0,
        pf NUMERIC DEFAULT 0,
        pts NUMERIC DEFAULT 0,
        plus_minus NUMERIC DEFAULT 0,

        pr NUMERIC GENERATED ALWAYS AS (COALESCE(pts,0) + COALESCE(reb,0)) STORED,
        pa NUMERIC GENERATED ALWAYS AS (COALESCE(pts,0) + COALESCE(ast,0)) STORED,
        ra NUMERIC GENERATED ALWAYS AS (COALESCE(reb,0) + COALESCE(ast,0)) STORED,
        pra NUMERIC GENERATED ALWAYS AS (COALESCE(pts,0) + COALESCE(reb,0) + COALESCE(ast,0)) STORED,

        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),

        PRIMARY KEY (game_id, player_id, split_code)
    );

    CREATE INDEX IF NOT EXISTS {qi('idx_' + target_table + '_date')}
    ON {qi(target_schema)}.{qi(target_table)}(game_date);

    CREATE INDEX IF NOT EXISTS {qi('idx_' + target_table + '_player_date')}
    ON {qi(target_schema)}.{qi(target_table)}(player_id, game_date DESC);

    CREATE INDEX IF NOT EXISTS {qi('idx_' + target_table + '_split')}
    ON {qi(target_schema)}.{qi(target_table)}(split_code);
    """
    with engine.begin() as conn:
        conn.execute(text(sql))


def table_columns(engine, schema: str, table: str) -> List[str]:
    with engine.begin() as conn:
        rows = conn.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = :schema AND table_name = :table
                ORDER BY ordinal_position
            """),
            {"schema": schema, "table": table},
        ).fetchall()
    return [r[0] for r in rows]


def norm_col(s: str) -> str:
    return str(s).lower().replace("_", "").replace(" ", "")


def pick_col(cols: Iterable[str], aliases: Iterable[str]) -> Optional[str]:
    lookup = {norm_col(c): c for c in cols}
    for a in aliases:
        if norm_col(a) in lookup:
            return lookup[norm_col(a)]
    return None


def sql_expr_for_col(cols: List[str], aliases: List[str], fallback_sql: str, cast: str = "") -> str:
    c = pick_col(cols, aliases)
    if c:
        return f"{qi(c)}{cast}"
    return fallback_sql


def fetch_games_from_db(engine, source_schema: str, source_table: str, season: str, start: date, end: date) -> pd.DataFrame:
    cols = table_columns(engine, source_schema, source_table)
    if not cols:
        return pd.DataFrame()

    game_id_col = pick_col(cols, ["game_id", "GAME_ID"])
    game_date_col = pick_col(cols, ["game_date", "GAME_DATE"])
    if not game_id_col or not game_date_col:
        print(f"⚠️ {source_schema}.{source_table} no tiene game_id/game_date.")
        return pd.DataFrame()

    season_col = pick_col(cols, ["season", "SEASON"])
    season_type_col = pick_col(cols, ["season_type", "SEASON_TYPE"])

    season_filter = f"AND {qi(season_col)} = :season" if season_col else ""
    season_expr = f"MAX({qi(season_col)})::text" if season_col else ":season"
    season_type_expr = f"COALESCE(MAX({qi(season_type_col)})::text, 'Unknown')" if season_type_col else "'Unknown'"

    sql = f"""
        SELECT
            {qi(game_id_col)}::text AS game_id,
            MIN({qi(game_date_col)})::date AS game_date,
            {season_expr} AS season,
            {season_type_expr} AS season_type
        FROM {qi(source_schema)}.{qi(source_table)}
        WHERE {qi(game_date_col)}::date BETWEEN :start AND :end
        {season_filter}
        GROUP BY {qi(game_id_col)}
        ORDER BY MIN({qi(game_date_col)})::date, {qi(game_id_col)}::text
    """
    with engine.begin() as conn:
        df = pd.read_sql(text(sql), conn, params={"start": start.isoformat(), "end": end.isoformat(), "season": season})

    if df.empty:
        return df

    df["game_id"] = df["game_id"].astype(str).str.zfill(10)
    df["game_date"] = pd.to_datetime(df["game_date"]).dt.date
    df["season"] = season
    df["season_type"] = df.apply(
        lambda r: r["season_type"] if pd.notna(r.get("season_type")) and r.get("season_type") != "Unknown"
        else infer_season_type_from_game_id(r["game_id"], r["game_date"]),
        axis=1,
    )
    return df


def fetch_roster_from_db(engine, source_schema: str, source_table: str, game_id: str) -> pd.DataFrame:
    cols = table_columns(engine, source_schema, source_table)
    game_id_col = pick_col(cols, ["game_id", "GAME_ID"])
    player_id_col = pick_col(cols, ["player_id", "PLAYER_ID", "person_id", "PERSON_ID"])
    if not game_id_col or not player_id_col:
        return pd.DataFrame(columns=["player_id", "player_name", "team_id", "team_abbreviation", "min_text"])

    player_name_expr = sql_expr_for_col(cols, ["player_name", "PLAYER_NAME", "name"], "''::text", "::text")
    team_id_expr = sql_expr_for_col(cols, ["team_id", "TEAM_ID"], "NULL::bigint", "::bigint")
    team_abbr_expr = sql_expr_for_col(cols, ["team_abbreviation", "TEAM_ABBREVIATION", "team_abbr", "TEAM_ABBR", "team_tricode", "TEAM_TRICODE"], "''::text", "::text")
    min_expr = sql_expr_for_col(cols, ["min_text", "minutes", "MIN", "min"], "NULL::text", "::text")

    sql = f"""
        SELECT DISTINCT
            {qi(player_id_col)}::bigint AS player_id,
            MAX({player_name_expr}) AS player_name,
            MAX({team_id_expr}) AS team_id,
            MAX({team_abbr_expr}) AS team_abbreviation,
            MAX({min_expr}) AS min_text
        FROM {qi(source_schema)}.{qi(source_table)}
        WHERE {qi(game_id_col)}::text = :game_id
        GROUP BY {qi(player_id_col)}::bigint
        ORDER BY player_id
    """
    with engine.begin() as conn:
        df = pd.read_sql(text(sql), conn, params={"game_id": str(game_id).zfill(10)})

    if df.empty:
        return df
    df["player_id"] = pd.to_numeric(df["player_id"], errors="coerce").astype("Int64")
    df = df[pd.notna(df["player_id"])].copy()
    df["player_id"] = df["player_id"].astype("int64")
    df["player_name"] = df["player_name"].fillna("").astype(str)
    df["team_abbreviation"] = df["team_abbreviation"].fillna("").astype(str)
    if "min_text" not in df.columns:
        df["min_text"] = None
    return df


def _is_played_minutes(value) -> bool:
    if value is None or pd.isna(value):
        return False
    s = str(value).strip()
    if not s or s.lower() in {"nan", "none", "null"}:
        return False
    # Acepta formatos como 12:34, PT12M34.00S o números.
    return True


def _normalize_boxscore_roster_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte un frame de BoxScoreTraditionalV2/V3 en roster de jugadores que jugaron."""
    if df is None or df.empty:
        return pd.DataFrame(columns=["player_id", "player_name", "team_id", "team_abbreviation", "min_text"])

    cols = list(df.columns)
    player_id_col = pick_col(cols, ["personId", "PERSON_ID", "PLAYER_ID", "playerId", "athlete_id"])
    if not player_id_col:
        return pd.DataFrame(columns=["player_id", "player_name", "team_id", "team_abbreviation", "min_text"])

    player_name_col = pick_col(cols, ["playerName", "PLAYER_NAME", "name", "athlete_name"])
    first_name_col = pick_col(cols, ["firstName", "FIRST_NAME", "first_name"])
    family_name_col = pick_col(cols, ["familyName", "FAMILY_NAME", "lastName", "LAST_NAME", "family_name"])
    team_id_col = pick_col(cols, ["teamId", "TEAM_ID", "team_id"])
    team_abbr_col = pick_col(cols, ["teamTricode", "TEAM_TRICODE", "teamAbbreviation", "TEAM_ABBREVIATION", "TEAM_ABBR", "team_abbr"])
    min_col = pick_col(cols, ["minutes", "MIN", "min", "MINUTES", "timePlayed", "TIME_PLAYED"])
    comment_col = pick_col(cols, ["comment", "COMMENT", "status", "STATUS"])

    rows = []
    stat_aliases = [
        ["points", "PTS"], ["reboundsTotal", "REB"], ["assists", "AST"],
        ["fieldGoalsAttempted", "FGA"], ["threePointersAttempted", "FG3A"], ["freeThrowsAttempted", "FTA"],
        ["steals", "STL"], ["blocks", "BLK"], ["turnovers", "TO", "TOV"], ["foulsPersonal", "PF"],
    ]
    stat_cols = [pick_col(cols, aliases) for aliases in stat_aliases]

    for _, r in df.iterrows():
        pid = safe_int(r.get(player_id_col))
        if pid is None or pid <= 0 or pid >= 1610600000:
            continue

        min_text = str(r.get(min_col)).strip() if min_col and not pd.isna(r.get(min_col)) else None
        comment = str(r.get(comment_col)).strip().lower() if comment_col and not pd.isna(r.get(comment_col)) else ""
        has_stats = any((safe_int(r.get(c), 0) or 0) != 0 for c in stat_cols if c)
        played = _is_played_minutes(min_text) or has_stats
        if comment and not played:
            # DNP, inactive, not with team, etc. No se cuenta como under.
            continue
        if not played:
            continue

        if player_name_col:
            pname = str(r.get(player_name_col) or "").strip()
        else:
            first = str(r.get(first_name_col) or "").strip() if first_name_col else ""
            fam = str(r.get(family_name_col) or "").strip() if family_name_col else ""
            pname = f"{first} {fam}".strip()

        rows.append({
            "player_id": pid,
            "player_name": pname,
            "team_id": safe_int(r.get(team_id_col)) if team_id_col else None,
            "team_abbreviation": str(r.get(team_abbr_col) or "").strip() if team_abbr_col else "",
            "min_text": min_text,
        })

    out = pd.DataFrame(rows, columns=["player_id", "player_name", "team_id", "team_abbreviation", "min_text"])
    if out.empty:
        return out
    out = out.drop_duplicates(subset=["player_id"]).copy()
    return out


def fetch_roster_from_nba_boxscore(game_id: str) -> pd.DataFrame:
    """Fallback: trae roster real del boxscore para completar jugadores con cero en splits."""
    gid = str(game_id).zfill(10)

    # V3 primero. Sirve para roster aunque no lo usemos para stats por periodo.
    if boxscoretraditionalv3 is not None:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                box = boxscoretraditionalv3.BoxScoreTraditionalV3(
                    game_id=gid,
                    start_period=0,
                    end_period=0,
                    headers=HEADERS,
                    timeout=REQUEST_TIMEOUT,
                )
                frames = box.get_data_frames()
                candidates = []
                for frame in frames or []:
                    roster = _normalize_boxscore_roster_frame(frame)
                    if not roster.empty:
                        candidates.append(roster)
                if candidates:
                    out = pd.concat(candidates, ignore_index=True).drop_duplicates(subset=["player_id"])
                    return out
            except Exception as e:
                print(f"   X error roster BoxScoreV3 game={gid} intento {attempt}: {e}")
                backoff_sleep(attempt)

    # Fallback V2.
    if boxscoretraditionalv2 is not None:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                box = boxscoretraditionalv2.BoxScoreTraditionalV2(
                    game_id=gid,
                    start_period=0,
                    end_period=0,
                    headers=HEADERS,
                    timeout=REQUEST_TIMEOUT,
                )
                frames = box.get_data_frames()
                candidates = []
                for frame in frames or []:
                    roster = _normalize_boxscore_roster_frame(frame)
                    if not roster.empty:
                        candidates.append(roster)
                if candidates:
                    out = pd.concat(candidates, ignore_index=True).drop_duplicates(subset=["player_id"])
                    return out
            except Exception as e:
                print(f"   X error roster BoxScoreV2 game={gid} intento {attempt}: {e}")
                backoff_sleep(attempt)

    return pd.DataFrame(columns=["player_id", "player_name", "team_id", "team_abbreviation", "min_text"])


def fetch_roster_for_game(engine, source_schema: str, source_table: str, game_id: str) -> pd.DataFrame:
    roster = fetch_roster_from_db(engine, source_schema, source_table, game_id)
    if not roster.empty:
        print(f"   👥 roster DB: {len(roster)} jugadores")
        return roster

    print("   ⚠️ Roster vacío desde DB. Buscando roster con BoxScore NBA...")
    roster = fetch_roster_from_nba_boxscore(game_id)
    if roster.empty:
        print("   ⚠️ Roster BoxScore vacío. Se crearán filas solo para jugadores detectados en PBP.")
    else:
        print(f"   👥 roster BoxScore NBA: {len(roster)} jugadores")
    return roster


def fetch_games_from_nba(season: str, start: date, end: date) -> pd.DataFrame:
    print("📡 Buscando calendario con LeagueGameFinder...")
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            finder = leaguegamefinder.LeagueGameFinder(
                season_nullable=season,
                league_id_nullable=LEAGUE_ID,
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            df = finder.get_data_frames()[0]
            if df.empty:
                return pd.DataFrame()

            df = df.drop_duplicates(subset=["GAME_ID"]).copy()
            df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
            df = df[(df["GAME_DATE"] >= start) & (df["GAME_DATE"] <= end)].copy()
            if df.empty:
                return pd.DataFrame()

            out = df[["GAME_ID", "GAME_DATE"]].copy()
            out.rename(columns={"GAME_ID": "game_id", "GAME_DATE": "game_date"}, inplace=True)
            out["game_id"] = out["game_id"].astype(str).str.zfill(10)
            out["season"] = season
            out["season_type"] = out.apply(lambda r: infer_season_type_from_game_id(r["game_id"], r["game_date"]), axis=1)
            return out.sort_values(["game_date", "game_id"]).reset_index(drop=True)
        except Exception as e:
            print(f"   X Error calendario NBA intento {attempt}: {e}")
            backoff_sleep(attempt)
    return pd.DataFrame()


def existing_split_counts(engine, target_schema: str, target_table: str, game_id: str) -> Dict[str, int]:
    sql = f"""
        SELECT split_code, COUNT(*) AS rows
        FROM {qi(target_schema)}.{qi(target_table)}
        WHERE game_id = :game_id
        GROUP BY split_code
    """
    with engine.begin() as conn:
        rows = conn.execute(text(sql), {"game_id": str(game_id).zfill(10)}).fetchall()
    return {r[0]: int(r[1]) for r in rows}


def upsert_period_splits(engine, df: pd.DataFrame, target_schema: str, target_table: str) -> int:
    if df.empty:
        return 0

    records = df[UPSERT_COLS].copy()
    records["game_date"] = pd.to_datetime(records["game_date"]).dt.strftime("%Y-%m-%d")
    records = records.where(pd.notnull(records), None)
    payload = records.to_dict("records")

    cols_sql = ", ".join(qi(c) for c in UPSERT_COLS)
    vals_sql = ", ".join([f":{c}" for c in UPSERT_COLS])
    update_cols = [c for c in UPSERT_COLS if c not in ["game_id", "player_id", "split_code"]]
    update_sql = ",\n            ".join([f"{qi(c)} = EXCLUDED.{qi(c)}" for c in update_cols])

    sql = f"""
        INSERT INTO {qi(target_schema)}.{qi(target_table)} AS current_row ({cols_sql})
        VALUES ({vals_sql})
        ON CONFLICT (game_id, player_id, split_code)
        DO UPDATE SET
            {update_sql},
            updated_at = now()
        WHERE ROW({', '.join('current_row.' + qi(c) for c in update_cols)})
          IS DISTINCT FROM ROW({', '.join('EXCLUDED.' + qi(c) for c in update_cols)})
    """
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        conn.execute(text("SET LOCAL statement_timeout = '120s'"))
        result = conn.execute(text(sql), payload)
        changed = result.rowcount
    return changed


# =========================================================
# PLAY-BY-PLAY PARSER
# =========================================================
def strip_accents(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(ch))


def norm_name_key(s: str) -> str:
    s = strip_accents(str(s)).lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def last_name_key(s: str) -> str:
    key = norm_name_key(s)
    if not key:
        return ""
    return key.split()[-1]


def clean_desc_name(s: str) -> str:
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\.?\b", "", str(s), flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def pbp_col(df: pd.DataFrame, aliases: List[str]) -> Optional[str]:
    lookup = {norm_col(c): c for c in df.columns}
    for a in aliases:
        key = norm_col(a)
        if key in lookup:
            return lookup[key]
    return None


def row_get(row: pd.Series, col: Optional[str], default=None):
    if not col:
        return default
    try:
        v = row.get(col, default)
    except Exception:
        return default
    return default if pd.isna(v) else v


def safe_int(v, default: Optional[int] = None) -> Optional[int]:
    try:
        if pd.isna(v):
            return default
        return int(float(v))
    except Exception:
        return default


def fetch_pbp(game_id: str) -> pd.DataFrame:
    gid = str(game_id).zfill(10)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            pbp = playbyplayv3.PlayByPlayV3(
                game_id=gid,
                start_period=0,
                end_period=0,
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            frames = pbp.get_data_frames()
            if not frames:
                return pd.DataFrame()
            return frames[0]
        except Exception as e:
            print(f"   X error PBP game={gid} intento {attempt}: {e}")
            backoff_sleep(attempt)
    return pd.DataFrame()


def build_name_maps(pbp: pd.DataFrame, roster: pd.DataFrame) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Optional[Dict[str, Any]]]]:
    """Devuelve mapa por nombre completo y por apellido. Si el apellido es ambiguo queda None."""
    people: Dict[int, Dict[str, Any]] = {}

    for _, r in roster.iterrows():
        pid = safe_int(r.get("player_id"))
        if pid is None:
            continue
        people[pid] = {
            "pid": pid,
            "name": str(r.get("player_name") or ""),
            "tid": safe_int(r.get("team_id")),
            "tabbr": str(r.get("team_abbreviation") or ""),
        }

    if not pbp.empty:
        pid_cols = [pbp_col(pbp, aliases) for aliases in [
            ["personId", "PERSONID", "PLAYER1_ID", "player1_id"],
            ["player2Id", "PLAYER2_ID", "personId2", "PERSONID2"],
            ["player3Id", "PLAYER3_ID", "personId3", "PERSONID3"],
        ]]
        name_cols = [pbp_col(pbp, aliases) for aliases in [
            ["playerName", "PLAYERNAME", "PLAYER1_NAME", "player1_name"],
            ["player2Name", "PLAYER2_NAME", "player2_name"],
            ["player3Name", "PLAYER3_NAME", "player3_name"],
        ]]
        team_cols = [pbp_col(pbp, aliases) for aliases in [
            ["teamId", "TEAMID", "PLAYER1_TEAM_ID", "player1_team_id"],
            ["player2TeamId", "PLAYER2_TEAM_ID", "player2_team_id"],
            ["player3TeamId", "PLAYER3_TEAM_ID", "player3_team_id"],
        ]]
        abbr_cols = [pbp_col(pbp, aliases) for aliases in [
            ["teamTricode", "TEAMTRICODE", "teamAbbreviation", "TEAM_ABBREVIATION"],
            ["player2TeamTricode", "PLAYER2_TEAM_TRICODE", "player2_team_abbreviation"],
            ["player3TeamTricode", "PLAYER3_TEAM_TRICODE", "player3_team_abbreviation"],
        ]]

        for _, row in pbp.iterrows():
            for i in range(3):
                pid = safe_int(row_get(row, pid_cols[i], None))
                if pid is None or pid <= 0 or pid >= 1610600000:
                    continue
                name = str(row_get(row, name_cols[i], "") or "").strip()
                if not name or name.lower() in ["none", "nan"]:
                    name = people.get(pid, {}).get("name", "")
                if pid not in people:
                    people[pid] = {
                        "pid": pid,
                        "name": name,
                        "tid": safe_int(row_get(row, team_cols[i], None)),
                        "tabbr": str(row_get(row, abbr_cols[i], "") or ""),
                    }
                else:
                    if name and not people[pid].get("name"):
                        people[pid]["name"] = name
                    if not people[pid].get("tid"):
                        people[pid]["tid"] = safe_int(row_get(row, team_cols[i], None))
                    if not people[pid].get("tabbr"):
                        people[pid]["tabbr"] = str(row_get(row, abbr_cols[i], "") or "")

    full_map: Dict[str, Dict[str, Any]] = {}
    last_map: Dict[str, Optional[Dict[str, Any]]] = {}
    for p in people.values():
        name = p.get("name", "")
        if not name:
            continue
        full_key = norm_name_key(name)
        last_key = last_name_key(name)
        if full_key:
            full_map[full_key] = p
        if last_key:
            if last_key in last_map and last_map[last_key] and last_map[last_key]["pid"] != p["pid"]:
                last_map[last_key] = None  # apellido ambiguo
            else:
                last_map[last_key] = p
    return full_map, last_map


def extract_parenthetical_player(desc: str, stat_token: str, full_map: Dict[str, Dict[str, Any]], last_map: Dict[str, Optional[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """Busca patrones tipo '(Chris Paul 5 AST)' o '(Jalen Williams STL)' en la descripción."""
    if not desc:
        return None
    d = clean_desc_name(desc)
    # Primero intenta nombre + número + token, ej: (Chris Paul 5 AST)
    patterns = [
        rf"\(([^()]+?)\s+\d+\s+{stat_token}\)",
        rf"\(([^()]+?)\s+{stat_token}\)",
    ]
    for pat in patterns:
        m = re.search(pat, d, flags=re.I)
        if not m:
            continue
        raw_name = clean_desc_name(m.group(1))
        full_key = norm_name_key(raw_name)
        if full_key in full_map:
            return full_map[full_key]
        last_key = last_name_key(raw_name)
        if last_key and last_map.get(last_key) is not None:
            return last_map.get(last_key)
    return None


def seed_records(game_id: str, game_date: date, season: str, season_type: str, split_codes: List[str], roster: pd.DataFrame) -> Dict[Tuple[int, str], Dict[str, Any]]:
    records: Dict[Tuple[int, str], Dict[str, Any]] = {}
    for split_code in split_codes:
        start_period, end_period = SPLIT_MAP[split_code]
        for _, r in roster.iterrows():
            pid = safe_int(r.get("player_id"))
            if pid is None or pid <= 0 or pid >= 1610600000:
                continue
            rec = {
                "game_id": str(game_id).zfill(10),
                "game_date": game_date,
                "season": season,
                "season_type": season_type,
                "split_code": split_code,
                "start_period": start_period,
                "end_period": end_period,
                "team_id": safe_int(r.get("team_id")),
                "team_abbreviation": str(r.get("team_abbreviation") or ""),
                "player_id": pid,
                "player_name": str(r.get("player_name") or ""),
                "min_text": r.get("min_text") if "min_text" in r.index else None,
            }
            for c in NUMERIC_COLS:
                rec[c] = 0
            records[(pid, split_code)] = rec
    return records


def get_or_create_record(records: Dict[Tuple[int, str], Dict[str, Any]], game_id: str, game_date: date, season: str, season_type: str,
                         split_code: str, pid: int, name: str = "", team_id=None, team_abbr: str = "") -> Dict[str, Any]:
    key = (int(pid), split_code)
    if key not in records:
        start_period, end_period = SPLIT_MAP[split_code]
        rec = {
            "game_id": str(game_id).zfill(10),
            "game_date": game_date,
            "season": season,
            "season_type": season_type,
            "split_code": split_code,
            "start_period": start_period,
            "end_period": end_period,
            "team_id": safe_int(team_id),
            "team_abbreviation": str(team_abbr or ""),
            "player_id": int(pid),
            "player_name": str(name or ""),
            "min_text": None,
        }
        for c in NUMERIC_COLS:
            rec[c] = 0
        records[key] = rec
    else:
        rec = records[key]
        if name and not rec.get("player_name"):
            rec["player_name"] = str(name)
        if team_id and not rec.get("team_id"):
            rec["team_id"] = safe_int(team_id)
        if team_abbr and not rec.get("team_abbreviation"):
            rec["team_abbreviation"] = str(team_abbr)
    return records[key]


def is_three(desc: str, row: pd.Series, shot_value_col: Optional[str]) -> bool:
    sv = safe_int(row_get(row, shot_value_col, None))
    if sv == 3:
        return True
    d = desc.lower()
    return "3pt" in d or "3-pt" in d or "three point" in d or "3 point" in d


def parse_pbp_to_splits(pbp: pd.DataFrame, roster: pd.DataFrame, game_id: str, game_date: date, season: str, season_type: str,
                        split_codes: List[str]) -> pd.DataFrame:
    if pbp.empty:
        return pd.DataFrame(columns=UPSERT_COLS)

    records = seed_records(game_id, game_date, season, season_type, split_codes, roster)
    full_map, last_map = build_name_maps(pbp, roster)

    period_col = pbp_col(pbp, ["period", "PERIOD"])
    action_col = pbp_col(pbp, ["actionType", "ACTIONTYPE", "action_type", "EVENTMSGTYPE"])
    subtype_col = pbp_col(pbp, ["subType", "SUBTYPE", "sub_type", "EVENTMSGACTIONTYPE"])
    desc_col = pbp_col(pbp, ["description", "DESCRIPTION", "HOMEDESCRIPTION", "VISITORDESCRIPTION", "NEUTRALDESCRIPTION"])
    pid_col = pbp_col(pbp, ["personId", "PERSONID", "PLAYER1_ID", "player1_id"])
    pname_col = pbp_col(pbp, ["playerName", "PLAYERNAME", "PLAYER1_NAME", "player1_name"])
    team_id_col = pbp_col(pbp, ["teamId", "TEAMID", "PLAYER1_TEAM_ID", "player1_team_id"])
    team_abbr_col = pbp_col(pbp, ["teamTricode", "TEAMTRICODE", "teamAbbreviation", "TEAM_ABBREVIATION"])
    shot_value_col = pbp_col(pbp, ["shotValue", "SHOTVALUE", "shot_value"])

    if not period_col:
        print("   ⚠️ PBP sin columna period. Columnas:", list(pbp.columns))
        return pd.DataFrame(columns=UPSERT_COLS)

    requested_ranges = {s: SPLIT_MAP[s] for s in split_codes}

    for _, row in pbp.iterrows():
        period = safe_int(row_get(row, period_col, None))
        if period is None:
            continue
        active_splits = [s for s, (a, b) in requested_ranges.items() if a <= period <= b]
        if not active_splits:
            continue

        action = str(row_get(row, action_col, "") or "").lower().strip()
        subtype = str(row_get(row, subtype_col, "") or "").lower().strip()
        desc = str(row_get(row, desc_col, "") or "")
        desc_l = desc.lower()

        pid = safe_int(row_get(row, pid_col, None))
        pname = str(row_get(row, pname_col, "") or "")
        tid = safe_int(row_get(row, team_id_col, None))
        tabbr = str(row_get(row, team_abbr_col, "") or "")

        def rec_for_player(player_id: Optional[int], name: str = pname, team_id=tid, team_abbr=tabbr, split_code: str = ""):
            if player_id is None or player_id <= 0 or player_id >= 1610600000:
                return None
            return get_or_create_record(records, game_id, game_date, season, season_type, split_code, player_id, name, team_id, team_abbr)

        made_shot = action == "made shot" or "made shot" in action
        missed_shot = action == "missed shot" or "missed shot" in action or action == "miss"
        free_throw = action == "free throw" or "free throw" in action or "free throw" in desc_l
        rebound = action == "rebound" or "rebound" in action
        turnover = action == "turnover" or "turnover" in action
        foul = action == "foul" or "foul" in action

        for split_code in active_splits:
            if made_shot or missed_shot:
                r = rec_for_player(pid, split_code=split_code)
                if r is not None:
                    r["fga"] += 1
                    if is_three(desc, row, shot_value_col):
                        r["fg3a"] += 1
                    if made_shot:
                        r["fgm"] += 1
                        if is_three(desc, row, shot_value_col):
                            r["fg3m"] += 1
                            r["pts"] += 3
                        else:
                            r["pts"] += 2

                # Asistencia asociada a un tiro convertido.
                if made_shot:
                    ast_p = extract_parenthetical_player(desc, "AST", full_map, last_map)
                    if ast_p:
                        ar = get_or_create_record(records, game_id, game_date, season, season_type, split_code,
                                                  ast_p["pid"], ast_p.get("name", ""), ast_p.get("tid"), ast_p.get("tabbr", ""))
                        ar["ast"] += 1

                # Bloque asociada a tiro fallado.
                blk_p = extract_parenthetical_player(desc, "BLK", full_map, last_map)
                if blk_p:
                    br = get_or_create_record(records, game_id, game_date, season, season_type, split_code,
                                              blk_p["pid"], blk_p.get("name", ""), blk_p.get("tid"), blk_p.get("tabbr", ""))
                    br["blk"] += 1

            elif free_throw:
                r = rec_for_player(pid, split_code=split_code)
                if r is not None:
                    # Evita eventos administrativos raros sin jugador real.
                    r["fta"] += 1
                    if "miss" not in desc_l and "missed" not in desc_l:
                        # En NBA PBP, el FT anotado muchas veces no dice 'made', simplemente no dice MISS.
                        r["ftm"] += 1
                        r["pts"] += 1

            elif rebound:
                r = rec_for_player(pid, split_code=split_code)
                if r is not None:
                    r["reb"] += 1
                    if "offensive" in subtype or "offensive rebound" in desc_l or "oreb" in desc_l:
                        r["oreb"] += 1
                    else:
                        r["dreb"] += 1

            elif turnover:
                r = rec_for_player(pid, split_code=split_code)
                if r is not None:
                    r["tov"] += 1
                stl_p = extract_parenthetical_player(desc, "STL", full_map, last_map)
                if stl_p:
                    sr = get_or_create_record(records, game_id, game_date, season, season_type, split_code,
                                              stl_p["pid"], stl_p.get("name", ""), stl_p.get("tid"), stl_p.get("tabbr", ""))
                    sr["stl"] += 1

            elif foul:
                r = rec_for_player(pid, split_code=split_code)
                if r is not None:
                    r["pf"] += 1

    df = pd.DataFrame(list(records.values()))
    if df.empty:
        return pd.DataFrame(columns=UPSERT_COLS)

    # Limpieza final.
    for c in NUMERIC_COLS:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    df["player_id"] = pd.to_numeric(df["player_id"], errors="coerce")
    df = df[pd.notna(df["player_id"])].copy()
    df["player_id"] = df["player_id"].astype("int64")
    df = df[df["player_id"] < 1610600000].copy()

    # Una fila por game/player/split.
    return df[UPSERT_COLS].drop_duplicates(subset=["game_id", "player_id", "split_code"])


# =========================================================
# MAIN
# =========================================================
def main() -> None:
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    parser = argparse.ArgumentParser(description="Carga Q1/H1/H2_REG reales por jugador usando PlayByPlayV3")
    parser.add_argument("--season", default=os.getenv("NBA_SEASON", "2026-27"))
    parser.add_argument("--start", default=os.getenv("PERIOD_SPLITS_START", REGULAR_START))
    parser.add_argument("--end", default=os.getenv("PERIOD_SPLITS_END", yesterday))
    parser.add_argument("--splits", default=os.getenv("PERIOD_SPLITS", "Q1,H1,H2_REG"), help="Ej: Q1,H1,H2_REG")
    parser.add_argument("--source", choices=["auto", "db", "nba"], default=os.getenv("PERIOD_SPLITS_SOURCE", "auto"))
    parser.add_argument("--source-schema", default=os.getenv("PERIOD_SOURCE_SCHEMA", "nba_api_data"))
    parser.add_argument("--source-table", default=os.getenv("PERIOD_SOURCE_TABLE", "player_game_logs_v2"))
    parser.add_argument("--target-schema", default=os.getenv("PERIOD_TARGET_SCHEMA", "nba_api_data"))
    parser.add_argument("--target-table", default=os.getenv("PERIOD_TARGET_TABLE", "player_period_splits_v2"))
    parser.add_argument("--min-existing-rows", type=int, default=int(os.getenv("PERIOD_MIN_EXISTING_ROWS", "8")))
    parser.add_argument("--limit-games", type=int, default=0, help="Para prueba: procesa solo N partidos")
    parser.add_argument("--force", action="store_true", help="Reprocesa aunque ya existan filas")
    parser.add_argument("--dry-run", action="store_true", help="Muestra qué procesaría sin llamar NBA ni insertar")
    args = parser.parse_args()

    season = args.season
    start = parse_date(args.start)
    end = parse_date(args.end)
    split_codes = [s.strip().upper() for s in args.splits.split(",") if s.strip()]

    invalid = [s for s in split_codes if s not in SPLIT_MAP]
    if invalid:
        raise ValueError(f"Splits inválidos: {invalid}. Válidos: {list(SPLIT_MAP)}")

    print("===========================================================")
    print("🔄 DAILY PERIOD SPLITS PBP - Q1 / H1 / H2 reales")
    print("===========================================================")
    print(f"Temporada: {season}")
    print(f"Rango: {start} a {end}")
    print(f"Splits: {split_codes}")
    print(f"Destino: {args.target_schema}.{args.target_table}")
    print(f"Fuente partidos/roster: {args.source_schema}.{args.source_table}")
    print("Método: PlayByPlayV3 reconstruido")

    engine = make_engine()
    ensure_table(engine, args.target_schema, args.target_table)

    games = pd.DataFrame()
    if args.source in ["auto", "db"]:
        print(f"📚 Buscando partidos en {args.source_schema}.{args.source_table}...")
        games = fetch_games_from_db(engine, args.source_schema, args.source_table, season, start, end)
        print(f"   -> partidos DB: {len(games)}")
        if games.empty and args.source == "db":
            print("❌ No encontré partidos en DB. Probá --source nba")
            return

    if games.empty and args.source in ["auto", "nba"]:
        games = fetch_games_from_nba(season, start, end)
        print(f"   -> partidos NBA: {len(games)}")

    if games.empty:
        print("😴 No hay partidos para procesar en ese rango.")
        return

    games = games.sort_values(["game_date", "game_id"]).reset_index(drop=True)
    if args.limit_games and args.limit_games > 0:
        games = games.head(args.limit_games).copy()

    print(f"✅ Partidos candidatos: {len(games)}")
    print(games.groupby("game_date").size().tail(20).to_string())

    total_inserted = 0
    total_targets = 0
    skipped_games = 0

    for idx, row in enumerate(games.itertuples(index=False), start=1):
        gid = str(row.game_id).zfill(10)
        gdate = row.game_date
        stype = row.season_type or infer_season_type_from_game_id(gid, gdate)

        counts = existing_split_counts(engine, args.target_schema, args.target_table, gid)
        enough = all(counts.get(s, 0) >= args.min_existing_rows for s in split_codes)
        if enough and not args.force:
            skipped_games += 1
            print(f"[{idx}/{len(games)}] {gdate} game={gid} OK ya existe")
            continue

        print(f"[{idx}/{len(games)}] {gdate} game={gid} {stype} -> reconstruyendo {split_codes}")
        total_targets += len(split_codes)

        if args.dry_run:
            continue

        roster = fetch_roster_for_game(engine, args.source_schema, args.source_table, gid)

        pbp = fetch_pbp(gid)
        if pbp.empty:
            raise RuntimeError(f'PBP vacío para {gid}: se detiene la cadena; reintentar este rango.')

        clean = parse_pbp_to_splits(pbp, roster, gid, gdate, season, stype, split_codes)
        if clean.empty:
            raise RuntimeError(f'Parciales normalizados vacíos para {gid}: se detiene la cadena.')

        inserted = upsert_period_splits(engine, clean, args.target_schema, args.target_table)
        total_inserted += inserted
        by_split = clean.groupby("split_code").size().to_dict()
        print(f"   💾 upsert {inserted} filas | {by_split}")
        random_sleep()

    print("\n===========================================================")
    print("🏁 RESUMEN")
    print("===========================================================")
    print(f"Partidos omitidos por ya existir: {skipped_games}")
    print(f"Targets procesados: {total_targets}")
    print(f"Filas insertadas/actualizadas: {total_inserted}")
    print(f"Tabla destino: {args.target_schema}.{args.target_table}")


if __name__ == "__main__":
    main()
