"""Complemento para conectar el histórico de asistencias con el publicador instalado."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import time

DAILY_UNIT = "nba-maint-daily.service"
PUBLISH_UNIT = "nba-maint-publish.service"
MARKER = Path("assist-league/publicacion-diaria.json")


def boot_id():
    return Path("/proc/sys/kernel/random/boot_id").read_text().strip()


def systemd(*args):
    return subprocess.run(["systemctl", "--user", *args], text=True, capture_output=True, check=True, timeout=25).stdout.strip()


def publish_parts(state, directory, manifest, save_part, upload):
    from .assist_league import PART, archive_parts, collect_for_archive
    from .rotation_pilot import atomic_json
    from ..common import ROOT
    state = Path(state)
    # Las filas válidas ya estaban en disco. Un problema con el servicio NBA
    # no debe interrumpir el resto de la publicación.
    if upload:
        try:
            collect_for_archive(Path(ROOT), state, directory, manifest)
        except (ImportError, OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
            print(f"ASISTENCIAS NBA: no se completó la recolección ({type(exc).__name__}); se revisarán los bloques previos.", flush=True)
    staged = {"parts": {}}
    try:
        archive_parts(state, directory, staged, save_part)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        print(f"ASISTENCIAS NBA: no se reemplazó la cobertura existente ({type(exc).__name__}).", flush=True)
        return
    if not staged["parts"]:
        return
    manifest["parts"].update(staged["parts"])
    print(f"ASISTENCIAS NBA: {len(staged['parts'])} bloques preparados para el archivo.", flush=True)
    if upload:
        try:
            atomic_json(state / MARKER, {
                "boot": boot_id(), "monotonic_us": time.monotonic_ns() // 1_000,
                "parts": {name: meta["sha256"] for name, meta in staged["parts"].items()
                          if name.startswith(PART + "/")},
            })
        except OSError:
            print("ASISTENCIAS NBA: no se registró el intento; continúa el publicador.", flush=True)


def already_published(state, started, boot):
    try:
        marker = json.loads((state / MARKER).read_text())
        if not started or marker["boot"] != boot or marker["monotonic_us"] < started or not marker["parts"]:
            return False
        parts = json.loads((state / "archive" / "published.json").read_text())["parts"]
        return all(parts.get(name, {}).get("sha256") == sha for name, sha in marker["parts"].items())
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False


def queue_after_daily(state):
    # Se invoca tras un daily exitoso. Si daily ya publicó los mismos bloques,
    # no se repiten las lecturas ni se vuelve a subir el archivo.
    started = int(systemd("show", "-p", "ExecMainStartTimestampMonotonic", "--value", DAILY_UNIT) or "0")
    if already_published(state, started, boot_id()):
        print("ASISTENCIAS NBA: la corrida diaria ya publicó sus bloques.", flush=True)
        return
    systemd("start", "--no-block", PUBLISH_UNIT)
    print("ASISTENCIAS NBA: publicación encolada después del mantenimiento diario.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue-after-daily", type=Path, required=True)
    args = parser.parse_args()
    try:
        queue_after_daily(args.queue_after_daily)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        parser.exit(1, f"ASISTENCIAS NBA: no se pudo encolar {PUBLISH_UNIT} ({type(exc).__name__}).\n")
