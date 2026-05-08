#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
auto_ludo_post_scrape.py v3

Automatiza el flujo de Ludo DESPUÉS de scrapear manualmente las cuotas.

Pensado para tu estructura actual:
- scraper.py              -> lo corrés manualmente antes.
- procesar.py             -> procesa el dump y genera cuotas_procesadas/lineas_nba_*.csv.
- subir_cuotas.py         -> sube cuotas a player_odds usando event_date y timezone.
- generar_predicciones_ludo.py
- generar_picks_ludo.py

Orden automático:
1) procesar.py
2) detectar último CSV lineas_nba_*.csv
3) subir_cuotas.py --source-tz UTC --dry-run
4) subir_cuotas.py --source-tz UTC
5) generar_predicciones_ludo.py --save-db
6) generar_picks_ludo.py --dry-run --top N
7) generar_picks_ludo.py

Uso normal:
    python3 auto_ludo_post_scrape.py

Uso sin preguntas:
    python3 auto_ludo_post_scrape.py --yes

Solo validar cuotas, sin subir nada:
    python3 auto_ludo_post_scrape.py --dry-run-only

Usar CSV específico:
    python3 auto_ludo_post_scrape.py --csv cuotas_procesadas/lineas_nba_YYYYMMDD_HHMM.csv --yes

Saltar procesar.py si ya tenés CSV:
    python3 auto_ludo_post_scrape.py --skip-procesar --yes
"""

from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parent
CUOTAS_DIR = ROOT / "cuotas_procesadas"
LOG_DIR = ROOT / "logs"

# Tu archivo actual se llama procesar.py.
# Dejo otros nombres como fallback por si más adelante lo renombrás.
PROCESSOR_CANDIDATES = [
    "procesar.py",
    "procesar_stake.py",
    "procesar_cuotas.py",
    "procesar_cuotas_stake.py",
    "procesar_lineas.py",
    "procesar_ludo_stake.py",
]


class StepError(RuntimeError):
    """Error controlado de un paso del flujo."""
    pass


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def latest_csv() -> Optional[Path]:
    files = sorted(
        CUOTAS_DIR.glob("lineas_nba_*.csv"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return files[0] if files else None


def find_processor(explicit_processor: str = "") -> Optional[Path]:
    if explicit_processor:
        p = Path(explicit_processor)
        if not p.is_absolute():
            p = ROOT / p
        p = p.resolve()
        if not p.exists():
            raise StepError(f"No existe el procesador indicado: {p}")
        return p

    for name in PROCESSOR_CANDIDATES:
        p = ROOT / name
        if p.exists():
            return p.resolve()

    return None


def init_log(args: argparse.Namespace) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"ludo_auto_{now_stamp()}.log"
    log_path.write_text(
        "LUDO AUTO POST SCRAPE v3\n"
        + "=" * 80
        + f"\nFecha: {datetime.now().isoformat(timespec='seconds')}\n"
        + f"Root: {ROOT}\n"
        + f"Args: {args}\n"
        + "=" * 80
        + "\n\n",
        encoding="utf-8",
    )
    return log_path


def log_line(log_path: Path, text: str = "") -> None:
    print(text)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(text + "\n")


def run_cmd(cmd: list[str], log_path: Path, title: str) -> int:
    log_line(log_path, "")
    log_line(log_path, "─" * 80)
    log_line(log_path, f"▶ {title}")
    log_line(log_path, "$ " + " ".join(shlex.quote(c) for c in cmd))
    log_line(log_path, "─" * 80)

    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert proc.stdout is not None
    for line in proc.stdout:
        log_line(log_path, line.rstrip("\n"))

    rc = proc.wait()

    if rc != 0:
        raise StepError(f"Falló el paso: {title} | exit_code={rc}")

    log_line(log_path, f"✅ OK: {title}")
    return rc


def confirm_or_abort(message: str, assume_yes: bool) -> None:
    if assume_yes:
        return

    ans = input(f"\n{message} [s/N]: ").strip().lower()
    if ans not in {"s", "si", "sí", "y", "yes"}:
        raise StepError("Cancelado por el usuario.")


def choose_csv(args: argparse.Namespace) -> Path:
    if args.csv:
        csv_path = Path(args.csv)
        if not csv_path.is_absolute():
            csv_path = ROOT / csv_path
        csv_path = csv_path.resolve()

        if not csv_path.exists():
            raise StepError(f"No existe el CSV indicado: {csv_path}")

        return csv_path

    csv_path = latest_csv()
    if not csv_path:
        raise StepError(
            f"No encontré CSVs lineas_nba_*.csv en {CUOTAS_DIR}. "
            "Si tu scraper/procesador genera otro nombre o carpeta, pasá el archivo con --csv."
        )

    return csv_path.resolve()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Automatiza Ludo después de scrapear cuotas manualmente."
    )

    parser.add_argument(
        "--csv",
        default="",
        help="CSV específico a subir. Si no se indica, usa el último lineas_nba_*.csv.",
    )
    parser.add_argument(
        "--processor",
        default="",
        help="Script procesador específico. Por defecto busca procesar.py y otros nombres conocidos.",
    )
    parser.add_argument(
        "--source-tz",
        default="UTC",
        help="Timezone origen para Fecha_Partido. Default: UTC.",
    )
    parser.add_argument(
        "--target-tz",
        default="America/Argentina/Buenos_Aires",
        help="Timezone destino para event_date. Default: America/Argentina/Buenos_Aires.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=40,
        help="Cantidad de picks a mostrar en el dry-run de generar_picks_ludo.py.",
    )
    parser.add_argument(
        "--skip-procesar",
        action="store_true",
        help="No corre procesar.py. Usa --csv o el último CSV existente.",
    )
    parser.add_argument(
        "--dry-run-only",
        action="store_true",
        help="Solo valida cuotas con dry-run. No sube cuotas, no predice y no guarda picks.",
    )
    parser.add_argument(
        "--no-save-picks",
        action="store_true",
        help="Genera predicciones y dry-run de picks, pero no guarda ludo_picks.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="No pide confirmación antes de subir cuotas y guardar picks.",
    )

    args = parser.parse_args()
    log_path = init_log(args)

    try:
        log_line(log_path, "🏀 LUDO AUTO POST-SCRAPE v3")
        log_line(log_path, "=" * 80)
        log_line(log_path, "Este script asume que YA corriste el scraper manualmente.")
        log_line(log_path, f"Log: {log_path}")

        # 1) Procesar cuotas si corresponde.
        if args.skip_procesar:
            log_line(log_path, "")
            log_line(log_path, "⏭️ Saltando procesador por --skip-procesar")
        else:
            processor = find_processor(args.processor)
            if processor:
                run_cmd(
                    [sys.executable, str(processor)],
                    log_path,
                    f"Procesar cuotas con {processor.name}",
                )
            else:
                existing_csv = latest_csv()
                if existing_csv:
                    log_line(log_path, "")
                    log_line(log_path, "⚠️ No encontré procesador conocido.")
                    log_line(log_path, f"➡️ Uso el último CSV existente: {existing_csv}")
                    log_line(log_path, "   Para evitar este aviso usá --skip-procesar.")
                else:
                    raise StepError(
                        "No encontré procesador ni CSV lineas_nba_*.csv. "
                        "Pasá el CSV con --csv o indicá procesador con --processor."
                    )

        # 2) Elegir CSV.
        csv_path = choose_csv(args)
        log_line(log_path, "")
        log_line(log_path, f"📄 CSV elegido: {csv_path}")

        # 3) Validar subida de cuotas.
        subir_base = [
            sys.executable,
            "subir_cuotas.py",
            "--file",
            str(csv_path),
            "--source-tz",
            args.source_tz,
            "--target-tz",
            args.target_tz,
        ]

        run_cmd(
            subir_base + ["--dry-run", "--no-archive"],
            log_path,
            "Validar subida de cuotas con dry-run",
        )

        if args.dry_run_only:
            log_line(log_path, "")
            log_line(log_path, "🧪 --dry-run-only activo: no se sube ni se guarda nada más.")
            log_line(log_path, f"📄 Log completo: {log_path}")
            return 0

        # 4) Subir cuotas reales.
        confirm_or_abort("¿Dry-run de cuotas salió bien? ¿Subimos player_odds ahora?", args.yes)
        run_cmd(subir_base, log_path, "Subir cuotas reales a player_odds")

        # 5) Generar predicciones.
        run_cmd(
            [sys.executable, "generar_predicciones_ludo.py", "--save-db"],
            log_path,
            "Generar predicciones y guardar en ludo_prop_predictions",
        )

        # 6) Dry-run picks.
        run_cmd(
            [sys.executable, "generar_picks_ludo.py", "--dry-run", "--top", str(args.top)],
            log_path,
            "Generar picks dry-run",
        )

        if args.no_save_picks:
            log_line(log_path, "")
            log_line(log_path, "⏭️ No se guardan picks finales por --no-save-picks")
            log_line(log_path, f"📄 Log completo: {log_path}")
            return 0

        # 7) Guardar picks.
        confirm_or_abort("¿Dry-run de picks salió bien? ¿Guardamos ludo_picks ahora?", args.yes)
        run_cmd(
            [sys.executable, "generar_picks_ludo.py"],
            log_path,
            "Guardar picks finales en ludo_picks",
        )

        log_line(log_path, "")
        log_line(log_path, "✅ FLUJO COMPLETO TERMINADO")
        log_line(log_path, f"📄 Log completo: {log_path}")
        log_line(log_path, "")
        log_line(log_path, "Verificación sugerida en DBeaver:")
        log_line(log_path, """
SELECT
    id,
    pick_date,
    run_id,
    status,
    jsonb_array_length(json_data::jsonb) AS bloques,
    created_at
FROM ludo_picks
WHERE pick_date IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
""".strip())

        return 0

    except StepError as e:
        log_line(log_path, "")
        log_line(log_path, f"❌ ERROR: {e}")
        log_line(log_path, f"📄 Revisá el log: {log_path}")
        return 1

    except KeyboardInterrupt:
        log_line(log_path, "")
        log_line(log_path, "❌ Cancelado con Ctrl+C")
        log_line(log_path, f"📄 Revisá el log: {log_path}")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())