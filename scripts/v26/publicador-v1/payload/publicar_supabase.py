#!/usr/bin/env python3
"""Publica cuotas NBA de hoy y mañana en Argentina; conserva el histórico local."""
import argparse
from collections import Counter
from contextlib import contextmanager, redirect_stdout
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
import io
import hashlib
import json
from pathlib import Path
import tempfile
from zoneinfo import ZoneInfo
import importador_existente as old

TZ = ZoneInfo('America/Buenos_Aires')
ROOT = Path(__file__).resolve().parent
BOOKS = ('betano', 'stake', 'bet365')
PUBLICATION_LOCK = 88401723
PUBLICATION_FORMAT = 2
TEMPLATE_KEYS = '''row_uid snapshot_id scraped_at_source scraped_at_utc event_date book sport league
source_file partido game_norm jugador player_norm mercado_raw linea_raw handicap_raw odds_decimal
market_key stat_key side threshold model_line event_text valid error period fixture_id source_book
capture_id event_start_utc'''.split()


def window(now=None):
    today = (now or datetime.now(TZ)).astimezone(TZ).date()
    return today, today + timedelta(days=1)


def convert(rows, first, last, now=None):
    now = now or datetime.now(TZ)
    output = []
    skipped = Counter()
    games = set()
    for row in rows:
        if not first <= row['fecha_partido'] <= last:
            continue
        if row['casa'] not in BOOKS or not row['activa'] or row['inicio_utc'] <= now:
            continue
        r = row['payload']
        if isinstance(r, str):
            r = json.loads(r)
        r = dict(r)
        stat, side, period = row['mercado'], row['lado'], row['periodo']
        mapped, reason = old.market_stat(dict(r, stat=stat, period=period))
        if reason or side not in ('over', 'under', 'at_least'):
            skipped[f'{stat}/{period}/{side}'] += 1
            continue
        line = Decimal(str(row['linea']))
        if side == 'at_least':
            if line != line.to_integral():
                raise ValueError('Hito no entero: revisar regla de liquidación')
            line -= Decimal('0.5')
            side = 'over'
        r['_publication_origin'] = row['lado']
        if row['casa'] == 'bet365' and ',' in str(r.get('jugador', '')):
            apellido, nombre = r['jugador'].split(',', 1)
            if apellido.strip() and nombre.strip():
                r['jugador_original_oddspapi'] = r['jugador']
                r['jugador'] = nombre.strip() + ' ' + apellido.strip()
        r.update(bookmaker=row['casa'], stat=stat, period=period, linea=float(line),
                 tipo=side, side=side, fecha_hora=row['inicio_utc'].isoformat(),
                 captured_at=row['ultima_captura'].isoformat(), cuota=float(row['cuota']),
                 active=True, suspended=False)
        output.append(r)
        games.add((str(row['fecha_partido']), row['partido']))
    return output, dict(skipped), games


@dataclass(frozen=True)
class LocalSnapshot:
    rows: list
    skipped: dict
    games: set
    scopes: tuple
    empty_scopes: frozenset
    source_rows: int


def select_snapshot(engine, first, last, now=None):
    """Una sola sentencia define cuotas y grupos de la misma imagen local."""
    from sqlalchemy import text
    now = now or datetime.now(TZ)
    with engine.connect() as conn, conn.begin():
        conn.execute(text('SET TRANSACTION READ ONLY'))
        conn.execute(text("SET LOCAL statement_timeout = '30s'"))
        source = conn.execute(text("""SELECT * FROM cuotas.selecciones
            WHERE fecha_partido BETWEEN :first AND :last
            AND casa IN ('betano','stake','bet365') ORDER BY id"""),
            {'first': first, 'last': last}).mappings().all()
    groups = {}
    for row in source:
        group = (row['casa'], row['fecha_partido'])
        groups.setdefault(group, []).append(row)
    # Solo se permite vaciar un grupo si todas sus filas de esta misma lectura
    # están inactivas o sus eventos ya comenzaron. Un mercado no soportado
    # por sí solo nunca autoriza retirar cuotas remotas.
    empty_scopes = frozenset(group for group, rows in groups.items()
                            if all(not r['activa'] or r['inicio_utc'] <= now for r in rows))
    rows, skipped, games = convert(source, first, last, now)
    return LocalSnapshot(rows, skipped, games, tuple(sorted(groups)),
                         empty_scopes, len(source))


def select_window(engine, first, last):
    # Compatibilidad con quienes solo necesitan las filas convertidas.
    snapshot = select_snapshot(engine, first, last)
    return snapshot.rows, snapshot.skipped, snapshot.games


class InTransaction:
    def __init__(self, conn):
        self.conn = conn

    @contextmanager
    def begin(self):
        yield self.conn


def cleanup(conn, meta, first, last):
    from sqlalchemy import text
    scope = """league='NBA' AND book IN ('betano','stake','bet365')
        AND (event_date IS NULL OR event_date < :first OR event_date > :last)"""
    params = {'first': first, 'last': last}
    kind, columns = meta[old.CACHE_TABLE]
    if kind in ('r', 'p'):
        if 'league' not in columns:
            raise ValueError('Caché sin league: no se puede limitar la limpieza a NBA')
        conn.execute(text(f'DELETE FROM {old.CACHE_TABLE} WHERE {scope}'), params)
    conn.execute(text(f'DELETE FROM {old.PROP_TABLE} WHERE {scope}'), params)



def reconcile(conn, meta, data, scopes, empty_scopes=frozenset()):
    from sqlalchemy import text
    scopes = frozenset(scopes)
    if any((r['book'], r['event_date']) not in scopes for r in data):
        raise ValueError('Cuotas fuera de la instantánea local: no se reconciliaron grupos')
    if not empty_scopes <= scopes:
        raise ValueError('Grupos vacíos no comprobados en la instantánea local')
    preserved = []
    for book, day in sorted(scopes):
        if book not in BOOKS:
            raise ValueError('Casa desconocida en la instantánea local')
        ids = [r['row_uid'] for r in data if r['book'] == book and r['event_date'] == day]
        if not ids and (book, day) not in empty_scopes:
            preserved.append((book, day))
            continue
        args = {'book': book, 'day': day, 'ids': ids}
        scope = "league='NBA' AND book=:book AND event_date=:day AND NOT(row_uid=ANY(CAST(:ids AS text[])))"
        conn.execute(text(f'DELETE FROM {old.PROP_TABLE} WHERE {scope}'), args)
        kind, columns = meta[old.CACHE_TABLE]
        if kind in ('r', 'p'):
            if 'row_uid' in columns:
                conn.execute(text(f'DELETE FROM {old.CACHE_TABLE} WHERE {scope}'), args)
            else:
                keys = ('book','event_date','game_norm','player_norm','stat_key','model_line','side')
                match = ' AND '.join(f'p.{k} IS NOT DISTINCT FROM c.{k}' for k in keys)
                conn.execute(text(f"DELETE FROM {old.CACHE_TABLE} c WHERE c.league='NBA' AND c.book=:book AND c.event_date=:day AND NOT EXISTS(SELECT 1 FROM {old.PROP_TABLE} p WHERE p.valid AND {match})"), args)
    return preserved


def resolver_selecciones_publicacion(rows):
    # Most recent observation first; native O/U wins only at equal time.
    groups = {}
    for r in rows:
        stat, reason = old.market_stat(r)
        if reason:
            raise ValueError('Mercado no compatible en la publicación')
        start = old.event_time(r, "")
        key = (r['bookmaker'], str(start.astimezone(TZ).date()),
               r['partido'].replace(' - ', ' @ '), r['jugador'], stat,
               str(float(r['linea'])), r['side'])
        groups.setdefault(key, []).append(r)
    selected = []
    for key, choices in groups.items():
        def rank(r):
            return (old.capture_time(r['captured_at']),
                    r.get('_publication_origin') != 'at_least')
        best_rank = max(rank(r) for r in choices)
        best = [r for r in choices if rank(r) == best_rank]
        if len({Decimal(str(r['cuota'])) for r in best}) > 1:
            raise ValueError('Precios contradictorios dentro del mismo tipo de mercado: '
                             + str(key))
        selected.append(best[0])
    print('Selecciones equivalentes unificadas para Supabase:', len(rows)-len(selected))
    return selected

def publication_plan(engine):
    now = datetime.now(TZ)
    first, last = window(now)
    snapshot = select_snapshot(engine, first, last, now)
    rows = resolver_selecciones_publicacion(snapshot.rows)
    signature = {
        'format': PUBLICATION_FORMAT,
        'window': (first, last), 'rows': rows,
        'scopes': snapshot.scopes, 'empty_scopes': sorted(snapshot.empty_scopes),
    }
    fingerprint = hashlib.sha256(json.dumps(
        signature, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()
    return first, last, snapshot, rows, fingerprint


def prepared_publication(engine):
    first, last, snapshot, rows, fingerprint = publication_plan(engine)
    data, report = [], None
    if rows:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / f'cuotas_{first}_{last}.json'
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
            data, report = old.prepare(path)
        if any(not first <= r['event_date'] <= last for r in data):
            raise ValueError('Fecha fuera de hoy/mañana: no se publicó nada')
        if report.get('descartadas'):
            raise ValueError('La validación descartó cuotas: no se retiraron selecciones remotas')
    print(json.dumps({
        'desde_argentina': str(first), 'hasta_argentina': str(last),
        'filas_locales_leidas': snapshot.source_rows,
        'grupos_locales': len(snapshot.scopes),
        'grupos_vacios_comprobados': len(snapshot.empty_scopes),
        'cuotas_compatibles': len(data),
        'por_fecha': dict(Counter(str(r['event_date']) for r in data)),
        'por_casa': dict(Counter(r['book'] for r in data)),
        'partidos': len(snapshot.games), 'solo_local_por_compatibilidad': snapshot.skipped,
        'captura_mas_antigua': min((r['scraped_at_utc'].isoformat() for r in data), default=None),
        'captura_mas_reciente': max((r['scraped_at_utc'].isoformat() for r in data), default=None),
    }, ensure_ascii=False, indent=2))
    return first, last, snapshot, data, report, fingerprint


def remember_publication(state, fingerprint):
    # El marcador solo se reemplaza después del COMMIT remoto. Si falla el
    # archivo local, la próxima ejecución repite una publicación idempotente.
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=state.parent,
                                         prefix='.publication-', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(fingerprint)
        try:
            temporary.replace(state)
        finally:
            temporary.unlink(missing_ok=True)
    except OSError:
        print('Aviso: Supabase confirmó la publicación, pero no se pudo guardar el marcador local. La próxima ejecución volverá a verificarla.')


def sync_window(engine, env_file, apply=False, check_db=False, force=False):
    if not apply and not check_db:
        prepared_publication(engine)
        print('SIMULACIÓN: sin conexión a Supabase. --check-db verifica esquema; --publicar envía.')
        return

    remote = old.engine_for_project(env_file)
    state = ROOT / '.publication-sha256'
    fingerprint = None
    logs = io.StringIO()
    try:
        with remote.begin() as conn:
            from sqlalchemy import text
            # Todos los publicadores que usan el importador existente comparten
            # esta clave. Leer local DESPUÉS del bloqueo evita planes viejos
            # esperando detrás de una publicación más reciente.
            locked = conn.execute(text(f'SELECT pg_try_advisory_xact_lock({PUBLICATION_LOCK})')).scalar_one()
            if not locked:
                raise RuntimeError('Hay otra publicación activa en Supabase. No se modificó nada; reintentá cuando termine.')
            first, last, snapshot, data, report, fingerprint = prepared_publication(engine)
            if window() != (first, last):
                raise ValueError('Cambió la fecha de Argentina: volvé a ejecutar')
            meta = old.check_schema(conn, data or [{k: None for k in TEMPLATE_KEYS}])
            if check_db and not apply:
                print('CHECK DB OK: esquema compatible; no se modificó Supabase.')
                return
            if not snapshot.source_rows:
                raise ValueError('La instantánea local está vacía: no se retiraron cuotas de Supabase')
            if not data and not snapshot.empty_scopes:
                print('SIN CUOTAS COMPATIBLES: los grupos remotos se conservaron sin cambios.')
                return
            try:
                unchanged = state.is_file() and state.read_text().strip() == fingerprint
            except OSError:
                unchanged = False
            if unchanged and not force:
                print('PUBLICACIÓN SIN CAMBIOS: no se modificó Supabase. --force permite verificar y reenviar.')
                return
            cleanup(conn, meta, first, last)
            preserved = reconcile(conn, meta, data, snapshot.scopes, snapshot.empty_scopes)
            if data:
                with redirect_stdout(logs):
                    old.upload(InTransaction(conn), data, report, False)
            elif meta[old.CACHE_TABLE][0] == 'm':
                conn.execute(text('REFRESH MATERIALIZED VIEW ' + old.CACHE_TABLE))
            if window() != (first, last):
                raise ValueError('Cambió la fecha de Argentina durante el envío: la publicación se revirtió')
        print(f'PUBLICACIÓN CONFIRMADA: {len(data)} cuotas de {first} a {last}.')
        if preserved:
            print(f'Grupos sin cuotas compatibles conservados sin retirar selecciones: {len(preserved)}.')
        print('Cuotas NBA de otras fechas retiradas de las tablas de publicación; histórico local conservado.')
        remember_publication(state, fingerprint)
    finally:
        remote.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env', default=str(ROOT / '.env'))
    parser.add_argument('--supabase-env', default='/home/alfedo/stats-app/.env.local')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check-db', action='store_true')
    mode.add_argument('--publicar', action='store_true')
    parser.add_argument('--force', action='store_true', help='Reenvía aunque el marcador local indique que no hay cambios; requiere --publicar')
    args = parser.parse_args()
    if args.force and not args.publicar:
        parser.error('--force requiere --publicar')
    try:
        from dotenv import load_dotenv
        import cuotas
        load_dotenv(args.env, override=True)
        engine = cuotas.local_engine()
        try:
            sync_window(engine, args.supabase_env, args.publicar, args.check_db, args.force)
        finally:
            engine.dispose()
        return 0
    except Exception as exc:
        if type(exc).__module__.startswith(('sqlalchemy', 'psycopg')):
            code = getattr(getattr(exc, 'orig', None), 'sqlstate', None)
            print(f'ERROR PostgreSQL ({type(exc).__name__}, SQLSTATE={code or "sin código"}). Revisá conexión, permisos y esquema. No se confirmó la publicación.')
        else:
            print('ERROR:', str(exc))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
