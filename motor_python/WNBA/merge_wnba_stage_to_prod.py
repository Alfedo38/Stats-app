#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
from datetime import date
from dotenv import load_dotenv
import psycopg2
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode


PROD_SCHEMA = os.getenv("WNBA_PROD_SCHEMA", "wnba_api_data")
STAGE_SCHEMA = os.getenv("WNBA_STAGE_SCHEMA", "wnba_stage")
TARGET_SEASON = os.getenv("WNBA_TARGET_SEASON", str(date.today().year))


def load_env():
    candidates = [
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
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
    for key in [
        "DATABASE_URL",
        "SUPABASE_DATABASE_URL",
        "SUPABASE_DB_URL",
        "POSTGRES_URL",
        "POSTGRES_DATABASE_URL",
    ]:
        value = os.getenv(key)
        if value:
            return value
    raise RuntimeError("No encontré DATABASE_URL/SUPABASE_DATABASE_URL/POSTGRES_URL en .env")


def clean_db_url(db_url: str) -> str:
    """
    Prisma/Supabase a veces agrega query params como pgbouncer=true.
    psycopg2 no acepta todos esos params, así que dejamos solo los compatibles.
    """
    parts = urlsplit(db_url)

    allowed = {
        "sslmode",
        "connect_timeout",
        "application_name",
        "keepalives",
        "keepalives_idle",
        "keepalives_interval",
        "keepalives_count",
        "target_session_attrs",
    }

    query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k in allowed
    ]

    return urlunsplit((
        parts.scheme,
        parts.netloc,
        parts.path,
        urlencode(query),
        parts.fragment,
    ))


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def get_columns(cur, schema: str, table: str) -> list[str]:
    cur.execute(
        """
        select column_name
        from information_schema.columns
        where table_schema = %s
          and table_name = %s
        order by ordinal_position
        """,
        (schema, table),
    )
    return [r[0] for r in cur.fetchall()]


def insert_missing(cur, table: str, keys: list[str]) -> int:
    prod_cols = get_columns(cur, PROD_SCHEMA, table)
    stage_cols = get_columns(cur, STAGE_SCHEMA, table)

    cols = [c for c in prod_cols if c in stage_cols]
    if not cols:
        print(f"⚠️ {table}: sin columnas comunes, omitido")
        return 0

    col_sql = ", ".join(qident(c) for c in cols)
    join_sql = " and ".join(f"t.{qident(k)} = s.{qident(k)}" for k in keys)

    sql = f"""
        insert into {qident(PROD_SCHEMA)}.{qident(table)} ({col_sql})
        select {", ".join("s." + qident(c) for c in cols)}
        from {qident(STAGE_SCHEMA)}.{qident(table)} s
        where not exists (
            select 1
            from {qident(PROD_SCHEMA)}.{qident(table)} t
            where {join_sql}
        )
    """
    cur.execute(sql)
    return cur.rowcount


def refresh_season_table(cur, table: str) -> int:
    prod_cols = get_columns(cur, PROD_SCHEMA, table)
    stage_cols = get_columns(cur, STAGE_SCHEMA, table)

    cols = [c for c in prod_cols if c in stage_cols]
    if not cols:
        print(f"⚠️ {table}: sin columnas comunes, omitido")
        return 0

    if "season" not in cols:
        print(f"⚠️ {table}: no tiene columna season, omitido")
        return 0

    col_sql = ", ".join(qident(c) for c in cols)

    cur.execute(
        f"""
        delete from {qident(PROD_SCHEMA)}.{qident(table)}
        where season::text = %s
        """,
        (TARGET_SEASON,),
    )

    cur.execute(
        f"""
        insert into {qident(PROD_SCHEMA)}.{qident(table)} ({col_sql})
        select {", ".join("s." + qident(c) for c in cols)}
        from {qident(STAGE_SCHEMA)}.{qident(table)} s
        where s.season::text = %s
        """,
        (TARGET_SEASON,),
    )
    return cur.rowcount


def main():
    db_url = get_db_url()

    print("===================================================")
    print("🏀 WNBA MERGE STAGE → PROD")
    print("===================================================")
    print(f"Stage: {STAGE_SCHEMA}")
    print(f"Prod:  {PROD_SCHEMA}")
    print(f"Season acumulada a refrescar: {TARGET_SEASON}")

    conn = psycopg2.connect(clean_db_url(db_url))
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            jobs = [
                ("teams", ["team_id"]),
                ("players", ["player_id"]),
                ("games", ["game_id"]),
                ("team_game_stats", ["game_id", "team_id"]),
                ("player_game_stats", ["game_id", "player_id"]),
                ("player_game_stats_advanced", ["game_id", "player_id"]),
            ]

            for table, keys in jobs:
                inserted = insert_missing(cur, table, keys)
                print(f"✅ {table}: nuevos insertados = {inserted}")

            season_tables = [
                "player_season_stats_base",
                "player_season_stats_advanced",
                "team_season_stats",
            ]

            for table in season_tables:
                inserted = refresh_season_table(cur, table)
                print(f"🔄 {table}: season {TARGET_SEASON} refrescada = {inserted}")

        conn.commit()
        print("✅ Merge completado correctamente")

    except Exception:
        conn.rollback()
        print("❌ Error. Rollback aplicado.")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
