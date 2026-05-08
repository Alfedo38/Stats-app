#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
subir_cuotas_betano_hitos.py

Sube el CSV normalizado de procesar_betano_hitos.py a SQLite.
Crea dos tablas:
  - odds_snapshots
  - odds_betano_hitos

Uso:
  python3 subir_cuotas_betano_hitos.py --dry-run
  python3 subir_cuotas_betano_hitos.py
  python3 subir_cuotas_betano_hitos.py --db data/ludo.db --input cuotas_procesadas/betano_hitos_YYYYMMDD_HHMMSS.csv
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from collections import Counter
from pathlib import Path

from betano_hitos_utils import latest_file, read_csv_dicts

ODDS_TABLE = "odds_betano_hitos"
SNAP_TABLE = "odds_snapshots"


def connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True) if Path(db_path).parent != Path(".") else None
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def ensure_tables(con: sqlite3.Connection) -> None:
    con.execute(f"""
    CREATE TABLE IF NOT EXISTS {SNAP_TABLE} (
        snapshot_id TEXT PRIMARY KEY,
        book TEXT NOT NULL,
        league TEXT NOT NULL,
        scraped_at_source TEXT,
        scraped_at_utc TEXT,
        source_file TEXT,
        rows_total INTEGER NOT NULL DEFAULT 0,
        rows_valid INTEGER NOT NULL DEFAULT 0,
        created_at_utc TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)
    con.execute(f"""
    CREATE TABLE IF NOT EXISTS {ODDS_TABLE} (
        row_uid TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        scraped_at_source TEXT,
        scraped_at_utc TEXT,
        book TEXT NOT NULL,
        sport TEXT,
        league TEXT,
        source_file TEXT,
        partido TEXT,
        game_norm TEXT,
        jugador TEXT,
        player_norm TEXT,
        mercado_raw TEXT,
        linea_raw TEXT,
        handicap_raw TEXT,
        odds_decimal REAL NOT NULL,
        market_key TEXT,
        stat_key TEXT NOT NULL,
        side TEXT NOT NULL,
        threshold REAL NOT NULL,
        model_line REAL NOT NULL,
        event_text TEXT,
        valid INTEGER NOT NULL DEFAULT 1,
        error TEXT,
        created_at_utc TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(snapshot_id) REFERENCES {SNAP_TABLE}(snapshot_id)
    )
    """)
    con.execute(f"CREATE INDEX IF NOT EXISTS idx_{ODDS_TABLE}_snapshot ON {ODDS_TABLE}(snapshot_id)")
    con.execute(f"CREATE INDEX IF NOT EXISTS idx_{ODDS_TABLE}_match ON {ODDS_TABLE}(player_norm, stat_key)")
    con.execute(f"CREATE INDEX IF NOT EXISTS idx_{ODDS_TABLE}_ev ON {ODDS_TABLE}(stat_key, odds_decimal)")
    con.commit()


def to_float(v: str) -> float:
    return float(str(v).replace(",", "."))


def insert_rows(con: sqlite3.Connection, rows: list[dict]) -> int:
    if not rows:
        return 0

    snapshot_id = rows[0]["snapshot_id"]
    book = rows[0].get("book", "betano")
    league = rows[0].get("league", "NBA")
    scraped_at_source = rows[0].get("scraped_at_source")
    scraped_at_utc = rows[0].get("scraped_at_utc")
    source_file = rows[0].get("source_file")
    rows_total = len(rows)
    rows_valid = sum(1 for r in rows if str(r.get("valid", "1")) == "1")

    con.execute(f"""
    INSERT OR REPLACE INTO {SNAP_TABLE}
    (snapshot_id, book, league, scraped_at_source, scraped_at_utc, source_file, rows_total, rows_valid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (snapshot_id, book, league, scraped_at_source, scraped_at_utc, source_file, rows_total, rows_valid))

    inserted = 0
    for r in rows:
        if str(r.get("valid", "1")) != "1":
            continue
        con.execute(f"""
        INSERT OR REPLACE INTO {ODDS_TABLE} (
            row_uid, snapshot_id, scraped_at_source, scraped_at_utc, book, sport, league, source_file,
            partido, game_norm, jugador, player_norm, mercado_raw, linea_raw, handicap_raw, odds_decimal,
            market_key, stat_key, side, threshold, model_line, event_text, valid, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r["row_uid"], r["snapshot_id"], r.get("scraped_at_source"), r.get("scraped_at_utc"),
            r.get("book"), r.get("sport"), r.get("league"), r.get("source_file"),
            r.get("partido"), r.get("game_norm"), r.get("jugador"), r.get("player_norm"),
            r.get("mercado_raw"), r.get("linea_raw"), r.get("handicap_raw"), to_float(r["odds_decimal"]),
            r.get("market_key"), r.get("stat_key"), r.get("side", "over"), to_float(r["threshold"]),
            to_float(r["model_line"]), r.get("event_text"), int(r.get("valid", "1")), r.get("error"),
        ))
        inserted += 1
    con.commit()
    return inserted


def main() -> None:
    ap = argparse.ArgumentParser(description="Sube cuotas Betano hitos normalizadas a SQLite.")
    ap.add_argument("--input", help="CSV normalizado. Si no se pasa, detecta el más reciente.")
    ap.add_argument("--input-dir", default="cuotas_procesadas", help="Carpeta de CSV normalizados.")
    ap.add_argument("--pattern", default="betano_hitos_*.csv", help="Patrón de CSV normalizado.")
    ap.add_argument("--db", default=os.getenv("LUDO_DB_PATH", "ludo.db"), help="Ruta SQLite. También acepta env LUDO_DB_PATH.")
    ap.add_argument("--dry-run", action="store_true", help="No inserta, solo muestra resumen.")
    args = ap.parse_args()

    input_path = args.input or latest_file(args.input_dir, [args.pattern])
    rows = read_csv_dicts(input_path)
    valid_rows = [r for r in rows if str(r.get("valid", "1")) == "1"]
    counts = Counter(r.get("stat_key", "") for r in valid_rows)
    snapshot_id = rows[0].get("snapshot_id") if rows else ""

    print("=" * 72)
    print("⬆️  SUBIR CUOTAS BETANO HITOS")
    print("=" * 72)
    print(f"CSV normalizado : {input_path}")
    print(f"DB              : {args.db}")
    print(f"Snapshot        : {snapshot_id}")
    print(f"Filas totales   : {len(rows)}")
    print(f"Filas válidas   : {len(valid_rows)}")
    print("\nPor stat_key:")
    for stat, n in counts.most_common():
        print(f"  {stat:>4}  {n}")

    if args.dry_run:
        print("\n[dry-run] No se insertó nada.")
        return

    con = connect(args.db)
    ensure_tables(con)
    inserted = insert_rows(con, rows)
    con.close()
    print(f"\n✅ Insertadas/actualizadas: {inserted} filas en tabla {ODDS_TABLE}")


if __name__ == "__main__":
    main()
