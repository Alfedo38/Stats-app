#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Carga CSVs WNBA a PostgreSQL/Supabase.

Uso recomendado:
  python3 load_wnba_csvs_postgres.py --data-dir ./wnba_data --schema wnba_api_data --if-exists replace

Lee la URL de conexión desde:
  DATABASE_URL, SUPABASE_DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, POSTGRES_DATABASE_URL

También intenta cargar .env.local y .env desde:
  - directorio actual
  - carpeta padre
  - ~/stats-app
  - ~/stats-app/motor_python

IMPORTANTE:
  player_season_stats.csv viene mixto:
  - filas Base: 71 columnas
  - filas Advanced: 83 columnas
  Por eso este script lo separa en:
  - player_season_stats_base
  - player_season_stats_advanced
"""

from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

BigInteger = Date = DateTime = Float = Text = create_engine = text = None


def require_sqlalchemy() -> None:
    global BigInteger, Date, DateTime, Float, Text, create_engine, text
    if create_engine is not None:
        return

    try:
        from sqlalchemy import BigInteger as _BigInteger
        from sqlalchemy import Date as _Date
        from sqlalchemy import DateTime as _DateTime
        from sqlalchemy import Float as _Float
        from sqlalchemy import Text as _Text
        from sqlalchemy import create_engine as _create_engine
        from sqlalchemy import text as _text
    except Exception as exc:
        raise RuntimeError(
            "Faltan dependencias para conectar a Postgres. Instalá: "
            "pip install pandas sqlalchemy psycopg2-binary python-dotenv"
        ) from exc

    BigInteger = _BigInteger
    Date = _Date
    DateTime = _DateTime
    Float = _Float
    Text = _Text
    create_engine = _create_engine
    text = _text


TABLE_ORDER = [
    "teams",
    "players",
    "games",
    "team_game_stats",
    "player_game_stats",
    "player_game_stats_advanced",
    "player_season_stats_base",
    "player_season_stats_advanced",
    "team_season_stats",
]

NORMAL_CSVS = {
    "teams": "teams.csv",
    "players": "players.csv",
    "games": "games.csv",
    "team_game_stats": "team_game_stats.csv",
    "player_game_stats": "player_game_stats.csv",
    "player_game_stats_advanced": "player_game_stats_advanced.csv",
    "team_season_stats": "team_season_stats.csv",
}

ADVANCED_PLAYER_SEASON_COLUMNS = [
    "player_id", "player_name", "nickname", "team_id", "team_abbreviation", "age",
    "gp", "w", "l", "w_pct", "min",
    "e_off_rating", "off_rating", "sp_work_off_rating",
    "e_def_rating", "def_rating", "sp_work_def_rating",
    "e_net_rating", "net_rating", "sp_work_net_rating",
    "ast_pct", "ast_to", "ast_ratio",
    "oreb_pct", "dreb_pct", "reb_pct", "tm_tov_pct",
    "e_fg_pct", "ts_pct", "usg_pct", "e_usg_pct",
    "e_pace", "pace", "pace_per40", "sp_work_pace",
    "pie", "poss", "fgm", "fga", "fgm_pg", "fga_pg", "fg_pct",
    "gp_rank", "w_rank", "l_rank", "w_pct_rank", "min_rank",
    "e_off_rating_rank", "off_rating_rank", "sp_work_off_rating_rank",
    "e_def_rating_rank", "def_rating_rank", "sp_work_def_rating_rank",
    "e_net_rating_rank", "net_rating_rank", "sp_work_net_rating_rank",
    "ast_pct_rank", "ast_to_rank", "ast_ratio_rank",
    "oreb_pct_rank", "dreb_pct_rank", "reb_pct_rank", "tm_tov_pct_rank",
    "e_fg_pct_rank", "ts_pct_rank", "usg_pct_rank", "e_usg_pct_rank",
    "e_pace_rank", "pace_rank", "pace_per40_rank", "sp_work_pace_rank",
    "pie_rank", "poss_rank", "fgm_rank", "fga_rank", "fgm_pg_rank",
    "fga_pg_rank", "fg_pct_rank",
    "team_count", "season", "season_type", "measure", "updated_at",
]

TEXT_COLUMNS = {
    "game_id", "season", "season_type", "team_abbr", "team_abbreviation",
    "team_name", "team_city", "arena", "head_coach",
    "first_name", "last_name", "full_name", "player_name", "nickname",
    "jersey", "position", "height", "weight", "school", "country",
    "start_position", "comment", "minutes", "min_sec", "wl", "home_wl",
    "away_wl", "measure", "home_team_abbr", "away_team_abbr",
}

DATE_COLUMNS = {"game_date", "birth_date"}
DATETIME_COLUMNS = {"updated_at"}
ID_COLUMNS = {"player_id", "team_id", "home_team_id", "away_team_id"}


def load_envs() -> None:
    if load_dotenv is None:
        return

    candidates = [
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
        Path.cwd().parent / ".env.local",
        Path.cwd().parent / ".env",
        Path.home() / "stats-app" / ".env.local",
        Path.home() / "stats-app" / ".env",
        Path.home() / "stats-app" / "motor_python" / ".env.local",
        Path.home() / "stats-app" / "motor_python" / ".env",
    ]
    for env_file in candidates:
        if env_file.exists():
            load_dotenv(env_file, override=False)


def get_db_url() -> str:
    load_envs()
    keys = [
        "DATABASE_URL",
        "SUPABASE_DATABASE_URL",
        "SUPABASE_DB_URL",
        "POSTGRES_URL",
        "POSTGRES_DATABASE_URL",
    ]
    for key in keys:
        value = os.getenv(key)
        if value:
            return value

    raise RuntimeError(
        "No encontré URL de Postgres. Definí DATABASE_URL o SUPABASE_DATABASE_URL "
        "en tu .env.local."
    )


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).replace("\ufeff", "").strip() for c in df.columns]
    return df


def clean_dataframe(df: pd.DataFrame, table: str) -> pd.DataFrame:
    df = normalize_columns(df)
    df = df.replace({"": pd.NA, "nan": pd.NA, "None": pd.NA, "NULL": pd.NA})

    # En players.csv aparecen jugadoras sin equipo con team_id = 0.
    # Si algún día agregás foreign keys, 0 te rompe. Lo dejamos como NULL.
    if table == "players" and "team_id" in df.columns:
        df["team_id"] = df["team_id"].replace({0: pd.NA, "0": pd.NA})

    for col in df.columns:
        col_l = col.lower()

        if col_l in DATE_COLUMNS:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.date
        elif col_l in DATETIME_COLUMNS:
            df[col] = pd.to_datetime(df[col], errors="coerce")
        elif col_l in TEXT_COLUMNS:
            df[col] = df[col].astype("string")
        else:
            converted = pd.to_numeric(df[col], errors="coerce")
            # Si convirtió muy poco, mejor conservar texto.
            non_null_original = df[col].notna().sum()
            non_null_converted = converted.notna().sum()
            if non_null_original and non_null_converted / non_null_original < 0.80:
                df[col] = df[col].astype("string")
            else:
                # Si todo lo no nulo es entero, usar Int64 nullable.
                without_na = converted.dropna()
                if len(without_na) and (without_na % 1 == 0).all():
                    df[col] = converted.astype("Int64")
                else:
                    df[col] = converted.astype("float64")

    return df


def read_player_season_stats(data_dir: Path) -> Tuple[pd.DataFrame, pd.DataFrame]:
    path = data_dir / "player_season_stats.csv"
    if not path.exists():
        raise FileNotFoundError(f"Falta {path}")

    base_rows: List[List[str]] = []
    advanced_rows: List[List[str]] = []
    bad_rows: List[Tuple[int, int]] = []

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        base_header = next(reader)

        for line_no, row in enumerate(reader, start=2):
            if len(row) == 71:
                base_rows.append(row)
            elif len(row) == 83:
                advanced_rows.append(row)
            else:
                bad_rows.append((line_no, len(row)))

    if bad_rows:
        preview = ", ".join([f"línea {ln}: {n} columnas" for ln, n in bad_rows[:10]])
        raise ValueError(f"player_season_stats.csv tiene filas con largo inesperado: {preview}")

    base_df = pd.DataFrame(base_rows, columns=base_header)
    advanced_df = pd.DataFrame(advanced_rows, columns=ADVANCED_PLAYER_SEASON_COLUMNS)

    return (
        clean_dataframe(base_df, "player_season_stats_base"),
        clean_dataframe(advanced_df, "player_season_stats_advanced"),
    )


def read_all_tables(data_dir: Path) -> Dict[str, pd.DataFrame]:
    tables: Dict[str, pd.DataFrame] = {}

    for table, filename in NORMAL_CSVS.items():
        path = data_dir / filename
        if not path.exists():
            raise FileNotFoundError(f"Falta {path}")
        df = pd.read_csv(path, encoding="utf-8-sig")
        tables[table] = clean_dataframe(df, table)

    base_df, advanced_df = read_player_season_stats(data_dir)
    tables["player_season_stats_base"] = base_df
    tables["player_season_stats_advanced"] = advanced_df

    return tables


def dtype_for_to_sql(df: pd.DataFrame) -> Dict[str, object]:
    require_sqlalchemy()
    dtype: Dict[str, object] = {}

    for col in df.columns:
        col_l = col.lower()

        if col_l in DATE_COLUMNS:
            dtype[col] = Date()
        elif col_l in DATETIME_COLUMNS:
            dtype[col] = DateTime()
        elif col_l in TEXT_COLUMNS:
            dtype[col] = Text()
        elif col_l in ID_COLUMNS:
            dtype[col] = BigInteger()
        elif pd.api.types.is_integer_dtype(df[col]):
            dtype[col] = BigInteger()
        elif pd.api.types.is_float_dtype(df[col]):
            dtype[col] = Float()
        else:
            dtype[col] = Text()

    return dtype


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def create_indexes(engine: Any, schema: str) -> None:
    require_sqlalchemy()
    index_groups = {
        "teams": [["team_id"], ["team_abbr"]],
        "players": [["player_id"], ["team_id"], ["full_name"]],
        "games": [["game_id"], ["game_date"], ["season"], ["home_team_id"], ["away_team_id"]],
        "team_game_stats": [["game_id"], ["team_id"], ["season"], ["game_id", "team_id"]],
        "player_game_stats": [["game_id"], ["player_id"], ["team_id"], ["season"], ["game_id", "player_id"]],
        "player_game_stats_advanced": [["game_id"], ["player_id"], ["team_id"], ["game_id", "player_id"]],
        "player_season_stats_base": [["player_id"], ["team_id"], ["season"], ["player_id", "team_id", "season", "season_type"]],
        "player_season_stats_advanced": [["player_id"], ["team_id"], ["season"], ["player_id", "team_id", "season", "season_type"]],
        "team_season_stats": [["team_id"], ["season"], ["team_id", "season", "season_type"]],
    }

    with engine.begin() as conn:
        for table, groups in index_groups.items():
            for cols in groups:
                idx_name = f"idx_{table}_{'_'.join(cols)}"
                # PostgreSQL limita nombres a 63 chars.
                idx_name = idx_name[:60]
                col_sql = ", ".join(qident(c) for c in cols)
                sql = (
                    f"CREATE INDEX IF NOT EXISTS {qident(idx_name)} "
                    f"ON {qident(schema)}.{qident(table)} ({col_sql})"
                )
                conn.execute(text(sql))


def load_to_postgres(engine: Any, schema: str, tables: Dict[str, pd.DataFrame], if_exists: str) -> None:
    require_sqlalchemy()
    with engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {qident(schema)}"))

    for table in TABLE_ORDER:
        df = tables[table]
        print(f"⬆️  Cargando {schema}.{table}: {len(df):,} filas | {len(df.columns)} columnas")
        df.to_sql(
            name=table,
            con=engine,
            schema=schema,
            if_exists=if_exists,
            index=False,
            chunksize=1000,
            method="multi",
            dtype=dtype_for_to_sql(df),
        )

    create_indexes(engine, schema)


def print_summary(tables: Dict[str, pd.DataFrame]) -> None:
    print("\n📊 Resumen detectado:")
    for table in TABLE_ORDER:
        df = tables[table]
        seasons = ""
        if "season" in df.columns:
            seasons = f" | seasons={sorted(df['season'].dropna().astype(str).unique())}"
        print(f"   {table}: {len(df):,} filas, {len(df.columns)} columnas{seasons}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=".", help="Carpeta donde están los CSV")
    parser.add_argument("--schema", default="wnba_api_data", help="Schema destino en Postgres")
    parser.add_argument(
        "--if-exists",
        default="replace",
        choices=["replace", "append", "fail"],
        help="replace = borra/recrea solo estas tablas del schema destino",
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo valida CSVs y muestra resumen")
    args = parser.parse_args()

    data_dir = Path(args.data_dir).expanduser().resolve()
    print(f"📁 Carpeta CSV: {data_dir}")

    tables = read_all_tables(data_dir)
    print_summary(tables)

    if args.dry_run:
        print("\n✅ Dry-run OK. No se cargó nada a la base.")
        return

    require_sqlalchemy()
    db_url = get_db_url()
    engine = create_engine(db_url, pool_pre_ping=True)

    load_to_postgres(engine, args.schema, tables, args.if_exists)

    print("\n✅ Carga completa.")
    print(f"Schema: {args.schema}")
    print("Tablas cargadas:")
    for table in TABLE_ORDER:
        print(f"  - {args.schema}.{table}")


if __name__ == "__main__":
    main()
