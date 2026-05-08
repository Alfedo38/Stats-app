#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
procesar_betano_hitos.py

Toma el CSV crudo de Betano (props_nba_*.csv o lineas_nba_*.csv), filtra mercados de HITOS,
normaliza nombres/líneas y genera un CSV listo para subir a DB.

Uso típico:
  python3 procesar_betano_hitos.py
  python3 procesar_betano_hitos.py --input betano_props/props_nba_20260508_163041.csv
  python3 procesar_betano_hitos.py --source-tz America/Argentina/Buenos_Aires --dry-run
"""

from __future__ import annotations

import argparse
import os
from collections import Counter
from pathlib import Path

from betano_hitos_utils import (
    BOOK,
    LEAGUE,
    SPORT,
    HITOS_MARKET_MAP,
    is_hito_market,
    latest_file,
    market_lookup_key,
    normalize_text,
    parse_decimal,
    parse_hito_line,
    read_csv_dicts,
    row_uid,
    snapshot_datetime_from_filename,
    snapshot_from_filename,
    write_csv_dicts,
)

OUTPUT_FIELDS = [
    "row_uid",
    "snapshot_id",
    "scraped_at_source",
    "scraped_at_utc",
    "book",
    "sport",
    "league",
    "source_file",
    "partido",
    "game_norm",
    "jugador",
    "player_norm",
    "mercado_raw",
    "linea_raw",
    "handicap_raw",
    "odds_decimal",
    "market_key",
    "stat_key",
    "side",
    "threshold",
    "model_line",
    "event_text",
    "valid",
    "error",
]


def normalize_row(raw: dict, source_file: str, source_tz: str) -> dict:
    snapshot_id = snapshot_from_filename(source_file)
    scraped_at_source, scraped_at_utc = snapshot_datetime_from_filename(source_file, source_tz)

    partido = (raw.get("partido") or "").strip()
    jugador = (raw.get("jugador") or "").strip()
    mercado = (raw.get("mercado") or "").strip()
    linea = (raw.get("linea") or "").strip()
    handicap = (raw.get("handicap") or "").strip()
    cuota_raw = (raw.get("cuota") or "").strip()

    errors: list[str] = []

    lookup = market_lookup_key(mercado)
    if lookup not in HITOS_MARKET_MAP:
        errors.append(f"mercado_no_soportado:{mercado}")
        market_key, stat_key = "", ""
    else:
        market_key, stat_key = HITOS_MARKET_MAP[lookup]

    threshold, model_line, err = parse_hito_line(linea)
    if err:
        errors.append(err)

    odds_decimal, err = parse_decimal(cuota_raw)
    if err:
        errors.append(err)

    player_norm = normalize_text(jugador)
    game_norm = normalize_text(partido)

    if not jugador:
        errors.append("jugador_vacio")
    if not partido:
        errors.append("partido_vacio")

    valid = not errors
    uid = row_uid(BOOK, snapshot_id, game_norm, player_norm, market_key, stat_key, linea, odds_decimal)

    event_text = ""
    if valid:
        stat_label = stat_key
        event_text = f"{jugador} {linea} {stat_label}"

    return {
        "row_uid": uid,
        "snapshot_id": snapshot_id,
        "scraped_at_source": scraped_at_source,
        "scraped_at_utc": scraped_at_utc,
        "book": BOOK,
        "sport": SPORT,
        "league": LEAGUE,
        "source_file": os.path.basename(source_file),
        "partido": partido,
        "game_norm": game_norm,
        "jugador": jugador,
        "player_norm": player_norm,
        "mercado_raw": mercado,
        "linea_raw": linea,
        "handicap_raw": handicap,
        "odds_decimal": "" if odds_decimal is None else f"{odds_decimal:.6g}",
        "market_key": market_key,
        "stat_key": stat_key,
        "side": "over",
        "threshold": "" if threshold is None else f"{threshold:.6g}",
        "model_line": "" if model_line is None else f"{model_line:.6g}",
        "event_text": event_text,
        "valid": "1" if valid else "0",
        "error": ";".join(errors),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Procesa cuotas Betano NBA de mercados de hitos.")
    ap.add_argument("--input", help="CSV crudo. Si no se pasa, detecta el más reciente.")
    ap.add_argument("--input-dir", default="betano_props", help="Carpeta donde están los CSV crudos.")
    ap.add_argument("--patterns", default="props_nba_*.csv,lineas_nba_*.csv", help="Patrones separados por coma.")
    ap.add_argument("--output-dir", default="cuotas_procesadas", help="Carpeta de salida.")
    ap.add_argument("--source-tz", default="America/Argentina/Buenos_Aires", help="Timezone del timestamp del archivo.")
    ap.add_argument("--include-invalid", action="store_true", help="También guarda filas inválidas para debug.")
    ap.add_argument("--dry-run", action="store_true", help="No escribe archivo, solo muestra resumen.")
    args = ap.parse_args()

    input_path = args.input or latest_file(args.input_dir, [p.strip() for p in args.patterns.split(",") if p.strip()])
    raw_rows = read_csv_dicts(input_path)

    normalized = []
    skipped_non_hito = 0
    for raw in raw_rows:
        mercado = (raw.get("mercado") or "").strip()
        if not is_hito_market(mercado):
            skipped_non_hito += 1
            continue
        nr = normalize_row(raw, input_path, args.source_tz)
        if args.include_invalid or nr["valid"] == "1":
            normalized.append(nr)

    counts = Counter(r["stat_key"] for r in normalized if r["valid"] == "1")
    invalid = [r for r in normalized if r["valid"] != "1"]

    print("=" * 72)
    print("🏀 PROCESAR BETANO HITOS")
    print("=" * 72)
    print(f"CSV crudo           : {input_path}")
    print(f"Filas crudas        : {len(raw_rows)}")
    print(f"No hitos ignoradas  : {skipped_non_hito}")
    print(f"Hitos procesadas    : {len(normalized)}")
    print(f"Inválidas guardadas : {len(invalid)}")
    print("\nPor stat_key:")
    for stat, n in counts.most_common():
        print(f"  {stat:>4}  {n}")

    if args.dry_run:
        print("\n[dry-run] No se escribió archivo.")
        return

    snapshot_id = snapshot_from_filename(input_path)
    output_path = Path(args.output_dir) / f"betano_hitos_{snapshot_id}.csv"
    write_csv_dicts(str(output_path), normalized, OUTPUT_FIELDS)
    print(f"\n✅ CSV normalizado → {output_path}")


if __name__ == "__main__":
    main()
