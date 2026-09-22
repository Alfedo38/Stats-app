#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
betano.py

Pipeline Betano Hitos NBA 100% Postgres/Supabase para cuotas, picks y publicación.

Flujo normal:
1) procesar_betano_hitos.py                         -> genera CSV normalizado
2) subir_cuotas_betano_hitos.py                    -> sube cuotas a public.player_prop_odds
3) generar_predicciones_ludo.py --save-db          -> genera ludo_predictions.csv
4) generar_picks_betano_hitos_ludo.py --save-db    -> lee cuotas PG y guarda public.picks_betano_hitos
5) publicar_betano_picks_supabase.py               -> lee public.picks_betano_hitos y publica public.betano_picks

Uso:
  python3 betano.py
  python3 betano.py --no-publish
  python3 betano.py --publish-dry-run
  python3 betano.py --dry-run-only
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"

POSTGRES_ENV_KEYS = [
    "SUPABASE_DATABASE_URL",
    "DIRECT_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_DATABASE_URL",
    "SUPABASE_POSTGRES_URL",
    "SUPABASE_DB_URL",
]


class StepError(RuntimeError):
    pass


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def redact_secret(text: str) -> str:
    if not text:
        return text
    safe = str(text)
    for prefix in ("postgresql://", "postgres://"):
        start = safe.find(prefix)
        while start != -1:
            userinfo_start = start + len(prefix)
            at_pos = safe.find("@", userinfo_start)
            slash_pos = safe.find("/", userinfo_start)
            space_pos = safe.find(" ", userinfo_start)
            limits = [p for p in (slash_pos, space_pos) if p != -1]
            limit = min(limits) if limits else len(safe)
            if at_pos != -1 and at_pos < limit:
                userinfo = safe[userinfo_start:at_pos]
                if ":" in userinfo:
                    user = userinfo.split(":", 1)[0]
                    safe = safe[:userinfo_start] + user + ":***" + safe[at_pos:]
                    start = safe.find(prefix, at_pos + 1)
                    continue
            start = safe.find(prefix, userinfo_start)

    parts = []
    for token in safe.split(" "):
        low = token.lower()
        if low.startswith("password=") or low.startswith("pass="):
            parts.append(token.split("=", 1)[0] + "=***")
        else:
            parts.append(token)
    return " ".join(parts)


def shell_join_redacted(cmd: list[str]) -> str:
    return " ".join(shlex.quote(redact_secret(c)) for c in cmd)


def load_env_file() -> Optional[Path]:
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
                if line.startswith("export "):
                    line = line[len("export "):].strip()
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        return env_path
    return None


def get_postgres_url(cli_value: str | None = None, required: bool = True) -> str | None:
    db_url = (cli_value or "").strip()
    if not db_url:
        for key in POSTGRES_ENV_KEYS:
            value = os.getenv(key)
            if value:
                db_url = value.strip()
                break
    if not db_url:
        if required:
            raise RuntimeError(
                "No encontré conexión Postgres/Supabase. Agregá una de estas variables al .env.local:\n"
                f"  {', '.join(POSTGRES_ENV_KEYS)}\n"
                "o ejecutá:\n"
                "  python3 betano.py --db-url 'postgresql://usuario:password@host:5432/postgres'"
            )
        return None
    if db_url.endswith(".db"):
        raise RuntimeError("Recibí un .db, pero este pipeline Betano ahora usa Postgres/Supabase.")
    return db_url.strip().strip('"').strip("'")


def init_log(args: argparse.Namespace, env_path: Optional[Path]) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"betano_pipeline_{now_stamp()}.log"
    log_path.write_text(
        "BETANO HITOS PIPELINE · POSTGRES\n"
        + "=" * 80
        + f"\nFecha: {datetime.now().isoformat(timespec='seconds')}\n"
        + f"Root: {ROOT}\n"
        + f"Env: {env_path if env_path else 'NO CARGADO'}\n"
        + f"Args: {redact_secret(str(args))}\n"
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
    log_line(log_path, "$ " + shell_join_redacted(cmd))
    log_line(log_path, "─" * 80)

    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=os.environ.copy(),
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        log_line(log_path, redact_secret(line.rstrip("\n")))
    rc = proc.wait()
    if rc != 0:
        raise StepError(f"Falló el paso: {title} | exit_code={rc}")
    log_line(log_path, f"✅ OK: {title}")
    return rc


def build_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Pipeline Betano Hitos: cuotas -> picks -> Supabase/Postgres.")
    ap.add_argument("--db-url", default=None, help="URL Postgres/Supabase. Si se omite, usa .env.local.")
    ap.add_argument("--db", default=None, help="Compatibilidad vieja: si pasás ludo.db se ignora. Usá --db-url para Postgres.")
    ap.add_argument("--source-tz", default="America/Argentina/Buenos_Aires")
    ap.add_argument("--pred-csv", default="ludo_predictions.csv")

    ap.add_argument("--odds-table", default="public.player_prop_odds")
    ap.add_argument("--picks-table", default="public.picks_betano_hitos")
    ap.add_argument("--publish-table", default="public.betano_picks")

    ap.add_argument("--top", type=int, default=80)
    ap.add_argument("--min-ev", type=float, default=0.10)
    ap.add_argument("--min-prob", type=float, default=0.60)
    ap.add_argument("--max-odds", type=float, default=3.00)

    ap.add_argument("--publish-top", type=int, default=80)
    ap.add_argument("--publish-min-ev-pct", type=float, default=10.0)
    ap.add_argument("--publish-min-odds", type=float, default=1.20)
    ap.add_argument("--publish-max-odds", type=float, default=3.00)

    ap.add_argument("--run-scraper", action="store_true")
    ap.add_argument("--skip-procesar", action="store_true")
    ap.add_argument("--skip-subir", action="store_true")
    ap.add_argument("--skip-predictions", action="store_true")
    ap.add_argument("--no-publish", action="store_true")
    ap.add_argument("--publish-dry-run", action="store_true")
    ap.add_argument("--dry-run-only", action="store_true", help="Procesa y valida subida de cuotas con dry-run; no genera picks.")
    return ap.parse_args()


def main() -> int:
    args = build_args()
    env_path = load_env_file()
    log_path = init_log(args, env_path)
    py = sys.executable

    try:
        db_url = get_postgres_url(args.db_url, required=True)

        log_line(log_path, "🏀 BETANO HITOS PIPELINE · POSTGRES")
        log_line(log_path, "=" * 80)
        log_line(log_path, f"Root: {ROOT}")
        if env_path:
            log_line(log_path, f"✅ Env cargado desde: {env_path}")
        else:
            log_line(log_path, "⚠️ No encontré .env.local/.env")
        log_line(log_path, f"Postgres: {redact_secret(db_url or '')}")
        log_line(log_path, f"Log: {log_path}")

        if args.run_scraper:
            run_cmd([py, "scraperb.py"], log_path, "Scrapear Betano")

        if args.skip_procesar:
            log_line(log_path, "⏭️ Saltando procesar_betano_hitos.py")
        else:
            run_cmd([py, "procesar_betano_hitos.py", "--source-tz", args.source_tz], log_path, "Procesar CSV Betano hitos")

        if args.skip_subir:
            log_line(log_path, "⏭️ Saltando subir_cuotas_betano_hitos.py")
        else:
            subir_cmd = [py, "subir_cuotas_betano_hitos.py", "--db-url", db_url]
            if args.dry_run_only:
                subir_cmd.append("--dry-run")
            run_cmd(subir_cmd, log_path, "Subir cuotas Betano hitos a Postgres/Supabase")

        if args.dry_run_only:
            log_line(log_path, "")
            log_line(log_path, "🧪 --dry-run-only activo: no genero picks ni publico Supabase.")
            log_line(log_path, f"📄 Log completo: {log_path}")
            return 0

        if args.skip_predictions:
            log_line(log_path, "⏭️ Saltando generar_predicciones_ludo.py")
        else:
            run_cmd([py, "generar_predicciones_ludo.py", "--save-db"], log_path, "Generar predicciones Ludo y ludo_predictions.csv")

        picks_cmd = [
            py, "generar_picks_betano_hitos_ludo.py",
            "--db-url", db_url,
            "--odds-table", args.odds_table,
            "--picks-table", args.picks_table,
            "--pred-csv", args.pred_csv,
            "--player-col", "player_name",
            "--stat-col", "prop_type",
            "--mean-col", "proj",
            "--std-col", "model_mae",
            "--game-col", "matchup",
            "--team-col", "team_abbreviation",
            "--player-id-col", "player_id",
            "--require-game-match",
            "--require-team-in-game",
            "--save-db",
            "--top", str(args.top),
            "--min-ev", str(args.min_ev),
            "--min-prob", str(args.min_prob),
            "--max-odds", str(args.max_odds),
        ]
        run_cmd(picks_cmd, log_path, "Generar pool Betano Hitos para combinadas en Postgres")

        if args.no_publish:
            log_line(log_path, "")
            log_line(log_path, "⏭️ No se publica Supabase por --no-publish")
            log_line(log_path, f"📄 Log completo: {log_path}")
            return 0

        publish_cmd = [
            py, "publicar_betano_picks_supabase.py",
            "--db-url", db_url,
            "--picks-table", args.picks_table,
            "--supabase-table", args.publish_table,
            "--top", str(args.publish_top),
            "--min-ev-pct", str(args.publish_min_ev_pct),
            "--min-odds", str(args.publish_min_odds),
            "--max-odds", str(args.publish_max_odds),
        ]
        if args.publish_dry_run:
            publish_cmd.append("--dry-run")
        else:
            publish_cmd.append("--delete-pending-date")

        run_cmd(publish_cmd, log_path, "Publicar Betano combinadas en Supabase/Postgres")

        log_line(log_path, "")
        log_line(log_path, "✅ BETANO PIPELINE COMPLETO TERMINADO")
        log_line(log_path, f"📄 Log completo: {log_path}")
        log_line(log_path, "➡️ Revisá el front: /ev-plays?book=betano")
        return 0

    except (StepError, RuntimeError) as e:
        log_line(log_path, "")
        log_line(log_path, f"❌ ERROR: {redact_secret(str(e))}")
        log_line(log_path, f"📄 Revisá el log: {log_path}")
        return 1
    except KeyboardInterrupt:
        log_line(log_path, "")
        log_line(log_path, "❌ Cancelado con Ctrl+C")
        log_line(log_path, f"📄 Revisá el log: {log_path}")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
