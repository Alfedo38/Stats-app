#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
subir_cuotas_betano_hitos_supabase.py

Lee el CSV normalizado de Betano hitos y lo sube a Supabase/Postgres.

Usos:
  python3 subir_cuotas_betano_hitos_supabase.py --dry-run
  python3 subir_cuotas_betano_hitos_supabase.py
  python3 subir_cuotas_betano_hitos_supabase.py --input cuotas_procesadas/betano_hitos_20260512_130723.csv

Requiere:
  pip install psycopg2-binary
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("ERROR: falta psycopg2-binary.")
    print("Instalá con:")
    print("  python3 -m pip install --user psycopg2-binary")
    sys.exit(1)

from betano_hitos_utils import latest_file, read_csv_dicts


ODDS_TABLE = "public.player_prop_odds"
SNAP_TABLE = "public.odds_snapshots"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def load_project_env() -> None:
    """
    Busca variables en motor_python/.env, raíz del proyecto, etc.
    No imprime secretos.
    """
    candidates = [
        Path(".env.local"),
        Path(".env"),
        Path("../.env.local"),
        Path("../.env"),
    ]

    for p in candidates:
        load_env_file(p)


def get_database_url(cli_value: str | None = None) -> str:
    load_project_env()

    url = (
        cli_value
        or os.getenv("SUPABASE_DATABASE_URL")
        or os.getenv("DIRECT_URL")
        or os.getenv("DATABASE_URL")
        or ""
    ).strip()

    if not url:
        raise RuntimeError(
            "No encontré DATABASE_URL / DIRECT_URL / SUPABASE_DATABASE_URL. "
            "Podés pasarlo con --db-url o ponerlo en .env.local."
        )

    return normalize_postgres_url(url)


def normalize_postgres_url(url: str) -> str:
    """
    Limpia parámetros típicos de Prisma/Supabase que a veces psycopg2 no acepta.
    Conserva sslmode y agrega sslmode=require si no existe.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("postgresql", "postgres"):
        return url

    allowed_query_keys = {
        "sslmode",
        "connect_timeout",
        "application_name",
        "target_session_attrs",
    }

    original_params = parse_qsl(parsed.query, keep_blank_values=True)
    cleaned_params = [(k, v) for k, v in original_params if k in allowed_query_keys]

    has_sslmode = any(k == "sslmode" for k, _ in cleaned_params)

    if not has_sslmode:
        cleaned_params.append(("sslmode", "require"))

    cleaned_query = urlencode(cleaned_params)

    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            cleaned_query,
            parsed.fragment,
        )
    )


def to_float(value, default=None):
    if value is None:
        return default

    txt = str(value).strip()

    if txt == "":
        return default

    try:
        return float(txt.replace(",", "."))
    except ValueError:
        return default


def to_bool(value) -> bool:
    return str(value).strip().lower() not in ("0", "false", "no", "n", "")


def ensure_tables(con) -> None:
    """
    Por seguridad, vuelve a asegurar estructura mínima.
    Si ya la creaste en DBeaver, no rompe nada.
    """
    with con.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.odds_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                book TEXT NOT NULL,
                league TEXT NOT NULL,
                scraped_at_source TEXT,
                scraped_at_utc TIMESTAMPTZ,
                source_file TEXT,
                rows_total INTEGER NOT NULL DEFAULT 0,
                rows_valid INTEGER NOT NULL DEFAULT 0,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.player_prop_odds (
                row_uid TEXT PRIMARY KEY,
                snapshot_id TEXT NOT NULL,
                scraped_at_source TEXT,
                scraped_at_utc TIMESTAMPTZ,
                book TEXT NOT NULL DEFAULT 'betano',
                sport TEXT,
                league TEXT,
                source_file TEXT,
                partido TEXT,
                game_norm TEXT,
                jugador TEXT,
                player_norm TEXT NOT NULL,
                mercado_raw TEXT,
                linea_raw TEXT,
                handicap_raw TEXT,
                odds_decimal NUMERIC(10, 4) NOT NULL,
                market_key TEXT,
                stat_key TEXT NOT NULL,
                side TEXT NOT NULL DEFAULT 'over',
                threshold NUMERIC(10, 2) NOT NULL,
                model_line NUMERIC(10, 2) NOT NULL,
                event_text TEXT,
                valid BOOLEAN NOT NULL DEFAULT TRUE,
                error TEXT,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT player_prop_odds_side_check
                    CHECK (side IN ('over', 'under'))
            );
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_player_prop_odds_snapshot
            ON public.player_prop_odds (snapshot_id);
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_player_prop_odds_player_stat
            ON public.player_prop_odds (player_norm, stat_key);
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_player_prop_odds_book_player_stat
            ON public.player_prop_odds (book, player_norm, stat_key);
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_player_prop_odds_scraped
            ON public.player_prop_odds (scraped_at_utc DESC);
            """
        )

        cur.execute(
            """
            CREATE OR REPLACE VIEW public.latest_player_prop_odds AS
            WITH latest AS (
                SELECT
                    book,
                    league,
                    MAX(scraped_at_utc) AS latest_scraped_at_utc
                FROM public.player_prop_odds
                WHERE valid = TRUE
                GROUP BY book, league
            )
            SELECT p.*
            FROM public.player_prop_odds p
            JOIN latest l
                ON l.book = p.book
               AND l.league = p.league
               AND l.latest_scraped_at_utc = p.scraped_at_utc
            WHERE p.valid = TRUE;
            """
        )

    con.commit()


def build_snapshot_row(rows: list[dict]) -> tuple:
    snapshot_id = rows[0].get("snapshot_id") if rows else ""
    book = rows[0].get("book") or "betano"
    league = rows[0].get("league") or "NBA"
    scraped_at_source = rows[0].get("scraped_at_source")
    scraped_at_utc = rows[0].get("scraped_at_utc") or None
    source_file = rows[0].get("source_file")

    rows_total = len(rows)
    rows_valid = sum(1 for r in rows if to_bool(r.get("valid", "1")))

    return (
        snapshot_id,
        book,
        league,
        scraped_at_source,
        scraped_at_utc,
        source_file,
        rows_total,
        rows_valid,
    )


def build_odds_rows(rows: list[dict]) -> list[tuple]:
    out = []

    for r in rows:
        valid = to_bool(r.get("valid", "1"))

        if not valid:
            continue

        row_uid = r.get("row_uid")
        player_norm = r.get("player_norm")
        stat_key = r.get("stat_key")
        odds_decimal = to_float(r.get("odds_decimal"))
        threshold = to_float(r.get("threshold"))
        model_line = to_float(r.get("model_line"))

        if not row_uid or not player_norm or not stat_key:
            continue

        if odds_decimal is None or threshold is None or model_line is None:
            continue

        side = (r.get("side") or "over").strip().lower()

        if side not in ("over", "under"):
            side = "over"

        out.append(
            (
                row_uid,
                r.get("snapshot_id"),
                r.get("scraped_at_source"),
                r.get("scraped_at_utc") or None,
                r.get("book") or "betano",
                r.get("sport"),
                r.get("league") or "NBA",
                r.get("source_file"),
                r.get("partido"),
                r.get("game_norm"),
                r.get("jugador"),
                player_norm,
                r.get("mercado_raw"),
                r.get("linea_raw"),
                r.get("handicap_raw"),
                odds_decimal,
                r.get("market_key"),
                stat_key,
                side,
                threshold,
                model_line,
                r.get("event_text"),
                True,
                r.get("error"),
            )
        )

    return out


def insert_snapshot(con, snapshot_row: tuple) -> None:
    with con.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.odds_snapshots (
                snapshot_id,
                book,
                league,
                scraped_at_source,
                scraped_at_utc,
                source_file,
                rows_total,
                rows_valid
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (snapshot_id)
            DO UPDATE SET
                book = EXCLUDED.book,
                league = EXCLUDED.league,
                scraped_at_source = EXCLUDED.scraped_at_source,
                scraped_at_utc = EXCLUDED.scraped_at_utc,
                source_file = EXCLUDED.source_file,
                rows_total = EXCLUDED.rows_total,
                rows_valid = EXCLUDED.rows_valid;
            """,
            snapshot_row,
        )


def insert_odds(con, odds_rows: list[tuple]) -> int:
    if not odds_rows:
        return 0

    sql = """
        INSERT INTO public.player_prop_odds (
            row_uid,
            snapshot_id,
            scraped_at_source,
            scraped_at_utc,
            book,
            sport,
            league,
            source_file,
            partido,
            game_norm,
            jugador,
            player_norm,
            mercado_raw,
            linea_raw,
            handicap_raw,
            odds_decimal,
            market_key,
            stat_key,
            side,
            threshold,
            model_line,
            event_text,
            valid,
            error
        )
        VALUES %s
        ON CONFLICT (row_uid)
        DO UPDATE SET
            snapshot_id = EXCLUDED.snapshot_id,
            scraped_at_source = EXCLUDED.scraped_at_source,
            scraped_at_utc = EXCLUDED.scraped_at_utc,
            book = EXCLUDED.book,
            sport = EXCLUDED.sport,
            league = EXCLUDED.league,
            source_file = EXCLUDED.source_file,
            partido = EXCLUDED.partido,
            game_norm = EXCLUDED.game_norm,
            jugador = EXCLUDED.jugador,
            player_norm = EXCLUDED.player_norm,
            mercado_raw = EXCLUDED.mercado_raw,
            linea_raw = EXCLUDED.linea_raw,
            handicap_raw = EXCLUDED.handicap_raw,
            odds_decimal = EXCLUDED.odds_decimal,
            market_key = EXCLUDED.market_key,
            stat_key = EXCLUDED.stat_key,
            side = EXCLUDED.side,
            threshold = EXCLUDED.threshold,
            model_line = EXCLUDED.model_line,
            event_text = EXCLUDED.event_text,
            valid = EXCLUDED.valid,
            error = EXCLUDED.error,
            updated_at_utc = NOW();
    """

    with con.cursor() as cur:
        execute_values(cur, sql, odds_rows, page_size=1000)

    return len(odds_rows)


def print_summary(input_path: str, rows: list[dict], odds_rows: list[tuple]) -> None:
    valid_rows = [r for r in rows if to_bool(r.get("valid", "1"))]
    counts = Counter(r.get("stat_key", "") for r in valid_rows)
    snapshot_id = rows[0].get("snapshot_id") if rows else ""

    print("=" * 72)
    print("⬆️  SUBIR CUOTAS BETANO HITOS A SUPABASE/POSTGRES")
    print("=" * 72)
    print(f"CSV normalizado : {input_path}")
    print(f"Snapshot        : {snapshot_id}")
    print(f"Filas totales   : {len(rows)}")
    print(f"Filas válidas   : {len(valid_rows)}")
    print(f"Filas a subir   : {len(odds_rows)}")

    print("\nPor stat_key:")
    for stat, n in counts.most_common():
        print(f"  {stat:>8}  {n}")

    if odds_rows:
        print("\nEjemplo primera fila:")
        sample = odds_rows[0]
        print(f"  jugador      : {sample[10]}")
        print(f"  player_norm  : {sample[11]}")
        print(f"  stat_key     : {sample[17]}")
        print(f"  threshold    : {sample[19]}")
        print(f"  model_line   : {sample[20]}")
        print(f"  odds_decimal : {sample[15]}")


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Sube cuotas Betano hitos normalizadas a Supabase/Postgres."
    )

    ap.add_argument(
        "--input",
        help="CSV normalizado. Si no se pasa, detecta el más reciente.",
    )

    ap.add_argument(
        "--input-dir",
        default="cuotas_procesadas",
        help="Carpeta de CSV normalizados.",
    )

    ap.add_argument(
        "--pattern",
        default="betano_hitos_*.csv",
        help="Patrón de CSV normalizado.",
    )

    ap.add_argument(
        "--db-url",
        help="URL Postgres/Supabase. Si no se pasa, usa SUPABASE_DATABASE_URL, DIRECT_URL o DATABASE_URL.",
    )

    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="No inserta, solo muestra resumen.",
    )

    args = ap.parse_args()

    input_path = args.input or latest_file(args.input_dir, [args.pattern])
    rows = read_csv_dicts(input_path)

    if not rows:
        print("No hay filas en el CSV.")
        sys.exit(1)

    odds_rows = build_odds_rows(rows)
    snapshot_row = build_snapshot_row(rows)

    print_summary(input_path, rows, odds_rows)

    if args.dry_run:
        print("\n[dry-run] No se insertó nada.")
        return

    db_url = get_database_url(args.db_url)

    print("\nConectando a Postgres/Supabase...")
    con = psycopg2.connect(db_url)

    try:
        ensure_tables(con)
        insert_snapshot(con, snapshot_row)
        inserted = insert_odds(con, odds_rows)
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    print(f"\n✅ Insertadas/actualizadas: {inserted} filas en public.player_prop_odds")
    print("✅ Snapshot actualizado en public.odds_snapshots")


if __name__ == "__main__":
    main()