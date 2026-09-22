#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
daily_pot_completo.py

Carga POTENTIAL_AST de NBA Passing Tracking a Postgres de forma segura.

Qué hace:
1) Puede tomar datos desde:
   - stats.nba.com, como daily_pot.py original;
   - un CSV existente con columnas tipo game_date/player_id/potential_ast;
   - una tabla ya existente en Postgres con esas columnas.

2) Guarda TODO en una tabla staging:
   nba_api_data.player_tracking_passing_daily

3) Intenta actualizar las tablas reales existentes:
   public.player_game_logs
   nba_api_data.player_game_logs_v2

Importante:
- NO inserta filas incompletas en player_game_logs.
- Si no existe la fila base en player_game_logs, deja el dato guardado en staging
  y lo reporta como sin match.
- Cuando después cargues los logs base, podés volver a correr con --from-stage
  para aplicar lo que quedó guardado.

Dependencias:
  pip install pandas curl_cffi python-dotenv psycopg2-binary

Ejemplos:

  # Subir un CSV que ya tenés y aplicar a las tablas reales
  python3 daily_pot_completo.py \
    --input-csv outputs_tracking/potential_ast_sin_match_20260514_111618.csv \
    --upload-db \
    --targets public.player_game_logs,nba_api_data.player_game_logs_v2 \
    --only-missing \
    --skip-zero

  # Daily normal: descargar de NBA, guardar staging y actualizar tablas
  python3 daily_pot_completo.py \
    --upload-db \
    --season-types "Regular Season,Playoffs,PlayIn" \
    --lookback-days 3 \
    --targets public.player_game_logs,nba_api_data.player_game_logs_v2 \
    --only-missing \
    --skip-zero

  # Reintentar aplicar desde staging, sin volver a descargar
  python3 daily_pot_completo.py \
    --from-stage \
    --upload-db \
    --start-date 2026-05-11 \
    --end-date 2026-05-13 \
    --targets public.player_game_logs,nba_api_data.player_game_logs_v2 \
    --only-missing \
    --skip-zero

  # Usar una tabla fuente que ya tengas en Postgres
  python3 daily_pot_completo.py \
    --source-table nba_api_data.player_tracking_passing_daily \
    --upload-db \
    --start-date 2026-05-11 \
    --end-date 2026-05-13 \
    --targets public.player_game_logs,nba_api_data.player_game_logs_v2 \
    --only-missing \
    --skip-zero
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse
from zoneinfo import ZoneInfo

import pandas as pd
from dotenv import load_dotenv

try:
    from curl_cffi import requests
except ImportError:
    requests = None

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import execute_values, RealDictCursor
except ImportError:
    psycopg2 = None
    sql = None
    execute_values = None
    RealDictCursor = None


NBA_URL = "https://stats.nba.com/stats/leaguedashptstats"

NBA_HEADERS = {
    "Host": "stats.nba.com",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
}

VALID_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
BAD_URL_QUERY_KEYS = {"pgbouncer", "connection_limit", "pool_timeout"}


# ============================================================
# Logging / helpers
# ============================================================

def log(msg: str) -> None:
    print(msg, flush=True)


def validate_identifier(value: str, label: str) -> str:
    if not VALID_IDENTIFIER.match(value):
        raise ValueError(f"{label} inválido: {value!r}")
    return value


def split_table_name(value: str, default_schema: str = "public") -> Tuple[str, str]:
    parts = [p.strip() for p in value.split(".") if p.strip()]
    if len(parts) == 1:
        schema, table = default_schema, parts[0]
    elif len(parts) == 2:
        schema, table = parts
    else:
        raise ValueError(f"Nombre de tabla inválido: {value!r}. Usá schema.table")
    return validate_identifier(schema, "schema"), validate_identifier(table, "table")


def table_sql(schema: str, table: str) -> sql.Composed:
    validate_identifier(schema, "schema")
    validate_identifier(table, "table")
    return sql.SQL("{}.{}").format(sql.Identifier(schema), sql.Identifier(table))


def parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def date_range(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def nba_date(d: date) -> str:
    return d.strftime("%m/%d/%Y")


def clean_env_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip().strip('"').strip("'")
    return value or None


def norm_col(col: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(col).strip().lower()).strip("_")


def pick_col(df: pd.DataFrame, candidates: List[str], required: bool = False) -> Optional[str]:
    normalized = {norm_col(c): c for c in df.columns}
    for cand in candidates:
        key = norm_col(cand)
        if key in normalized:
            return normalized[key]
    if required:
        raise RuntimeError(
            f"No encontré columna requerida {candidates}. Columnas disponibles: {list(df.columns)}"
        )
    return None


def to_int_or_none(value) -> Optional[int]:
    if pd.isna(value):
        return None
    try:
        return int(value)
    except Exception:
        return None


def to_float_or_none(value) -> Optional[float]:
    if pd.isna(value):
        return None
    try:
        return float(value)
    except Exception:
        return None


# ============================================================
# Env / DB
# ============================================================

def load_env_files() -> None:
    load_dotenv(".env.local", override=False)
    load_dotenv(".env", override=False)


def db_config_from_parts() -> Optional[Dict[str, object]]:
    host = clean_env_value(os.getenv("DB_HOST") or os.getenv("POSTGRES_HOST"))
    user = clean_env_value(
        os.getenv("DB_USER")
        or os.getenv("DB_USERNAME")
        or os.getenv("POSTGRES_USER")
        or os.getenv("POSTGRES_USERNAME")
    )
    password = clean_env_value(
        os.getenv("DB_PASSWORD")
        or os.getenv("POSTGRES_PASSWORD")
        or os.getenv("SUPABASE_DB_PASSWORD")
    )
    dbname = clean_env_value(os.getenv("DB_NAME") or os.getenv("POSTGRES_DB") or "postgres")
    port_raw = clean_env_value(os.getenv("DB_PORT") or os.getenv("POSTGRES_PORT") or "6543")

    if not (host and user and password):
        return None

    return {
        "host": host,
        "port": int(port_raw or 6543),
        "dbname": dbname,
        "user": user,
        "password": password,
        "sslmode": "require",
    }


def db_config_from_url() -> Optional[Dict[str, object]]:
    raw = clean_env_value(os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL"))
    if not raw:
        return None

    raw = raw.replace("postgresql+psycopg2://", "postgresql://")
    raw = raw.replace("postgres+psycopg2://", "postgresql://")
    raw = raw.replace("postgres://", "postgresql://")

    parsed = urlparse(raw)
    if not parsed.hostname:
        raise RuntimeError("DATABASE_URL existe, pero no pude parsear el host.")

    query = parse_qs(parsed.query)
    cleaned_query = {k: v[-1] for k, v in query.items() if k not in BAD_URL_QUERY_KEYS}

    cfg: Dict[str, object] = {
        "host": parsed.hostname,
        "port": parsed.port or 6543,
        "dbname": (parsed.path or "/postgres").lstrip("/") or "postgres",
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "sslmode": cleaned_query.get("sslmode", "require"),
    }

    if not cfg["user"] or not cfg["password"]:
        raise RuntimeError("DATABASE_URL no trae usuario/password válidos.")

    return cfg


def get_db_config() -> Dict[str, object]:
    load_env_files()

    cfg = db_config_from_parts()
    if cfg:
        log("🔌 Conexión Postgres: usando DB_HOST/DB_USER/DB_PASSWORD")
        return cfg

    cfg = db_config_from_url()
    if cfg:
        log("🔌 Conexión Postgres: usando DATABASE_URL saneado")
        return cfg

    raise RuntimeError(
        "Faltan variables de conexión. Definí DB_HOST + DB_USER/DB_USERNAME + DB_PASSWORD "
        "o una DATABASE_URL válida."
    )


def connect_db():
    if psycopg2 is None:
        raise ImportError("Falta psycopg2. Instalá: pip install psycopg2-binary")
    return psycopg2.connect(**get_db_config())


def get_table_columns(conn, schema: str, table: str) -> List[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        return [row[0] for row in cur.fetchall()]


# ============================================================
# NBA fetch
# ============================================================

def normalize_season_types(raw: str) -> List[str]:
    aliases = {
        "play-in": "PlayIn",
        "play in": "PlayIn",
        "playin": "PlayIn",
        "Play-In": "PlayIn",
        "Play In": "PlayIn",
        "Playin": "PlayIn",
        "regular": "Regular Season",
        "regular season": "Regular Season",
        "Regular": "Regular Season",
        "playoffs": "Playoffs",
        "Playoff": "Playoffs",
        "playoff": "Playoffs",
    }

    out: List[str] = []
    for item in raw.split(","):
        value = item.strip()
        if not value:
            continue
        fixed = aliases.get(value, aliases.get(value.lower(), value))
        if fixed not in out:
            out.append(fixed)
    return out


def build_params(game_date: date, season: str, season_type: str) -> Dict[str, str]:
    return {
        "College": "",
        "Conference": "",
        "Country": "",
        "DateFrom": nba_date(game_date),
        "DateTo": nba_date(game_date),
        "Division": "",
        "DraftPick": "",
        "DraftYear": "",
        "GameScope": "",
        "Height": "",
        "LastNGames": "0",
        "LeagueID": "00",
        "Location": "",
        "Month": "0",
        "OpponentTeamID": "0",
        "Outcome": "",
        "PORound": "",
        "PerMode": "Totals",
        "PlayerExperience": "",
        "PlayerOrTeam": "Player",
        "PlayerPosition": "",
        "PtMeasureType": "Passing",
        "Season": season,
        "SeasonSegment": "",
        "SeasonType": season_type,
        "StarterBench": "",
        "TeamID": "",
        "VsConference": "",
        "VsDivision": "",
        "Weight": "",
    }


def fetch_passing_day(
    game_date: date,
    season: str,
    season_type: str,
    retries: int = 4,
    sleep_seconds: float = 1.8,
) -> pd.DataFrame:
    if requests is None:
        raise ImportError("Falta curl_cffi. Instalá: pip install curl_cffi")
    params = build_params(game_date, season, season_type)
    label = f"{game_date.isoformat()} | {season_type}"

    for attempt in range(1, retries + 1):
        try:
            log(f"📡 NBA Passing {label} | intento {attempt}/{retries}")
            response = requests.get(
                NBA_URL,
                params=params,
                headers=NBA_HEADERS,
                impersonate="chrome120",
                timeout=35,
            )

            if response.status_code != 200:
                log(f"   ❌ HTTP {response.status_code}")
                time.sleep(max(5, sleep_seconds * attempt))
                continue

            payload = response.json()
            result_sets = payload.get("resultSets") or []
            if not result_sets:
                raise RuntimeError('Respuesta POT sin resultSets; no se considera descarga vacía válida.')

            result = result_sets[0]
            rows = result.get("rowSet") or []
            headers = result.get("headers") or []

            if not rows:
                log("   ⏸️ Sin filas")
                return pd.DataFrame()

            df = pd.DataFrame(rows, columns=headers)
            df["GAME_DATE"] = game_date.isoformat()
            df["SEASON"] = season
            df["SEASON_TYPE"] = season_type

            keep = [
                "GAME_DATE",
                "SEASON",
                "SEASON_TYPE",
                "PLAYER_ID",
                "PLAYER_NAME",
                "TEAM_ID",
                "TEAM_ABBREVIATION",
                "AST",
                "POTENTIAL_AST",
                "PASSES_MADE",
                "PASSES_RECEIVED",
                "AST_POINTS_CREATED",
            ]
            keep_existing = [c for c in keep if c in df.columns]
            df = df[keep_existing].copy()

            if "PLAYER_ID" not in df.columns:
                raise RuntimeError("El endpoint no devolvió PLAYER_ID. No conviene actualizar solo por nombre.")
            if "POTENTIAL_AST" not in df.columns:
                raise RuntimeError("El endpoint no devolvió POTENTIAL_AST.")

            log(f"   ✅ Filas descargadas: {len(df)}")
            time.sleep(sleep_seconds)
            return df

        except Exception as exc:
            log(f"   ⚠️ Error: {exc}")
            time.sleep(max(5, sleep_seconds * attempt))

    log(f"   ❌ Falló definitivamente: {label}")
    raise RuntimeError(f'Falló la descarga de POT: {label}. No se confunde con un día sin datos.')


def fetch_range(
    start_date: date,
    end_date: date,
    season: str,
    season_types: List[str],
    sleep_seconds: float,
) -> pd.DataFrame:
    frames: List[pd.DataFrame] = []

    for d in date_range(start_date, end_date):
        for season_type in season_types:
            df = fetch_passing_day(
                game_date=d,
                season=season,
                season_type=season_type,
                sleep_seconds=sleep_seconds,
            )
            if not df.empty:
                frames.append(df)

    if not frames:
        return pd.DataFrame()

    return pd.concat(frames, ignore_index=True)


# ============================================================
# Input normalize
# ============================================================

def normalize_tracking_df(
    raw: pd.DataFrame,
    default_season: str,
    default_season_type: str,
) -> pd.DataFrame:
    if raw.empty:
        return pd.DataFrame()

    col_game_date = pick_col(raw, ["GAME_DATE", "game_date", "FECHA", "fecha", "date"], required=True)
    col_player_id = pick_col(raw, ["PLAYER_ID", "player_id"], required=True)
    col_potential_ast = pick_col(
        raw,
        ["POTENTIAL_AST", "potential_ast", "potential_assists", "ast_potenciales", "asistencias_potenciales"],
        required=True,
    )

    col_map = {
        "season": pick_col(raw, ["SEASON", "season"]),
        "season_type": pick_col(raw, ["SEASON_TYPE", "season_type", "tipo_temporada"]),
        "player_name": pick_col(raw, ["PLAYER_NAME", "player_name", "name", "jugador"]),
        "team_id": pick_col(raw, ["TEAM_ID", "team_id"]),
        "team_abbreviation": pick_col(raw, ["TEAM_ABBREVIATION", "team_abbreviation", "TEAM", "team"]),
        "ast": pick_col(raw, ["AST", "ast"]),
        "passes_made": pick_col(raw, ["PASSES_MADE", "passes_made"]),
        "passes_received": pick_col(raw, ["PASSES_RECEIVED", "passes_received"]),
        "ast_points_created": pick_col(raw, ["AST_POINTS_CREATED", "ast_points_created"]),
    }

    out = pd.DataFrame()
    out["game_date"] = pd.to_datetime(raw[col_game_date], errors="coerce").dt.date
    out["season"] = raw[col_map["season"]].astype(str).str.strip() if col_map["season"] else default_season
    out["season_type"] = raw[col_map["season_type"]].astype(str).str.strip() if col_map["season_type"] else default_season_type
    out["player_id"] = pd.to_numeric(raw[col_player_id], errors="coerce").astype("Int64")
    out["player_name"] = raw[col_map["player_name"]].astype(str).str.strip() if col_map["player_name"] else None
    out["team_id"] = pd.to_numeric(raw[col_map["team_id"]], errors="coerce").astype("Int64") if col_map["team_id"] else pd.Series([pd.NA] * len(raw), dtype="Int64")
    out["team_abbreviation"] = raw[col_map["team_abbreviation"]].astype(str).str.upper().str.strip() if col_map["team_abbreviation"] else None

    for target_col, source_col in [
        ("ast", col_map["ast"]),
        ("potential_ast", col_potential_ast),
        ("passes_made", col_map["passes_made"]),
        ("passes_received", col_map["passes_received"]),
        ("ast_points_created", col_map["ast_points_created"]),
    ]:
        out[target_col] = pd.to_numeric(raw[source_col], errors="coerce") if source_col else pd.NA

    before = len(out)
    out = out.dropna(subset=["game_date", "player_id", "potential_ast"]).copy()
    dropped = before - len(out)
    if dropped:
        log(f"🧹 Filas descartadas por claves/dato inválido: {dropped:,}")

    out["season"] = out["season"].replace({"": default_season, "nan": default_season})
    out["season_type"] = out["season_type"].replace({"": default_season_type, "nan": default_season_type})

    # Consolidación defensiva: si hay duplicados para jugador/día/tipo, conserva máximos numéricos
    # y últimos textos útiles. En POTENTIAL_AST el máximo suele ser lo más seguro ante duplicados.
    out = (
        out.sort_values(["game_date", "season_type", "player_id"])
        .groupby(["game_date", "season_type", "player_id"], dropna=False, as_index=False)
        .agg(
            season=("season", "last"),
            player_name=("player_name", "last"),
            team_id=("team_id", "max"),
            team_abbreviation=("team_abbreviation", "last"),
            ast=("ast", "max"),
            potential_ast=("potential_ast", "max"),
            passes_made=("passes_made", "max"),
            passes_received=("passes_received", "max"),
            ast_points_created=("ast_points_created", "max"),
        )
    )

    return out


def read_input_csv(path: str, default_season: str, default_season_type: str) -> pd.DataFrame:
    log(f"📥 Leyendo CSV: {path}")
    raw = pd.read_csv(path, low_memory=False)
    return normalize_tracking_df(raw, default_season, default_season_type)


def read_source_table(
    conn,
    source_table: str,
    start_date: Optional[date],
    end_date: Optional[date],
    default_season: str,
    default_season_type: str,
) -> pd.DataFrame:
    schema, table = split_table_name(source_table)
    columns = get_table_columns(conn, schema, table)
    if not columns:
        raise RuntimeError(f"No encontré la tabla fuente {schema}.{table}")

    required = {"game_date", "player_id", "potential_ast"}
    missing = sorted(required - set(columns))
    if missing:
        raise RuntimeError(f"La tabla fuente {schema}.{table} no tiene columnas requeridas: {missing}")

    ref = table_sql(schema, table)
    where_parts = []
    params: List[object] = []

    if start_date:
        where_parts.append(sql.SQL("game_date::date >= %s"))
        params.append(start_date)
    if end_date:
        where_parts.append(sql.SQL("game_date::date <= %s"))
        params.append(end_date)

    where_sql = sql.SQL("")
    if where_parts:
        where_sql = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(where_parts)

    query = sql.SQL("SELECT * FROM {ref}{where_sql}").format(ref=ref, where_sql=where_sql)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    log(f"📥 Filas leídas desde {schema}.{table}: {len(rows):,}")
    return normalize_tracking_df(pd.DataFrame(rows), default_season, default_season_type)


# ============================================================
# Staging and update
# ============================================================

def dataframe_to_values(df: pd.DataFrame) -> List[Tuple[object, ...]]:
    values: List[Tuple[object, ...]] = []
    for _, row in df.iterrows():
        values.append(
            (
                row.get("game_date"),
                None if pd.isna(row.get("season_type")) else str(row.get("season_type")),
                None if pd.isna(row.get("season")) else str(row.get("season")),
                to_int_or_none(row.get("player_id")),
                None if pd.isna(row.get("player_name")) else str(row.get("player_name")),
                to_int_or_none(row.get("team_id")),
                None if pd.isna(row.get("team_abbreviation")) else str(row.get("team_abbreviation")).upper().strip(),
                to_float_or_none(row.get("ast")),
                to_float_or_none(row.get("potential_ast")),
                to_float_or_none(row.get("passes_made")),
                to_float_or_none(row.get("passes_received")),
                to_float_or_none(row.get("ast_points_created")),
            )
        )
    return [v for v in values if v[0] is not None and v[3] is not None and v[8] is not None]


def create_temp_tracking_table(cur, values: List[Tuple[object, ...]]) -> None:
    cur.execute(
        """
        CREATE TEMP TABLE tmp_potential_ast_daily (
            game_date DATE,
            season_type TEXT,
            season TEXT,
            player_id BIGINT,
            player_name TEXT,
            team_id BIGINT,
            team_abbreviation TEXT,
            ast NUMERIC,
            potential_ast NUMERIC,
            passes_made NUMERIC,
            passes_received NUMERIC,
            ast_points_created NUMERIC
        ) ON COMMIT DROP;
        """
    )

    execute_values(
        cur,
        """
        INSERT INTO tmp_potential_ast_daily (
            game_date,
            season_type,
            season,
            player_id,
            player_name,
            team_id,
            team_abbreviation,
            ast,
            potential_ast,
            passes_made,
            passes_received,
            ast_points_created
        ) VALUES %s
        """,
        values,
        page_size=1000,
    )

    # Unifica duplicados por fecha/tipo/jugador.
    cur.execute(
        """
        CREATE TEMP TABLE tmp_potential_ast_daily_raw ON COMMIT DROP AS
        SELECT * FROM tmp_potential_ast_daily;

        TRUNCATE tmp_potential_ast_daily;

        INSERT INTO tmp_potential_ast_daily (
            game_date,
            season_type,
            season,
            player_id,
            player_name,
            team_id,
            team_abbreviation,
            ast,
            potential_ast,
            passes_made,
            passes_received,
            ast_points_created
        )
        SELECT
            game_date,
            COALESCE(NULLIF(MAX(season_type), ''), 'Unknown') AS season_type,
            MAX(season) AS season,
            player_id,
            MAX(player_name) AS player_name,
            MAX(team_id) AS team_id,
            MAX(team_abbreviation) AS team_abbreviation,
            MAX(ast) AS ast,
            MAX(potential_ast) AS potential_ast,
            MAX(passes_made) AS passes_made,
            MAX(passes_received) AS passes_received,
            MAX(ast_points_created) AS ast_points_created
        FROM tmp_potential_ast_daily_raw
        GROUP BY game_date, player_id, COALESCE(NULLIF(season_type, ''), 'Unknown');
        """
    )


def ensure_staging_table(cur, staging_table: str) -> Tuple[str, str]:
    schema, table = split_table_name(staging_table, default_schema="nba_api_data")
    cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)))

    cur.execute(
        sql.SQL(
            """
            CREATE TABLE IF NOT EXISTS {ref} (
                game_date DATE NOT NULL,
                season_type TEXT NOT NULL DEFAULT 'Unknown',
                season TEXT,
                player_id BIGINT NOT NULL,
                player_name TEXT,
                team_id BIGINT,
                team_abbreviation TEXT,
                ast NUMERIC,
                potential_ast NUMERIC,
                passes_made NUMERIC,
                passes_received NUMERIC,
                ast_points_created NUMERIC,
                source TEXT NOT NULL DEFAULT 'daily_pot',
                first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (game_date, season_type, player_id)
            )
            """
        ).format(ref=table_sql(schema, table))
    )

    cur.execute(
        sql.SQL(
            "CREATE INDEX IF NOT EXISTS {} ON {} (player_id, game_date)"
        ).format(
            sql.Identifier(f"idx_{table}_player_date"),
            table_sql(schema, table),
        )
    )

    return schema, table


def upsert_staging(cur, staging_table: str) -> int:
    schema, table = ensure_staging_table(cur, staging_table)

    cur.execute(
        sql.SQL(
            """
            INSERT INTO {ref} (
                game_date,
                season_type,
                season,
                player_id,
                player_name,
                team_id,
                team_abbreviation,
                ast,
                potential_ast,
                passes_made,
                passes_received,
                ast_points_created,
                source,
                updated_at
            )
            SELECT
                game_date,
                COALESCE(NULLIF(season_type, ''), 'Unknown') AS season_type,
                season,
                player_id,
                player_name,
                team_id,
                team_abbreviation,
                ast,
                potential_ast,
                passes_made,
                passes_received,
                ast_points_created,
                'daily_pot',
                NOW()
            FROM tmp_potential_ast_daily
            ON CONFLICT (game_date, season_type, player_id)
            DO UPDATE SET
                season = COALESCE(EXCLUDED.season, {ref}.season),
                player_name = COALESCE(EXCLUDED.player_name, {ref}.player_name),
                team_id = COALESCE(EXCLUDED.team_id, {ref}.team_id),
                team_abbreviation = COALESCE(EXCLUDED.team_abbreviation, {ref}.team_abbreviation),
                ast = COALESCE(EXCLUDED.ast, {ref}.ast),
                potential_ast = EXCLUDED.potential_ast,
                passes_made = COALESCE(EXCLUDED.passes_made, {ref}.passes_made),
                passes_received = COALESCE(EXCLUDED.passes_received, {ref}.passes_received),
                ast_points_created = COALESCE(EXCLUDED.ast_points_created, {ref}.ast_points_created),
                source = EXCLUDED.source,
                updated_at = NOW()
            WHERE ROW({ref}.season, {ref}.player_name, {ref}.team_id,
                      {ref}.team_abbreviation, {ref}.ast, {ref}.potential_ast,
                      {ref}.passes_made, {ref}.passes_received,
                      {ref}.ast_points_created, {ref}.source)
              IS DISTINCT FROM ROW(
                      COALESCE(EXCLUDED.season, {ref}.season),
                      COALESCE(EXCLUDED.player_name, {ref}.player_name),
                      COALESCE(EXCLUDED.team_id, {ref}.team_id),
                      COALESCE(EXCLUDED.team_abbreviation, {ref}.team_abbreviation),
                      COALESCE(EXCLUDED.ast, {ref}.ast), EXCLUDED.potential_ast,
                      COALESCE(EXCLUDED.passes_made, {ref}.passes_made),
                      COALESCE(EXCLUDED.passes_received, {ref}.passes_received),
                      COALESCE(EXCLUDED.ast_points_created, {ref}.ast_points_created), EXCLUDED.source)
            """
        ).format(ref=table_sql(schema, table))
    )
    return int(cur.rowcount)


def build_update_target_query(
    target_schema: str,
    target_table: str,
    target_columns: List[str],
    only_missing: bool,
    match_team: bool,
    match_season_type: bool,
    update_ast: bool,
    skip_zero: bool,
) -> sql.Composed:
    ref = table_sql(target_schema, target_table)

    set_parts: List[sql.Composed] = [
        sql.SQL("potential_ast = u.potential_ast")
    ]

    optional_cols = {
        "passes_made": "passes_made",
        "passes_received": "passes_received",
        "ast_points_created": "ast_points_created",
    }
    if update_ast:
        optional_cols["ast"] = "ast"

    for target_col, tmp_col in optional_cols.items():
        if target_col in target_columns:
            set_parts.append(
                sql.SQL("{} = COALESCE(u.{}, t.{})").format(
                    sql.Identifier(target_col),
                    sql.Identifier(tmp_col),
                    sql.Identifier(target_col),
                )
            )

    if "updated_at" in target_columns:
        set_parts.append(sql.SQL("updated_at = NOW()"))

    where_parts: List[sql.SQL] = [
        sql.SQL("t.player_id = u.player_id"),
        sql.SQL("t.game_date = u.game_date"),
        sql.SQL("u.potential_ast IS NOT NULL"),
        sql.SQL("t.potential_ast IS DISTINCT FROM u.potential_ast"),
    ]

    if skip_zero:
        where_parts.append(sql.SQL("u.potential_ast > 0"))

    if only_missing:
        where_parts.append(sql.SQL("(t.potential_ast IS NULL OR t.potential_ast = 0)"))

    if match_team:
        team_conditions: List[sql.SQL] = []
        if "team_id" in target_columns:
            team_conditions.append(
                sql.SQL("(u.team_id IS NOT NULL AND t.team_id IS NOT NULL AND t.team_id = u.team_id)")
            )
        if "team_abbreviation" in target_columns:
            team_conditions.append(
                sql.SQL(
                    "(u.team_abbreviation IS NOT NULL AND t.team_abbreviation IS NOT NULL "
                    "AND UPPER(t.team_abbreviation::text) = UPPER(u.team_abbreviation))"
                )
            )
        if team_conditions:
            where_parts.append(sql.SQL("(") + sql.SQL(" OR ").join(team_conditions) + sql.SQL(")"))

    if match_season_type and "season_type" in target_columns:
        where_parts.append(sql.SQL("t.season_type = u.season_type"))

    return sql.SQL(
        """
        UPDATE {ref} AS t
        SET {sets}
        FROM tmp_potential_ast_daily AS u
        WHERE {where_clause}
        """
    ).format(
        ref=ref,
        sets=sql.SQL(", ").join(set_parts),
        where_clause=sql.SQL(" AND ").join(where_parts),
    )


def build_no_match_query(
    target_schema: str,
    target_table: str,
    target_columns: List[str],
    match_team: bool,
    match_season_type: bool,
) -> sql.Composed:
    ref = table_sql(target_schema, target_table)

    exists_parts: List[sql.SQL] = [
        sql.SQL("t.player_id = u.player_id"),
        sql.SQL("t.game_date = u.game_date"),
    ]

    if match_team:
        team_conditions: List[sql.SQL] = []
        if "team_id" in target_columns:
            team_conditions.append(
                sql.SQL("(u.team_id IS NOT NULL AND t.team_id IS NOT NULL AND t.team_id = u.team_id)")
            )
        if "team_abbreviation" in target_columns:
            team_conditions.append(
                sql.SQL(
                    "(u.team_abbreviation IS NOT NULL AND t.team_abbreviation IS NOT NULL "
                    "AND UPPER(t.team_abbreviation::text) = UPPER(u.team_abbreviation))"
                )
            )
        if team_conditions:
            exists_parts.append(sql.SQL("(") + sql.SQL(" OR ").join(team_conditions) + sql.SQL(")"))

    if match_season_type and "season_type" in target_columns:
        exists_parts.append(sql.SQL("t.season_type = u.season_type"))

    return sql.SQL(
        """
        SELECT
            u.game_date,
            u.season_type,
            u.player_id,
            u.player_name,
            u.team_id,
            u.team_abbreviation,
            u.potential_ast,
            %s AS target_table,
            'no_matching_player_game_log' AS reason
        FROM tmp_potential_ast_daily AS u
        WHERE NOT EXISTS (
            SELECT 1
            FROM {ref} AS t
            WHERE {exists_clause}
        )
        ORDER BY u.game_date, u.team_abbreviation, u.player_name
        """
    ).format(
        ref=ref,
        exists_clause=sql.SQL(" AND ").join(exists_parts),
    )


def update_one_target(
    cur,
    target_table: str,
    only_missing: bool,
    match_team: bool,
    match_season_type: bool,
    update_ast: bool,
    skip_zero: bool,
) -> Tuple[str, int, pd.DataFrame]:
    schema, table = split_table_name(target_table)
    columns = get_table_columns_from_cursor(cur, schema, table)

    if not columns:
        raise RuntimeError(f'No existe el destino configurado {schema}.{table}.')

    required = ["game_date", "player_id", "potential_ast"]
    missing = [c for c in required if c not in columns]
    if missing:
        raise RuntimeError(f'{schema}.{table} no tiene columnas requeridas {missing}.')

    cur.execute(
        build_update_target_query(
            target_schema=schema,
            target_table=table,
            target_columns=columns,
            only_missing=only_missing,
            match_team=match_team,
            match_season_type=match_season_type,
            update_ast=update_ast,
            skip_zero=skip_zero,
        )
    )
    updated = int(cur.rowcount)

    target_name = f"{schema}.{table}"
    cur.execute(
        build_no_match_query(
            target_schema=schema,
            target_table=table,
            target_columns=columns,
            match_team=match_team,
            match_season_type=match_season_type,
        ),
        (target_name,),
    )
    no_match_rows = cur.fetchall()
    return target_name, updated, pd.DataFrame(no_match_rows)


def get_table_columns_from_cursor(cur, schema: str, table: str) -> List[str]:
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = %s
          AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema, table),
    )
    rows = cur.fetchall()
    out = []
    for row in rows:
        if isinstance(row, dict):
            out.append(row["column_name"])
        else:
            out.append(row[0])
    return out


def save_outputs(
    df: pd.DataFrame,
    no_match_by_target: Dict[str, pd.DataFrame],
    output_dir: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if not df.empty:
        downloaded_path = output_dir / f"potential_ast_input_{stamp}.csv"
        df.to_csv(downloaded_path, index=False)
        log(f"📝 CSV auditoría input: {downloaded_path}")

    for target_name, no_match_df in no_match_by_target.items():
        if no_match_df.empty:
            continue
        safe_target = target_name.replace(".", "_")
        no_match_path = output_dir / f"potential_ast_sin_match_{safe_target}_{stamp}.csv"
        no_match_df.to_csv(no_match_path, index=False)
        log(f"🧩 CSV sin match {target_name}: {no_match_path}")


def print_summary(df: pd.DataFrame) -> None:
    log("===========================================================")
    log(f"📦 Filas limpias totales: {len(df):,}")
    if not df.empty:
        log(f"📅 Fechas: {df['game_date'].min()} → {df['game_date'].max()}")
        log(f"📊 POTENTIAL_AST no nulos: {df['potential_ast'].notna().sum():,}")
        log(f"📊 POTENTIAL_AST = 0: {int((pd.to_numeric(df['potential_ast'], errors='coerce') == 0).sum()):,}")
        if "team_abbreviation" in df.columns:
            counts = df.groupby(["game_date", "team_abbreviation"], dropna=False).size().reset_index(name="jugadores")
            log("🏀 Cobertura por fecha/equipo:")
            for _, r in counts.iterrows():
                log(f"   {r['game_date']} | {r['team_abbreviation']}: {int(r['jugadores'])}")
    log("===========================================================")


def upload_and_apply(
    df: pd.DataFrame,
    staging_table: str,
    targets: List[str],
    only_missing: bool,
    match_team: bool,
    match_season_type: bool,
    update_ast: bool,
    skip_zero: bool,
) -> Tuple[int, Dict[str, int], Dict[str, pd.DataFrame]]:
    if df.empty:
        return 0, {}, {}

    values = dataframe_to_values(df)
    if not values:
        log("ℹ️ No quedaron valores válidos para Postgres.")
        return 0, {}, {}

    updated_by_target: Dict[str, int] = {}
    no_match_by_target: Dict[str, pd.DataFrame] = {}

    with connect_db() as conn:
        conn.autocommit = False
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SET LOCAL lock_timeout = '5s'")
            cur.execute("SET LOCAL statement_timeout = '120s'")
            create_temp_tracking_table(cur, values)

            staged = upsert_staging(cur, staging_table)
            log(f"📚 Filas guardadas/actualizadas en staging {staging_table}: {staged:,}")

            for target in targets:
                target_name, updated, no_match_df = update_one_target(
                    cur=cur,
                    target_table=target,
                    only_missing=only_missing,
                    match_team=match_team,
                    match_season_type=match_season_type,
                    update_ast=update_ast,
                    skip_zero=skip_zero,
                )
                updated_by_target[target_name] = updated
                no_match_by_target[target_name] = no_match_df
                log(f"✅ Filas actualizadas en {target_name}: {updated:,}")
                log(f"⚠️ Sin match en {target_name}: {len(no_match_df):,}")

        conn.commit()

    return staged, updated_by_target, no_match_by_target


# ============================================================
# Main
# ============================================================

def main() -> int:
    parser = argparse.ArgumentParser(description="Carga POTENTIAL_AST a staging y actualiza tablas reales.")
    parser.add_argument("--input-csv", default=None, help="CSV existente con game_date/player_id/potential_ast.")
    parser.add_argument("--source-table", default=None, help="Tabla fuente Postgres existente, formato schema.table.")
    parser.add_argument("--from-stage", action="store_true", help="Usa --staging-table como fuente, sin descargar ni leer CSV.")

    parser.add_argument("--staging-table", default="nba_api_data.player_tracking_passing_daily")
    parser.add_argument("--targets", default="public.player_game_logs,nba_api_data.player_game_logs_v2")

    parser.add_argument("--season", default="2026-27")
    parser.add_argument("--season-types", default="Regular Season,Playoffs,PlayIn")
    parser.add_argument("--default-season-type", default="Playoffs")
    parser.add_argument("--start-date", default=None, help="YYYY-MM-DD")
    parser.add_argument("--end-date", default=None, help="YYYY-MM-DD")
    parser.add_argument("--lookback-days", type=int, default=3)
    parser.add_argument("--timezone", default="America/Argentina/Buenos_Aires")
    parser.add_argument("--sleep-seconds", type=float, default=1.8)
    parser.add_argument("--output-dir", default="outputs_tracking")

    parser.add_argument("--upload-db", action="store_true", help="Guarda staging y actualiza targets. Sin esto es dry-run.")
    parser.add_argument("--only-missing", action="store_true", help="Solo actualiza filas con potential_ast NULL o 0.")
    parser.add_argument("--match-team", action="store_true", help="Exige match por equipo además de player_id + game_date.")
    parser.add_argument("--match-season-type", action="store_true", help="También exige season_type si existe en tabla destino.")
    parser.add_argument("--update-ast", action="store_true", help="También actualiza ast si la columna existe.")
    parser.add_argument("--skip-zero", action="store_true", help="No aplica potential_ast = 0.")

    args = parser.parse_args()

    tz = ZoneInfo(args.timezone)
    today = datetime.now(tz).date()

    end_date = parse_date(args.end_date) or (today - timedelta(days=1))
    start_date = parse_date(args.start_date) or (end_date - timedelta(days=args.lookback_days - 1))
    if start_date > end_date:
        raise ValueError("start-date no puede ser mayor que end-date")

    targets = [t.strip() for t in args.targets.split(",") if t.strip()]
    if not targets:
        raise ValueError("No hay targets válidos.")

    log("===========================================================")
    log("🔄 DAILY POT COMPLETO - POTENTIAL AST → STAGING + TARGETS")
    log("===========================================================")
    log(f"Staging: {args.staging_table}")
    log(f"Targets: {targets}")
    log(f"Rango referencia: {start_date.isoformat()} → {end_date.isoformat()}")
    log(f"Modo: {'UPLOAD DB' if args.upload_db else 'DRY-RUN'}")
    log(f"Solo faltantes: {args.only_missing}")
    log(f"Aplicar ceros: {'no' if args.skip_zero else 'sí'}")
    log("===========================================================")

    df = pd.DataFrame()

    if args.input_csv:
        df = read_input_csv(args.input_csv, args.season, args.default_season_type)

    elif args.source_table or args.from_stage:
        table_name = args.staging_table if args.from_stage else args.source_table
        with connect_db() as conn:
            df = read_source_table(
                conn=conn,
                source_table=table_name,
                start_date=start_date,
                end_date=end_date,
                default_season=args.season,
                default_season_type=args.default_season_type,
            )

    else:
        season_types = normalize_season_types(args.season_types)
        if not season_types:
            raise ValueError("No hay season-types válidos")

        raw = fetch_range(
            start_date=start_date,
            end_date=end_date,
            season=args.season,
            season_types=season_types,
            sleep_seconds=args.sleep_seconds,
        )
        df = normalize_tracking_df(raw, args.season, args.default_season_type)

    if df.empty:
        log("⏸️ No hay filas limpias. No se actualiza nada.")
        return 0

    print_summary(df)

    no_match_by_target: Dict[str, pd.DataFrame] = {}

    if args.upload_db:
        _, updated_by_target, no_match_by_target = upload_and_apply(
            df=df,
            staging_table=args.staging_table,
            targets=targets,
            only_missing=args.only_missing,
            match_team=args.match_team,
            match_season_type=args.match_season_type,
            update_ast=args.update_ast,
            skip_zero=args.skip_zero,
        )

        log("===========================================================")
        log("📊 RESUMEN TARGETS")
        for target_name, updated in updated_by_target.items():
            no_match_count = len(no_match_by_target.get(target_name, pd.DataFrame()))
            log(f"   {target_name}: actualizadas={updated:,} | sin_match={no_match_count:,}")
        log("===========================================================")
    else:
        log("🧪 Dry-run: no se tocó Postgres. Usá --upload-db para guardar y actualizar.")

    save_outputs(df, no_match_by_target, Path(args.output_dir))

    log("🏁 FIN")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Interrumpido por usuario.")
        raise SystemExit(130)
    except Exception as exc:
        log(f"❌ ERROR FATAL: {exc}")
        raise SystemExit(1)
