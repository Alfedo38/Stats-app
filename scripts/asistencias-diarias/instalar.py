#!/usr/bin/env python3
"""Importa partidos validados al publicador de Stats-app sin hacer merge de Git."""
from __future__ import annotations

import argparse
import ast
import gzip
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime

from payload.assist_league import PART, archive_parts, prepare_outputs, read_verified
from payload.daily import DAILY_UNIT, PUBLISH_UNIT, systemd
from payload.rotation_pilot import atomic_json

PACKAGE = Path(__file__).resolve().parent
MODULE = "assist_release_v25"
MARKER = "# NBA_ASSIST_DAILY_V25"
ANCHOR = r"(?m)^([ \t]+)manifest\[(['\"])updated_at\2\]\s*=.*$"
FILES = ("__init__.py", "assist_pilot.py", "assist_league.py", "assist_snapshot.py", "rotation_pilot.py", "daily.py")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def patched_archive(raw):
    text = raw.decode("utf-8")
    if MARKER in text:
        require(text.count(MARKER) == 1 and "from .assist_release_v25.daily import publish_parts as _publish_assists_v25" in text
                and "_publish_assists_v25(STATE,directory,manifest,save_part,upload)" in text,
                "La integración anterior tiene cambios propios; revisá archive.py.")
        return raw
    matches = list(re.finditer(ANCHOR, text))
    require(len(matches) == 1, "No encontré una única escritura del índice; dejé archive.py intacto.")
    match = matches[0]
    tree = ast.parse(text)
    lineno = text.count("\n", 0, match.start()) + 1
    scope = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.lineno < lineno <= node.end_lineno]
    require(len(scope) == 1 and {"upload"} <= {v.arg for v in scope[0].args.args + scope[0].args.kwonlyargs}
            and all(name in text for name in ("def save_part(", "read_manifest(directory)", "archive_guard(STATE)")),
            "El publicador instalado usa otra estructura; dejé archive.py intacto.")
    indent = match.group(1)
    eol = "\r\n" if "\r\n" in text else "\n"
    code = eol.join(indent + line for line in (
        MARKER,
        "from .assist_release_v25.daily import publish_parts as _publish_assists_v25",
        "_publish_assists_v25(STATE,directory,manifest,save_part,upload)",
    )) + eol
    combined = text[:match.start()] + code + text[match.start():]
    compile(combined, "archive.py", "exec")
    return combined.encode("utf-8")


def atomic_bytes(path, raw, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fh = tempfile.NamedTemporaryFile(dir=path.parent, delete=False)
    tmp = Path(fh.name)
    try:
        with fh:
            fh.write(raw)
        tmp.chmod(mode)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def checked_records(root):
    record_dir = root / "assist-league" / "verified"
    result = {}
    for f in sorted(record_dir.glob("*.json")):
        require(f.is_file() and not f.is_symlink(), f"Registro inválido: {f.name}")
        row = read_verified(f)
        require(set(("date", "id", "rosters", "pairs", "names")) <= row.keys(), f"Registro incompleto: {f.name}")
        result[f.name] = row
    return result


def json_bytes(rows):
    return json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def estimate(stage):
    proposed = {"parts": {}}
    def size(_directory, _name, rows):
        return {"bytes": len(gzip.compress(json_bytes(rows), compresslevel=6, mtime=0))}
    archive_parts(stage, stage / "archive", proposed, size)
    return len(proposed["parts"]), sum(p["bytes"] for p in proposed["parts"].values())


def workdir(unit):
    value = systemd("show", unit, "--value", "-p", "WorkingDirectory")
    return Path(value or "/").expanduser().resolve()


def dropin_text(project, state):
    executable = project / ".venv-maintenance/bin/python"
    script = project / "maintenance_nba" / MODULE / "daily.py"
    require(all(not (set(str(p)) & set('\n\r\t"%$\\')) for p in (state, executable, script)),
            "La ruta no se puede representar sin ambigüedad en systemd.")
    return (f'[Service]\nExecStartPost=-"{executable}" "{script}" --queue-after-daily "{state}"\n').encode()


def require_unit(unit):
    require(systemd("show", unit, "--value", "-p", "LoadState") == "loaded", f"Falta {unit}.")


def install(project, pilot, apply, min_games):
    require(project != pilot, "El piloto y la app principal deben ser dos carpetas distintas.")
    archive = project / "maintenance_nba/archive.py"
    require(archive.is_file() and not archive.is_symlink(), "No encontré maintenance_nba/archive.py en Stats-app.")
    python = project / ".venv-maintenance/bin/python"
    require(python.is_file() and os.access(python, os.X_OK), "No encontré el Python de mantenimiento.")
    require_unit(DAILY_UNIT)
    require_unit(PUBLISH_UNIT)
    require(workdir(PUBLISH_UNIT) == project, "El servicio publica desde otra carpeta.")
    require(systemd("is-active", "nba-maint-daily.timer") == "active", "El temporizador diario no está activo.")
    raw = archive.read_bytes()
    candidate = patched_archive(raw)
    backup_mode = stat.S_IMODE(archive.stat().st_mode)
    sys.path.insert(0, str(project))
    from maintenance_nba.common import STATE
    state = Path(STATE).resolve()
    module_root = project / "maintenance_nba" / MODULE
    payload = {name: (PACKAGE / "payload" / name).read_bytes() for name in FILES}
    for name, contents in payload.items():
        compile(contents, name, "exec")
        dest = module_root / name
        require(not dest.is_symlink() and (not dest.exists() or dest.read_bytes() == contents),
                f"El archivo {dest.name} ya existe con otra versión; no se sobrescribió.")
    config_home = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    override = config_home / "systemd/user" / (DAILY_UNIT + ".d") / "65-asistencias-v25.conf"
    override_data = dropin_text(project, state)
    require(not override.is_symlink() and (not override.exists() or override.read_bytes() == override_data),
            f"Ya existe otra configuración en {override.name}; no se sobrescribió.")
    source = checked_records(pilot / "maintenance-state")
    require(len(source) >= min_games, f"Solo encontré {len(source)} partidos verificados; esperaba al menos {min_games}.")
    current = checked_records(state)
    conflicts = [k for k in source.keys() & current.keys() if source[k] != current[k]]
    require(not conflicts, f"Hay {len(conflicts)} partidos con datos distintos en ambas carpetas; no se sobrescribieron.")
    records = {**source, **current}
    with tempfile.TemporaryDirectory(prefix="asistencias-v25-") as tmp:
        stage = Path(tmp)
        # Conserva las referencias previas a partidos todavía no conciliados.
        refer = state / "assist-league/parts/rivals"
        if refer.is_dir():
            shutil.copytree(refer, stage / "assist-league/parts/rivals")
        for name, data in records.items():
            atomic_json(stage / "assist-league/verified" / name, data)
        prepare_outputs(stage, {})
        blocks, compressed = estimate(stage)
        rotations = sum(bool(r.get("rotations")) for r in records.values())
        print(f"PLAN NBA: {len(records)} partidos verificados, {rotations} con rotación, {blocks} bloques, "
              f"≈ {compressed / (1024 * 1024):.2f} MiB comprimidos.", flush=True)
        if not apply:
            return
        from maintenance_nba.rebound_history import archive_guard
        with archive_guard(state):
            require(archive.read_bytes() == raw and checked_records(state) == current,
                    "La app cambió durante la preparación. Corré el instalador otra vez.")
            backup = state / "assist-league/backups" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
            if raw != candidate:
                atomic_bytes(backup / "archive.py", raw, 0o600)
            for name, content in payload.items():
                atomic_bytes(module_root / name, content)
            for path in (stage / "assist-league").rglob("*.json"):
                target = state / "assist-league" / path.relative_to(stage / "assist-league")
                if not target.exists() or target.read_bytes() != path.read_bytes():
                    atomic_bytes(target, path.read_bytes())
            if raw != candidate:
                atomic_bytes(archive, candidate, backup_mode)
        if not override.exists():
            atomic_bytes(override, override_data)
        systemd("daemon-reload")
        print("INSTALADO: se publicará después del mantenimiento diario. Las carpetas y ramas de Git se conservaron.")
        if raw != candidate:
            print(f"Copia del publicador anterior: {backup / 'archive.py'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path.home() / "stats-app")
    parser.add_argument("--pilot", type=Path, default=Path.home() / "stats-app-piloto-v24")
    parser.add_argument("--min-games", type=int, default=222)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan", action="store_true")
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true", help="Lee solamente el índice publicado en Supabase")
    args = parser.parse_args()
    try:
        require(args.min_games > 0, "El mínimo de partidos debe ser positivo.")
        project = args.project.expanduser().resolve()
        if args.verify:
            sys.path.insert(0, str(project))
            from maintenance_nba.archive import Storage
            storage = Storage()
            storage.check_private()
            manifest = json.loads(storage.get("manifest.json"))
            sizes = {kind: sum(p["rows"] for name, p in manifest["parts"].items() if name.startswith(f"{PART}/{kind}/"))
                     for kind in ("games", "rotations")}
            print(f"SUPABASE: {sizes['games']} partidos con asistencias, {sizes['rotations']} con rotaciones.")
            require(sizes["games"] >= args.min_games and sizes["rotations"] > 0,
                    "La cobertura publicada todavía no llegó al lote esperado.")
        else:
            install(project, args.pilot.expanduser().resolve(), args.apply, args.min_games)
    except (OSError, ValueError, ImportError, SyntaxError, KeyError, TypeError, AttributeError, RuntimeError, subprocess.SubprocessError) as exc:
        detail = str(exc) if type(exc) is ValueError else type(exc).__name__
        parser.exit(1, f"Instalador NBA: {detail}\n")


if __name__ == "__main__":
    main()
