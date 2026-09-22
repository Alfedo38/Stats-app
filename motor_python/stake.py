#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
stake.py — LUDO AUTO PIPELINE v6

Flujo completo, listo para cron/crontab:
1) scraper.py
2) procesar.py
3) detectar último CSV lineas_nba_*.csv
4) resolver fechas NBA automáticamente contra calendario ESPN
5) validar fechas y abortar si parecen demasiado lejanas
6) subir_cuotas.py --dry-run
7) subir_cuotas.py real
8) generar_predicciones_ludo.py --save-db --run-id <run_id>
9) generar_picks_ludo.py --dry-run --run-id <run_id>
10) guardar picks finales solo si el dry-run generó tickets

Uso normal cron-friendly, sin preguntas:
    python3 stake.py --yes

Uso manual con preguntas:
    python3 stake.py --ask

Solo validar cuotas, sin subir ni generar picks:
    python3 stake.py --dry-run-only --yes

Saltar scraper si ya lo corriste:
    python3 stake.py --skip-scraper --yes

Saltar procesar si ya tenés CSV:
    python3 stake.py --skip-procesar --csv cuotas_procesadas/lineas_nba_YYYYMMDD_HHMM.csv --yes

No guardar picks finales:
    python3 stake.py --no-save-picks --yes

Con globales:
    python3 stake.py --include-global --yes

Ejemplo crontab:
    05 10 * * * cd /home/alfedo/stats-app/motor_python && /usr/bin/python3 stake.py --yes >> logs/cron_ludo.log 2>&1
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shlex
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

try:
    import fcntl
except Exception:  # pragma: no cover
    fcntl = None  # type: ignore


ROOT = Path(__file__).resolve().parent
CUOTAS_DIR = ROOT / "cuotas_procesadas"
LOG_DIR = ROOT / "logs"
PREVIEW_JSON = ROOT / "ludo_picks_preview.json"
LOCK_FILE = LOG_DIR / "ludo_auto.lock"

ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"

SCRAPER_CANDIDATES = [
    "scraper.py",
    "stake_nba_props.py",
    "scraper_stake.py",
    "scraper_stake_nba.py",
    "stake_scraper.py",
]

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


# =============================================================================
# Utilidades base
# =============================================================================

def load_env_file() -> Optional[Path]:
    """Carga .env.local/.env para que los scripts hijos hereden credenciales."""
    candidates = [
        ROOT / ".env.local",
        ROOT / ".env",
        ROOT.parent / ".env.local",
        ROOT.parent / ".env",
        Path.home() / "stats-app" / ".env.local",
        Path.home() / "stats-app" / ".env",
    ]

    for env_path in candidates:
        if not env_path.exists():
            continue

        with env_path.open("r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key:
                    os.environ[key] = value

        return env_path

    return None


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def local_today(tz_name: str) -> date:
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo(tz_name)).date()
        except Exception:
            pass
    return date.today()


def init_log(args: argparse.Namespace, env_path: Optional[Path]) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"ludo_auto_{now_stamp()}.log"
    log_path.write_text(
        "LUDO AUTO PIPELINE v6\n"
        + "=" * 80
        + f"\nFecha: {datetime.now().isoformat(timespec='seconds')}\n"
        + f"Root: {ROOT}\n"
        + f"Env: {env_path if env_path else 'NO CARGADO'}\n"
        + f"Args: {args}\n"
        + "=" * 80
        + "\n\n",
        encoding="utf-8",
    )
    return log_path


def log_line(log_path: Path, text: str = "") -> None:
    print(text, flush=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(text + "\n")


def run_cmd(cmd: list[str], log_path: Path, title: str) -> int:
    log_line(log_path, "")
    log_line(log_path, "─" * 80)
    log_line(log_path, f"▶ {title}")
    log_line(log_path, "$ " + " ".join(shlex.quote(str(c)) for c in cmd))
    log_line(log_path, "─" * 80)

    proc = subprocess.Popen(
        [str(c) for c in cmd],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=os.environ.copy(),
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


def resolve_script(explicit: str, candidates: list[str], label: str) -> Path:
    if explicit:
        p = Path(explicit)
        if not p.is_absolute():
            p = ROOT / p
        p = p.resolve()
        if not p.exists():
            raise StepError(f"No existe el {label} indicado: {p}")
        return p

    for name in candidates:
        p = ROOT / name
        if p.exists():
            return p.resolve()

    raise StepError(
        f"No encontré {label}. Busqué: {', '.join(candidates)}. "
        f"Pasá la ruta con --{label}."
    )


@contextmanager
def pipeline_lock(enabled: bool, log_path: Path):
    """Evita corridas superpuestas en cron."""
    if not enabled or fcntl is None:
        yield
        return

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise StepError(f"Ya hay otra corrida activa. Lock: {LOCK_FILE}")

        lock.write(f"pid={os.getpid()}\nstarted={datetime.now().isoformat()}\n")
        lock.flush()
        log_line(log_path, f"🔒 Lock activo: {LOCK_FILE}")

        try:
            yield
        finally:
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            except Exception:
                pass
            log_line(log_path, "🔓 Lock liberado")


# =============================================================================
# CSV y fechas
# =============================================================================

def latest_csv(after_mtime: float | None = None) -> Optional[Path]:
    files = sorted(
        CUOTAS_DIR.glob("lineas_nba_*.csv"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if after_mtime is not None:
        files = [p for p in files if p.stat().st_mtime >= after_mtime]
    return files[0] if files else None


def choose_csv(args: argparse.Namespace, after_mtime: float | None = None) -> Path:
    if args.csv:
        csv_path = Path(args.csv)
        if not csv_path.is_absolute():
            csv_path = ROOT / csv_path
        csv_path = csv_path.resolve()

        if not csv_path.exists():
            raise StepError(f"No existe el CSV indicado: {csv_path}")

        return csv_path

    csv_path = latest_csv(after_mtime=after_mtime)
    if not csv_path:
        csv_path = latest_csv()
        if csv_path:
            raise StepError(
                "No encontré un CSV nuevo generado en esta corrida. "
                f"Último CSV existente: {csv_path}. "
                "Revisá si procesar.py extrajo líneas o usá --csv para forzarlo."
            )
        raise StepError(
            f"No encontré CSVs lineas_nba_*.csv en {CUOTAS_DIR}. "
            "Pasá el archivo con --csv."
        )

    return csv_path.resolve()


def norm_text(s: Any) -> str:
    text = str(s or "").lower()
    text = text.replace("@", " ").replace("-", " ")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return " ".join(text.split())


def fetch_json_url(url: str, params: dict[str, str], timeout: int = 20) -> dict:
    full_url = url + "?" + urlencode(params)
    req = Request(
        full_url,
        headers={
            "User-Agent": "Mozilla/5.0 LudoPipeline/1.0",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def fetch_nba_schedule(start_date: date, days: int, log_path: Path) -> list[dict[str, str]]:
    """
    Lee calendario NBA desde ESPN para resolver la fecha real de cada matchup.
    No usa timezone para convertir horario: solo fecha calendario del scoreboard.
    """
    events: list[dict[str, str]] = []

    for i in range(days):
        d = start_date + timedelta(days=i)
        ymd = d.strftime("%Y%m%d")

        try:
            data = fetch_json_url(ESPN_SCOREBOARD_URL, {"dates": ymd})
        except Exception as e:
            log_line(log_path, f"⚠️ No pude leer calendario ESPN {ymd}: {e}")
            continue

        for ev in data.get("events", []) or []:
            comps = ((ev.get("competitions") or [{}])[0].get("competitors") or [])
            home = ""
            away = ""

            for c in comps:
                team = c.get("team", {}) or {}
                name = team.get("displayName") or team.get("name") or team.get("shortDisplayName") or ""
                ha = str(c.get("homeAway") or "").lower()
                if ha == "home":
                    home = str(name)
                elif ha == "away":
                    away = str(name)

            if home and away:
                events.append(
                    {
                        "fecha": d.strftime("%Y-%m-%d"),
                        "home": home,
                        "away": away,
                        "home_norm": norm_text(home),
                        "away_norm": norm_text(away),
                    }
                )

    return events


def read_csv_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_csv_rows(csv_path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def group_counts(rows: list[dict[str, str]]) -> dict[tuple[str, str], int]:
    counts: dict[tuple[str, str], int] = {}
    for r in rows:
        key = (str(r.get("Fecha_Partido") or ""), str(r.get("Partido") or ""))
        counts[key] = counts.get(key, 0) + 1
    return counts


def format_group_counts(rows: list[dict[str, str]]) -> str:
    counts = group_counts(rows)
    lines = []
    for (fecha, partido), n in sorted(counts.items(), key=lambda x: (x[0][0], x[0][1])):
        lines.append(f"   {fecha:<10} | {partido:<55} | {n}")
    return "\n".join(lines) if lines else "   (sin filas)"


def resolve_match_date(partido: str, schedule: list[dict[str, str]]) -> Optional[str]:
    p = norm_text(partido)
    for ev in schedule:
        if ev["home_norm"] in p and ev["away_norm"] in p:
            return ev["fecha"]
    return None


def resolve_dates_csv(csv_path: Path, args: argparse.Namespace, log_path: Path) -> None:
    if args.no_resolve_dates:
        log_line(log_path, "⏭️ Resolver fechas: desactivado por --no-resolve-dates")
        return

    rows = read_csv_rows(csv_path)
    if not rows:
        raise StepError(f"CSV vacío: {csv_path}")

    required = {"Fecha_Partido", "Partido"}
    missing = required - set(rows[0].keys())
    if missing:
        raise StepError(f"El CSV no tiene columnas requeridas para resolver fechas: {sorted(missing)}")

    start = args.schedule_start_date
    if start:
        try:
            start_date = datetime.strptime(start, "%Y-%m-%d").date()
        except ValueError:
            raise StepError(f"--schedule-start-date inválida: {start}. Usá YYYY-MM-DD.")
    else:
        start_date = local_today(args.target_tz)

    log_line(log_path, "")
    log_line(log_path, "🗓️ Resolviendo fechas NBA automáticamente")
    log_line(log_path, f"   Calendario desde: {start_date} | días={args.resolve_days}")
    log_line(log_path, "   Distribución ANTES:")
    log_line(log_path, format_group_counts(rows))

    schedule = fetch_nba_schedule(start_date, args.resolve_days, log_path)
    if not schedule:
        if args.allow_schedule_failure:
            log_line(log_path, "⚠️ No se pudo obtener calendario NBA. Continúo por --allow-schedule-failure.")
            return
        raise StepError("No pude obtener calendario NBA para resolver fechas. No subo para evitar fechas malas.")

    changes = 0
    unresolved: list[str] = []
    partidos = sorted({str(r.get("Partido") or "") for r in rows if r.get("Partido")})
    resolved_map: dict[str, str] = {}

    for partido in partidos:
        fecha_ok = resolve_match_date(partido, schedule)
        if fecha_ok:
            resolved_map[partido] = fecha_ok
        else:
            unresolved.append(partido)

    for r in rows:
        partido = str(r.get("Partido") or "")
        fecha_ok = resolved_map.get(partido)
        if fecha_ok and str(r.get("Fecha_Partido") or "") != fecha_ok:
            r["Fecha_Partido"] = fecha_ok
            changes += 1

    if changes:
        backup = csv_path.with_suffix(f".backup_fecha_auto_{now_stamp()}.csv")
        csv_path.rename(backup)
        write_csv_rows(csv_path, rows, list(rows[0].keys()))
        log_line(log_path, f"✅ Fechas corregidas automáticamente: {changes} filas")
        log_line(log_path, f"📦 Backup fecha anterior: {backup}")
    else:
        log_line(log_path, "✅ Fechas sin cambios: ya estaban alineadas o no hubo match con calendario")

    log_line(log_path, "   Distribución DESPUÉS:")
    log_line(log_path, format_group_counts(rows))

    if unresolved:
        log_line(log_path, "⚠️ Partidos sin resolver contra calendario NBA:")
        for p in unresolved:
            log_line(log_path, f"   - {p}")
        if not args.allow_unresolved_dates:
            # Solo aborta si hay fechas lejanas o si el usuario pidió estricto.
            if args.strict_date_resolve:
                raise StepError("Hay partidos sin resolver y --strict-date-resolve está activo.")


def validate_csv_dates(csv_path: Path, args: argparse.Namespace, log_path: Path) -> None:
    """Barrera anti fechas absurdas antes de subir a Supabase."""
    rows = read_csv_rows(csv_path)
    if not rows:
        raise StepError(f"CSV vacío: {csv_path}")

    today = local_today(args.target_tz)
    min_allowed = today - timedelta(days=args.max_date_past)
    max_allowed = today + timedelta(days=args.max_date_ahead)

    bad: dict[str, int] = {}
    for r in rows:
        raw = str(r.get("Fecha_Partido") or "")[:10]
        try:
            d = datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            bad[raw] = bad.get(raw, 0) + 1
            continue

        if d < min_allowed or d > max_allowed:
            bad[raw] = bad.get(raw, 0) + 1

    log_line(log_path, "")
    log_line(log_path, "🧱 Barrera de fechas antes de subir")
    log_line(log_path, f"   Hoy local: {today} | permitido: {min_allowed} a {max_allowed}")
    log_line(log_path, "   Distribución CSV final:")
    log_line(log_path, format_group_counts(rows))

    if bad and not args.allow_far_dates:
        details = ", ".join(f"{fecha}={n}" for fecha, n in sorted(bad.items()))
        raise StepError(
            "Fechas fuera de rango detectadas. No subo cuotas para no contaminar player_odds. "
            f"Fuera de rango: {details}. "
            "Usá resolver fechas o --allow-far-dates solo si estás seguro."
        )

    if bad:
        log_line(log_path, f"⚠️ Fechas fuera de rango permitidas por --allow-far-dates: {bad}")
    else:
        log_line(log_path, "✅ Fechas OK")


# =============================================================================
# Preview picks
# =============================================================================

def count_tickets_from_preview(preview_path: Path = PREVIEW_JSON) -> tuple[int, int]:
    """
    Cuenta bloques y tickets del preview generado por generar_picks_ludo.py.
    Soporta:
    - formato lista: [bloque, bloque]
    - formato dict por fecha: {"2026-05-11": [bloque, bloque]}
    """
    if not preview_path.exists():
        return 0, 0

    try:
        data = json.loads(preview_path.read_text(encoding="utf-8"))
    except Exception:
        return 0, 0

    blocks: list[dict] = []
    if isinstance(data, list):
        blocks = [b for b in data if isinstance(b, dict)]
    elif isinstance(data, dict):
        for value in data.values():
            if isinstance(value, list):
                blocks.extend([b for b in value if isinstance(b, dict)])

    ticket_count = 0
    for block in blocks:
        tickets = block.get("tickets", [])
        if isinstance(tickets, list):
            ticket_count += len(tickets)

    return len(blocks), ticket_count


# =============================================================================
# Main
# =============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Automatiza Ludo completo: scraper → picks.")

    parser.add_argument("--scraper", default="", help="Script scraper. Default: busca scraper.py y nombres conocidos.")
    parser.add_argument("--processor", default="", help="Script procesador. Default: busca procesar.py y nombres conocidos.")
    parser.add_argument("--csv", default="", help="CSV específico a subir. Si no se indica, usa el CSV nuevo de esta corrida.")

    parser.add_argument("--source-tz", default="auto", help="Timezone origen para Fecha_Partido. Default: auto.")
    parser.add_argument("--target-tz", default="America/Argentina/Buenos_Aires", help="Timezone destino para event_date.")
    parser.add_argument("--top", type=int, default=80, help="Cantidad de picks a mostrar en dry-run.")
    parser.add_argument("--max-tickets-per-matchup", type=int, default=8, help="Máximo de tickets por partido.")
    parser.add_argument("--include-global", action="store_true", help="Pasa --include-global a generar_picks_ludo.py.")

    parser.add_argument("--skip-scraper", action="store_true", help="No corre scraper.py.")
    parser.add_argument("--skip-procesar", action="store_true", help="No corre procesar.py. Usa --csv o el último CSV.")
    parser.add_argument("--dry-run-only", action="store_true", help="Solo valida cuotas con dry-run. No sube, no predice y no guarda picks.")
    parser.add_argument("--no-save-picks", action="store_true", help="Genera predicciones y dry-run de picks, pero no guarda ludo_picks.")
    parser.add_argument("--allow-empty-picks", action="store_true", help="Permite guardar ludo_picks aunque el dry-run genere 0 tickets. No recomendado.")

    # Cron-friendly: por defecto no pregunta. --ask vuelve al modo manual.
    parser.add_argument("--yes", action="store_true", help="Acepta automáticamente. Queda por compatibilidad; el modo default ya es cron-friendly.")
    parser.add_argument("--ask", action="store_true", help="Pide confirmación manual antes de subir cuotas y guardar picks.")

    # Resolución/validación de fechas.
    parser.add_argument("--no-resolve-dates", action="store_true", help="No corrige fechas con calendario NBA.")
    parser.add_argument("--resolve-days", type=int, default=14, help="Días hacia adelante para buscar partidos en ESPN.")
    parser.add_argument("--schedule-start-date", default="", help="Fecha inicial YYYY-MM-DD para calendario. Default: hoy local.")
    parser.add_argument("--strict-date-resolve", action="store_true", help="Aborta si algún partido no se puede resolver contra calendario NBA.")
    parser.add_argument("--allow-unresolved-dates", action="store_true", help="Permite partidos sin resolver contra calendario.")
    parser.add_argument("--allow-schedule-failure", action="store_true", help="Permite continuar si ESPN falla. No recomendado.")
    parser.add_argument("--max-date-ahead", type=int, default=3, help="Máximo de días hacia adelante permitidos para subir. Default: 3.")
    parser.add_argument("--max-date-past", type=int, default=1, help="Máximo de días hacia atrás permitidos para subir. Default: 1.")
    parser.add_argument("--allow-far-dates", action="store_true", help="Permite fechas fuera del rango de seguridad. No recomendado.")

    parser.add_argument("--no-lock", action="store_true", help="Desactiva lock anti corridas superpuestas.")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env_path = load_env_file()
    log_path = init_log(args, env_path)

    # Para cron: default = sí a todo. Para manual: usá --ask.
    assume_yes = True
    if args.ask:
        assume_yes = False
    if args.yes:
        assume_yes = True

    try:
        with pipeline_lock(enabled=not args.no_lock, log_path=log_path):
            log_line(log_path, "🏀 LUDO AUTO PIPELINE v6")
            log_line(log_path, "=" * 80)
            log_line(log_path, "Flujo: scraper → procesar → resolver fechas → subir cuotas → predicciones → picks")
            log_line(log_path, f"Modo confirmación: {'AUTO-SÍ' if assume_yes else 'MANUAL'}")
            if env_path:
                log_line(log_path, f"✅ Env cargado desde: {env_path}")
            else:
                log_line(log_path, "⚠️ No encontré .env.local/.env. Si algún script necesita credenciales, cargalas manualmente.")
            log_line(log_path, f"Log: {log_path}")

            run_started_mtime = time.time()
            run_id = f"ludo_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
            log_line(log_path, f"🆔 run_id pipeline: {run_id}")

            # 1) Scraper automático.
            if args.csv:
                log_line(log_path, "")
                log_line(log_path, "⏭️ Saltando scraper porque pasaste --csv")
            elif args.skip_scraper:
                log_line(log_path, "")
                log_line(log_path, "⏭️ Saltando scraper por --skip-scraper")
            else:
                scraper = resolve_script(args.scraper, SCRAPER_CANDIDATES, "scraper")
                run_cmd([sys.executable, str(scraper)], log_path, f"Scrapear cuotas con {scraper.name}")

            # 2) Procesar cuotas.
            if args.csv:
                log_line(log_path, "")
                log_line(log_path, "⏭️ Saltando procesador porque pasaste --csv")
            elif args.skip_procesar:
                log_line(log_path, "")
                log_line(log_path, "⏭️ Saltando procesador por --skip-procesar")
            else:
                processor = resolve_script(args.processor, PROCESSOR_CANDIDATES, "processor")
                run_cmd([sys.executable, str(processor)], log_path, f"Procesar cuotas con {processor.name}")

            # 3) Elegir CSV nuevo.
            csv_path = choose_csv(args, after_mtime=None if args.skip_procesar or args.csv else run_started_mtime)
            log_line(log_path, "")
            log_line(log_path, f"📄 CSV elegido: {csv_path}")

            # 4) Resolver fechas y aplicar barrera.
            resolve_dates_csv(csv_path, args, log_path)
            validate_csv_dates(csv_path, args, log_path)

            # 5) Validar subida de cuotas.
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

            run_cmd(subir_base + ["--dry-run", "--no-archive"], log_path, "Validar subida de cuotas con dry-run")

            if args.dry_run_only:
                log_line(log_path, "")
                log_line(log_path, "🧪 --dry-run-only activo: no se sube ni se guarda nada más.")
                log_line(log_path, f"📄 Log completo: {log_path}")
                return 0

            # 6) Subir cuotas reales.
            confirm_or_abort("¿Dry-run de cuotas salió bien? ¿Subimos player_odds ahora?", assume_yes)
            run_cmd(subir_base, log_path, "Subir cuotas reales a player_odds")

            # 7) Generar predicciones con run_id explícito.
            run_cmd(
                [sys.executable, "generar_predicciones_ludo.py", "--save-db", "--run-id", run_id],
                log_path,
                "Generar predicciones y guardar en ludo_prop_predictions",
            )

            # 8) Dry-run picks con el mismo run_id.
            picks_dry_cmd = [
                sys.executable,
                "generar_picks_ludo.py",
                "--run-id",
                run_id,
                "--dry-run",
                "--top",
                str(args.top),
                "--max-tickets-per-matchup",
                str(args.max_tickets_per_matchup),
            ]
            if args.include_global:
                picks_dry_cmd.append("--include-global")

            run_cmd(picks_dry_cmd, log_path, "Generar picks dry-run")

            blocks, tickets = count_tickets_from_preview()
            log_line(log_path, "")
            log_line(log_path, f"🧾 Preview dry-run: bloques={blocks} | tickets={tickets}")

            if tickets <= 0 and not args.allow_empty_picks:
                log_line(log_path, "")
                log_line(log_path, "🛑 No se guardan picks finales porque el dry-run generó 0 tickets.")
                log_line(log_path, "   No se toca ludo_picks y no se marca nada como SUPERSEDED.")
                log_line(log_path, f"📄 Log completo: {log_path}")
                return 0

            if args.no_save_picks:
                log_line(log_path, "")
                log_line(log_path, "⏭️ No se guardan picks finales por --no-save-picks")
                log_line(log_path, f"📄 Log completo: {log_path}")
                return 0

            # 9) Guardar picks.
            confirm_or_abort("¿Dry-run de picks salió bien? ¿Guardamos ludo_picks ahora?", assume_yes)
            save_cmd = [
                sys.executable,
                "generar_picks_ludo.py",
                "--run-id",
                run_id,
                "--max-tickets-per-matchup",
                str(args.max_tickets_per_matchup),
            ]
            if args.include_global:
                save_cmd.append("--include-global")

            run_cmd(save_cmd, log_path, "Guardar picks finales en ludo_picks")

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