#!/usr/bin/env python3
"""Compara cuotas activas locales y cuotas visibles en Supabase sin mostrar credenciales."""
import argparse
from datetime import date, datetime
from pathlib import Path
import subprocess
import sys
from zoneinfo import ZoneInfo

BOOKS = ('bet365', 'betano', 'stake')
ALIASES = {'bto': 'betano', 'ste': 'stake', '365': 'bet365', 'bet_365': 'bet365'}
RELATIONS = ('public.player_prop_odds', 'public.latest_player_prop_odds_cache')


def counts(db, query, target):
    from sqlalchemy import text
    with db.connect() as conn, conn.begin():
        conn.execute(text('SET TRANSACTION READ ONLY'))
        conn.execute(text("SET LOCAL statement_timeout = '20s'"))
        result = {}
        for book, n in conn.execute(text(query), {'day': target}):
            key = str(book).strip().lower()
            key = ALIASES.get(key, key)
            result[key] = result.get(key, 0) + n
        return result


def local_counts(directory, target):
    from dotenv import load_dotenv
    sys.path.insert(0, str(directory))
    import cuotas
    load_dotenv(cuotas.ROOT / '.env', override=True)
    db = cuotas.local_engine()
    try:
        local = counts(db, """
            SELECT casa, count(*) FROM cuotas.selecciones s
            WHERE fecha_partido = CAST(:day AS date)
              AND lower(coalesce(to_jsonb(s)->>'activa', to_jsonb(s)->>'activo',
                                  to_jsonb(s)->>'vigente', to_jsonb(s)->>'is_active', 'true')) NOT IN ('false','0','f')
            GROUP BY casa
        """, target)
        return local, db.dialect.driver
    finally:
        db.dispose()


def remote_engine(project, driver):
    from dotenv import dotenv_values
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    files = [dotenv_values(project / f) for f in ('.env', '.env.production', '.env.local', '.env.production.local')]
    config = {key: value for values in files for key, value in values.items() if value}
    url = config.get('DATABASE_URL') or config.get('NBA_DIRECT_DATABASE_URL') or config.get('DIRECT_URL')
    if not url:
        raise RuntimeError('Falta la conexión de la app')
    # Prisma options are not valid connection parameters for libpq.
    parsed = make_url(url)
    if parsed.get_backend_name() not in ('postgresql', 'postgres'):
        raise ValueError('La conexión de la app debe ser PostgreSQL')
    # Use the driver that already opened the local PostgreSQL connection.
    # A Prisma URL without a driver can otherwise select a different DBAPI.
    if driver in ('psycopg', 'psycopg2'):
        parsed = parsed.set(drivername='postgresql+' + driver)
    elif parsed.get_backend_name() == 'postgres':
        parsed = parsed.set(drivername=parsed.drivername.replace('postgres', 'postgresql', 1))
    parsed = parsed.difference_update_query([
        'pgbouncer', 'schema', 'connection_limit', 'pool_timeout',
        'socket_timeout', 'statement_cache_size',
    ])
    return create_engine(parsed, connect_args={'connect_timeout': 8}, pool_pre_ping=True)


def remote_counts(db, relation, target):
    if relation not in RELATIONS:
        raise ValueError('Relación desconocida')
    return counts(db, f"""
        WITH by_day AS (
          SELECT to_jsonb(q) AS j FROM {relation} q
        )
        SELECT coalesce(j->>'book',j->>'casa',j->>'bookmaker'), count(*)
        FROM by_day
        WHERE left(coalesce(nullif(j->>'event_date',''),nullif(j->>'game_date',''),
                            nullif(j->>'fecha_partido',''),
                            CASE WHEN coalesce(j->>'start_time',j->>'start_utc') ~
                                      '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}T'
                                 THEN (coalesce(j->>'start_time',j->>'start_utc')::timestamptz
                                       AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text END),10) = :day
          AND lower(coalesce(j->>'active',j->>'is_active',j->>'bookmaker_is_active','true')) NOT IN ('false','0','f')
          AND lower(coalesce(j->>'valid','true')) NOT IN ('false','0','f')
        GROUP BY 1
    """, target)


def audit(project, directory, target):
    try:
        local, driver = local_counts(directory, target)
    except Exception as error:
        print(f'No se pudo leer PostgreSQL local ({type(error).__name__}).')
        return None
    remote = []
    db = None
    try:
        db = remote_engine(project, driver)
        for table in RELATIONS:
            try:
                remote.append(remote_counts(db, table, target))
            except Exception as error:
                print(f'No se pudo leer {table} ({type(error).__name__}).')
                remote.append(None)
    except ModuleNotFoundError as error:
        module = error.name
        dependency = f': {module}' if module in ('psycopg', 'psycopg2', 'sqlalchemy', 'dotenv') else ''
        print(f'Falta una dependencia para conectar con Supabase ({type(error).__name__}{dependency}).')
    except Exception as error:
        print(f'No se pudo abrir la conexión de la app ({type(error).__name__}).')
    finally:
        if db is not None:
            db.dispose()
    base, cache = (remote + [None, None])[:2]
    fmt = lambda group, book: str(group.get(book, 0)) if group is not None else 'S/D'
    print(f'Fecha de partido: {target}')
    print('Casa       PostgreSQL local   Supabase origen   Caché web')
    for book in BOOKS:
        print(f'{book:<10} {local.get(book,0):>16} {fmt(base,book):>17} {fmt(cache,book):>11}')
        if not local.get(book):
            continue
        if base is not None and cache is not None and not base.get(book) and not cache.get(book):
            print('  → Hay cuotas locales; no aparecen en Supabase para esta fecha.')
        elif base and base.get(book) and cache is not None and not cache.get(book):
            print('  → Supabase tiene cuotas; no aparecen en la caché web para esta fecha.')
    print('Son conteos por etapa: el origen puede guardar varias capturas y la caché, una por selección.')
    return local, base, cache


def main():
    today = datetime.now(ZoneInfo('America/Argentina/Buenos_Aires')).date().isoformat()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--quotes-dir', type=Path, default=Path.home()/'scraperodds/nba-cuotas')
    parser.add_argument('--date', default=today, help='Fecha Argentina (YYYY-MM-DD).')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--simular', action='store_true', help='Corre el publicador existente sin enviar.')
    group.add_argument('--publicar', action='store_true', help='Corre el publicador existente y vuelve a verificar hoy.')
    args = parser.parse_args()
    if not args.quotes_dir.is_dir():
        parser.error('No existe --quotes-dir.')
    try:
        if date.fromisoformat(args.date).isoformat() != args.date:
            raise ValueError()
    except ValueError:
        parser.error('Usá --date YYYY-MM-DD.')
    if (args.simular or args.publicar) and args.date != today:
        parser.error('El publicador existente usa hoy. Para otras fechas, usá solo la auditoría.')
    first = audit(args.project, args.quotes_dir, args.date)
    if not args.simular and not args.publicar:
        return 0 if first and first[2] is not None else 1
    if first is None or not any(first[0].get(b) for b in BOOKS):
        print('No hay cuotas locales verificadas para publicar hoy.')
        return 1
    script = args.quotes_dir.resolve()/'publicar_supabase.py'
    if not script.is_file():
        print('No se encontró publicar_supabase.py en --quotes-dir.')
        return 1
    if args.publicar and first[2] is None:
        print('No se pudo verificar la caché web; la publicación no se ejecutó.')
        return 1
    code = subprocess.run([sys.executable, str(script), *(['--publicar'] if args.publicar else [])], cwd=script.parent).returncode
    if code or args.simular:
        return code
    after = audit(args.project, args.quotes_dir, args.date)
    if after and after[2] is not None and all(not after[0].get(b) or after[2].get(b) for b in BOOKS):
        print('La caché web contiene cuotas de cada casa con filas locales para hoy.')
        return 0
    print('Sigue faltando al menos una casa en la caché. Revisá el motivo informado por el publicador.')
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
