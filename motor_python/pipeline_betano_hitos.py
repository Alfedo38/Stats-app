#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline_betano_hitos.py

Orquestador simple para correr el flujo Betano hitos.
No ejecuta scraperb.py porque ese depende de Chrome/DrissionPage; primero corrés scraperb.py aparte.

Uso:
  python3 pipeline_betano_hitos.py --dry-run --top 20
  python3 pipeline_betano_hitos.py --db ludo.db --pred-table predicciones_ludo --top 20
"""

from __future__ import annotations

import argparse
import subprocess
import sys


def run(cmd: list[str]) -> None:
    print("\n$ " + " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Pipeline Betano hitos: procesar -> subir -> picks.")
    ap.add_argument("--db", default="ludo.db")
    ap.add_argument("--pred-table", default="ludo_predictions")
    ap.add_argument("--source-tz", default="America/Argentina/Buenos_Aires")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    py = sys.executable

    run([py, "procesar_betano_hitos.py", "--source-tz", args.source_tz])

    subir_cmd = [py, "subir_cuotas_betano_hitos.py", "--db", args.db]
    if args.dry_run:
        subir_cmd.append("--dry-run")
    run(subir_cmd)

    if args.dry_run:
        print("\n[dry-run] Pipeline detenido antes de picks porque las cuotas no fueron insertadas en DB.")
        print("Para probar picks: primero ejecutá subir_cuotas_betano_hitos.py sin --dry-run, y luego corré generar_picks_betano_hitos_ludo.py --dry-run.")
        return

    picks_cmd = [
        py, "generar_picks_betano_hitos_ludo.py",
        "--db", args.db,
        "--pred-table", args.pred_table,
        "--top", str(args.top),
        "--save-db",
    ]
    run(picks_cmd)


if __name__ == "__main__":
    main()
