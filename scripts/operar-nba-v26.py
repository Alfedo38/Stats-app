#!/usr/bin/env python3
"""Instala los servicios nuevos en la PC que captura y publica el histórico."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
from pathlib import Path
import re
import subprocess
import sys
import tempfile

SOURCE = Path(__file__).resolve().parents[1]
MARKER = "    # NBA_QA_V26_DATA"
HOOK = (
    MARKER + "\n"
    "    from .qa_context_v26 import integrate_release\n"
    "    integrate_release(STATE,directory,manifest,save_part,load_part,identity)\n"
)
LEGACY = SOURCE / "scripts/v26/publicador-v1/instalar.py"
UNITS = ("nba-maint-injury-editions-v26", "nba-maint-odds-v26", "nba-maint-playtypes-v26")
TIMEZONE = "America/Argentina/Buenos_Aires"


def checked(path):
    if not re.fullmatch(r"/[\w./-]+", str(path)):
        raise ValueError("Usá rutas absolutas sin espacios ni caracteres especiales para instalar systemd.")
    return path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(args, cwd=None, timeout=720, quiet=False):
    return subprocess.run([str(a) for a in args], cwd=cwd, check=True, timeout=timeout,
                          stdout=subprocess.DEVNULL if quiet else None)


def systemd(*args, quiet=False):
    return run(["systemctl", "--user", *args], timeout=30, quiet=quiet)


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError(f"No se escribe sobre un enlace: {path}")
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".nba-v26-", delete=False) as out:
        tmp = Path(out.name)
        out.write(data)
    try:
        tmp.chmod(0o644)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def service(description, directory, command, timeout):
    return f"""[Unit]
Description={description}
[Service]
Type=oneshot
WorkingDirectory={directory}
ExecStart={command}
TimeoutStartSec={timeout}
"""


def timer(description, expressions):
    calendar = "\n".join("OnCalendar="+expr+" "+TIMEZONE for expr in expressions)
    return f"""[Unit]
Description={description}
[Timer]
{calendar}
AccuracySec=30s
Persistent=true
[Install]
WantedBy=timers.target
"""


def paths(args):
    project, quotes = checked(args.project.expanduser().resolve()), checked(args.quotes_dir.expanduser().resolve())
    maint, py = checked(project / ".venv-maintenance/bin/python"), checked(quotes / ".venv/bin/python")
    env = project / ".env.local"
    if not env.is_file():
        env = project / ".env"
    if not (project / "package.json").is_file() or not env.is_file():
        raise ValueError("El proyecto que publica necesita package.json y su .env existente.")
    return project, quotes, maint, py, env


def safety(project, quotes, py):
    path = quotes / "publicar_supabase.py"
    publisher = path.read_bytes()
    known = (SOURCE / "scripts/v26/publicador-v1/payload/publicar_supabase.py").read_bytes()
    if sha(publisher) == sha(known):
        return False
    # El instalador previo aplica sólo si coinciden las huellas de la versión revisada.
    run([sys.executable, LEGACY, "--project", quotes], timeout=30)
    return True


def update_archive(project):
    path = project / "maintenance_nba/archive.py"
    original = path.read_text()
    if MARKER in original:
        if HOOK not in original:
            raise ValueError("El marcador del exportador instalado difiere del código revisado.")
        return path, original, original
    matches = re.findall(r"(?m)^    manifest\[['\"]updated_at['\"]\][ ]*=[^\n]*$", original)
    if len(matches) != 1 or "load_part" not in original or "save_part" not in original:
        raise ValueError("No encontramos el punto seguro de extensión del archivo estadístico.")
    new = original.replace(matches[0], HOOK + matches[0], 1)
    compile(new, str(path), "exec")
    return path, original, new


def build_units(project, quotes, maint, py, env):
    base = checked(SOURCE)
    jobs = [
        ("NBA: sincronizar edición oficial de lesiones", base,
         f"{maint} -m maintenance_nba.injury_editions --project {project} --publish", "3min",
         ["*-*-* 12..23:02,17,32,47:00", "*-*-* 00..02:02,17,32,47:00"]),
        ("NBA: publicar cuotas capturadas", quotes,
         f"{py} {quotes}/publicar_supabase.py --supabase-env {env} --publicar", "8min",
         ["*-*-* 08..23:08,23,38,53:00", "*-*-* 00..02:08,38:00"]),
        ("NBA: descargar perfil por tipo de jugada", base,
         f"{maint} {base}/scripts/operar-nba-v26.py --profiles --project {project} --quotes-dir {quotes}", "10min",
         ["*-*-* 12:26:00"]),
    ]
    units = {}
    for name, (description, cwd, command, limit, when) in zip(UNITS, jobs):
        units[name + ".service"] = service(description, cwd, command, limit)
        units[name + ".timer"] = timer(description, when)
    return units


def install(args, project, quotes, maint, py, env):
    if not maint.is_file() or not args.sin_cuotas and not py.is_file():
        raise ValueError("Falta el Python de mantenimiento o el de nba-cuotas.")
    archive, old, new = update_archive(project)
    for module in ("matchup_history", "rotation_pilot", "defense_snapshot"):
        if not (archive.parent / (module + ".py")).is_file():
            raise ValueError(f"Falta el módulo local {module}. Restaurá el exportador instalado antes de activar.")
    active = tuple(name for name in UNITS if not args.sin_cuotas or name != UNITS[1])
    try:
        migrate_publisher = False if args.sin_cuotas else safety(project, quotes, py)
    except (OSError, subprocess.SubprocessError):
        raise ValueError("No se pudo certificar el publicador de cuotas. Usá --sin-cuotas para instalar el parte y los datos por separado.") from None
    units = build_units(project, quotes, maint, py, env)
    units = {name: content for name, content in units.items() if name.split(".")[0] in active}
    unit_dir = Path.home() / ".config/systemd/user"
    targets = {
        archive.parent / "qa_context_v26.py": (SOURCE / "maintenance_nba/qa_context_v26.py").read_bytes(),
        archive.parent / "qa_playtypes_v26.py": (SOURCE / "maintenance_nba/playtypes_snapshot.py").read_bytes(),
        **{unit_dir / file: content.encode() for file, content in units.items()},
    }
    for name, data in targets.items():
        if name.is_symlink() or name.exists() and name.read_bytes() != data:
            raise ValueError(f"Ya existe un archivo distinto en {name}; se conserva.")
    print(f"PLAN: {len(active)} temporizadores independientes; el archivo histórico conserva asistencias y rotaciones.")
    print("El parte usa una caché separada." + (" Las cuotas quedan en su publicador actual." if args.sin_cuotas else " Las cuotas salen del publicador validado."))
    if not args.apply:
        print("Sin escrituras. Usá --apply desde esta rama para instalar.")
        return
    systemd("list-timers", quiet=True)
    run([maint, "-m", "maintenance_nba.injury_editions", "--project", project, "--init"], cwd=SOURCE, timeout=45)
    if migrate_publisher:
        run([sys.executable, LEGACY, "--project", quotes, "--apply"], timeout=45)
    if archive.read_text() != old:
        raise ValueError("El exportador cambió mientras se preparaba la actualización.")
    if new != old:
        backup = project / "maintenance-state/qa-v26/backups" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") / "archive.py"
        atomic(backup, old.encode())
        print("Respaldo del exportador:", backup)
    for path, data in targets.items():
        if not path.exists():
            atomic(path, data)
    if new != old:
        atomic(archive, new.encode())
    systemd("daemon-reload")
    systemd("enable", "--now", *(name + ".timer" for name in active))
    # Los servicios comparten el PC, pero su éxito no depende uno del otro.
    systemd("start", "--no-block", *(name + ".service" for name in active if name != UNITS[2]))
    print("Temporizadores activos; primera consulta del parte" + (" encolada." if args.sin_cuotas else " y publicación de cuotas encoladas."))


def repair_odds(args, project, quotes, py, env):
    if safety(project, quotes, py):
        raise ValueError("Instalá el publicador seguro antes de la reparación.")
    verifier = SOURCE / "scripts/verificar-publicacion-cuotas.py"
    sys.path.insert(0, str(verifier.parent))
    spec = importlib.util.spec_from_file_location("nba_quote_audit_v26", verifier)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Importar el auditor con el mismo entorno que usa sqlalchemy en la PC.
    day = datetime.now(mod.ZoneInfo(TIMEZONE)).date().isoformat()
    result = mod.audit(project, quotes, day)
    if result is None or result[1] is None or result[2] is None:
        raise ValueError("No se pudieron verificar las tres etapas. No se publicaron cuotas.")
    local, _, cache = result
    missing = [b for b in mod.BOOKS if local.get(b, 0) > 0 and cache.get(b, 0) == 0]
    if not missing:
        print("No hay una casa con captura local y caché vacía. Sin reenvío.")
        return
    print("Casas con cuotas locales y caché vacía:", ", ".join(missing))
    run([py, quotes / "publicar_supabase.py", "--supabase-env", env, "--check-db"], cwd=quotes)
    run([py, quotes / "publicar_supabase.py", "--supabase-env", env, "--publicar", "--force"], cwd=quotes)
    refreshed = mod.audit(project, quotes, day)
    if not refreshed or refreshed[2] is None or any(not refreshed[2].get(b) for b in missing):
        raise ValueError("El reenvío no confirmó cobertura para todas las casas; revisá el diagnóstico.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path.home() / "stats-app")
    parser.add_argument("--quotes-dir", type=Path, default=Path.home() / "scraperodds/nba-cuotas")
    parser.add_argument("--sin-cuotas", action="store_true", help="Instala solo el parte y el perfil, sin modificar el publicador de cuotas")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan", action="store_true")
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--repair-odds", action="store_true")
    mode.add_argument("--profiles", action="store_true")
    args = parser.parse_args()
    if args.sin_cuotas and not (args.plan or args.apply):
        parser.error("--sin-cuotas solo se usa con --plan o --apply")
    try:
        project, quotes, maint, py, env = paths(args)
        if args.profiles:
            from zoneinfo import ZoneInfo
            today = datetime.now(ZoneInfo("America/New_York"))
            year = today.year - (today.month < 10)
            season = f"{year}-{(year+1)%100:02d}"
            run([maint, "-m", "maintenance_nba.playtypes_snapshot", "--season", season, "--output-project", project], cwd=SOURCE, timeout=540)
        elif args.repair_odds:
            repair_odds(args, project, quotes, py, env)
        else:
            install(args, project, quotes, maint, py, env)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, ImportError) as error:
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        parser.exit(1, f"NBA v2.6: {message}\n")


if __name__ == "__main__":
    main()
