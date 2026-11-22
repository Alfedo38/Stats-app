#!/usr/bin/env python3
"""Instala exclusivamente el arreglo del publicador local de cuotas NBA."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

PACKAGE = 'nba-publicador-seguro-v1'
ORIGINAL = '20320cc8c9f96f2241700c20687c89bcd9fa7ce21ad8c966450ae22dd7a62cb2'
LOCAL_MODULE = '8f08cf6c88638abb6535f28b9e27d8709a18dd5f6a3f2d4259fa171e9dbeaf22'
TARGET = 'publicar_supabase.py'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked_path(root, name):
    path = root / name
    for item in (path, *path.parents):
        if item == root.parent:
            break
        if item.is_symlink():
            raise ValueError('La ruta contiene un enlace simbólico: ' + name)
    if not path.resolve().is_relative_to(root):
        raise ValueError('La ruta sale del proyecto')
    return path


def atomic(path, data, mode=0o644):
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.publicador-')
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_payload():
    root = Path(__file__).resolve().parent
    manifest = json.loads((root / 'manifest.json').read_text())
    if manifest.get('package') != PACKAGE or set(manifest['files']) != {TARGET}:
        raise ValueError('El manifiesto no corresponde a este arreglo')
    payload = (root / 'payload' / TARGET).read_bytes()
    if sha(payload) != manifest['files'][TARGET]['after']:
        raise ValueError('El contenido del paquete fue alterado')
    return payload


def install(project, apply):
    payload = load_payload()
    target = checked_path(project, TARGET)
    if not target.is_file():
        raise ValueError('Falta publicar_supabase.py en --project')
    current = target.read_bytes()
    if current == payload:
        print('El publicador seguro ya está instalado.')
        return
    if sha(current) != ORIGINAL:
        raise ValueError('El publicador cambió respecto del ZIP revisado. No se sobrescribió nada.')
    local = checked_path(project, 'cuotas.py')
    if not local.is_file() or sha(local.read_bytes()) != LOCAL_MODULE:
        raise ValueError('cuotas.py difiere de la versión revisada. No se sobrescribió nada.')
    print('Archivo a actualizar: publicar_supabase.py')
    print('La instalación no abre conexiones a PostgreSQL ni a Supabase.')
    if not apply:
        print('Vista previa correcta. Usá --apply para instalar.')
        return
    parent = checked_path(project, 'backups-publicador')
    parent.mkdir(exist_ok=True)
    backup = parent / (PACKAGE + '-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(mode=0o700)
    mode = stat.S_IMODE(target.stat().st_mode)
    atomic(backup / TARGET, current, 0o600)
    metadata = {'package': PACKAGE, 'project': str(project), 'before': sha(current),
                'after': sha(payload), 'mode': mode}
    atomic(backup / 'install.json', json.dumps(metadata, indent=2).encode(), 0o600)
    if target.read_bytes() != current:
        raise ValueError('El publicador cambió durante la instalación. No se sobrescribió.')
    atomic(target, payload, mode)
    print('Publicador seguro instalado. Respaldo:', backup)
    print('Ejecutá primero la simulación y --check-db. --publicar envía cuando lo ejecutes.')


def restore(project, backup, apply):
    backup = backup.expanduser().resolve()
    parent = checked_path(project, 'backups-publicador')
    if not backup.is_relative_to(parent):
        raise ValueError('El respaldo debe estar en backups-publicador del proyecto')
    info = json.loads((backup / 'install.json').read_text())
    if info.get('package') != PACKAGE or info.get('project') != str(project):
        raise ValueError('El respaldo corresponde a otro proyecto o paquete')
    target = checked_path(project, TARGET)
    current = target.read_bytes()
    original = (backup / TARGET).read_bytes()
    if sha(current) != info['after']:
        raise ValueError('Hay cambios posteriores en el publicador. No se sobrescribieron.')
    if sha(original) != info['before']:
        raise ValueError('La copia de respaldo fue alterada')
    print('Archivo a restaurar: publicar_supabase.py')
    if not apply:
        print('Vista previa correcta. Usá --apply para restaurar.')
        return
    atomic(target, original, info['mode'])
    print('Restauración completada.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path.home() / 'scraperodds/nba-cuotas')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--restore', type=Path)
    args = parser.parse_args()
    project = args.project.expanduser().resolve()
    try:
        if args.restore:
            restore(project, args.restore, args.apply)
        else:
            install(project, args.apply)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('ERROR:', error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
