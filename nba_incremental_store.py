"""Incremental PostgreSQL writer. No API calls; caller owns the transaction."""
from dataclasses import dataclass
from datetime import date
import re
from uuid import uuid4

from sqlalchemy import text


@dataclass(frozen=True)
class SaveReport:
    received: int
    changed: int
    dates: tuple[date, ...] = ()

    @property
    def unchanged(self):
        return self.received - self.changed


def quote(name):
    if not isinstance(name, str) or not re.fullmatch(r"[a-z_][a-z0-9_]*", name):
        raise ValueError(f"Identificador SQL no permitido: {name!r}")
    return '"' + name + '"'


def _id(value):
    # Accept NBA IDs with leading zeros, but never truncate fractional IDs.
    if isinstance(value, bool) or value is None:
        raise ValueError('ID de jugador/partido inválido.')
    raw = str(value)
    if not re.fullmatch(r'\d+(?:\.0+)?', raw):
        raise ValueError('ID de jugador/partido inválido.')
    number = int(raw.split('.')[0])
    if not 0 < number <= 2147483647:
        raise ValueError('ID fuera del rango integer de esta base.')
    return number


def validate_records(records, start, end):
    start, end = date.fromisoformat(start), date.fromisoformat(end)
    if start > end:
        raise ValueError('Rango de fechas invertido.')
    seen, result = set(), []
    for source in records:
        row = dict(source)
        row['player_id'], row['game_id'] = _id(row.get('player_id')), _id(row.get('game_id'))
        day = date.fromisoformat(str(row.get('game_date')))
        if not start <= day <= end:
            raise ValueError('La descarga contiene un partido fuera del rango solicitado.')
        row['game_date'] = day
        key = row['player_id'], row['game_id']
        if key in seen:
            raise ValueError('La descarga repite jugador/partido. No se escribió nada.')
        seen.add(key)
        result.append(row)
    return result


def register_players(conn, records):
    """Only fetch matching IDs; new players join the same transaction as logs."""
    names = {}
    for row in records:
        name = row.get('player_name')
        if name:
            names[row['player_id']] = str(name).strip()
    if not names:
        return
    existing = set(conn.execute(text('SELECT id FROM public.players WHERE id = ANY(:ids)'),
                                {'ids': list(names)}).scalars())
    missing = set(names) - existing
    if not missing:
        return
    columns = set(conn.execute(text("""SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players'""")).scalars())
    fields = [c for c in ['id', 'api_id', 'full_name', 'first_name', 'last_name'] if c in columns]
    if 'id' not in fields:
        raise RuntimeError('No se encontró la clave public.players.id.')
    rows = []
    for player_id in sorted(missing):
        full = names[player_id]
        parts = full.split()
        data = dict(id=player_id, api_id=player_id, full_name=full,
                    first_name=parts[0] if parts else '', last_name=' '.join(parts[1:]))
        rows.append({c: data[c] for c in fields})
    conn.execute(text(f"INSERT INTO public.players ({', '.join(map(quote, fields))}) "
                      f"VALUES ({', '.join(':' + c for c in fields)}) ON CONFLICT (id) DO NOTHING"), rows)


def upsert_logs(conn, records, start, end, table='player_game_logs', register=True):
    records = validate_records(records, start, end)
    if not records:
        return SaveReport(0, 0)
    target = 'public.' + quote(table)
    locked = conn.execute(text('SELECT pg_try_advisory_xact_lock(hashtext(:key))'),
                          {'key': 'moskprops.daily.' + table}).scalar_one()
    if not locked:
        raise RuntimeError('Ya hay otra escritura NBA en curso. No se escribió nada.')
    unique = conn.execute(text("""
      SELECT EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid = CAST(:target AS regclass)
          AND i.indisunique AND i.indisvalid AND i.indimmediate
          AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 2
          AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, pos)
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                    WHERE k.pos <= i.indnkeyatts ORDER BY a.attname) = ARRAY['game_id','player_id']
      )"""), {'target': target}).scalar_one()
    if not unique:
        raise RuntimeError('Falta un índice único válido (player_id, game_id). Ejecutá primero 01_clave_player_game_logs.sql.')
    cols = conn.execute(text("""SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
          AND is_generated = 'NEVER' AND is_identity = 'NO' ORDER BY ordinal_position"""),
                        {'table': table}).all()
    available = {name for name, _ in cols}
    supplied = set().union(*(row.keys() for row in records)) - {'id'}
    if supplied - available:
        raise ValueError('Columnas no compatibles con la tabla destino: ' + ', '.join(sorted(supplied - available)))
    fields = [name for name, _ in cols if name in supplied]
    data_fields = [c for c in fields if c not in {'player_id', 'game_id', 'updated_at', 'created_at', 'pulled_for_date'}]
    write_fields = [c for c in fields if c not in {'player_id', 'game_id', 'created_at'}]
    stage = quote('nba_daily_stage_' + uuid4().hex)
    # CTAS only creates a TEMP table. It never replaces the target or its indexes.
    # Using target types prevents float4 rounding from triggering false changes.
    columns_sql = ', '.join(map(quote, fields))
    conn.execute(text(f'CREATE TEMP TABLE {stage} ON COMMIT DROP AS SELECT {columns_sql} FROM {target} WITH NO DATA'))
    insert_stage = text(f'INSERT INTO {stage} ({columns_sql}) VALUES ({", ".join(":" + c for c in fields)})')
    string_columns = {name for name, kind in cols if kind in {'text', 'character varying', 'character'}}
    payload = [{c: (str(row[c]) if c in string_columns and row.get(c) is not None else row.get(c))
                for c in fields} for row in records]
    for offset in range(0, len(payload), 250):
        conn.execute(insert_stage, payload[offset:offset + 250])

    def different(old, new):
        left = ', '.join(f'{old}.{quote(c)}' for c in data_fields)
        right = ', '.join(f'COALESCE({new}.{quote(c)}, {old}.{quote(c)})' for c in data_fields)
        return f'ROW({left}) IS DISTINCT FROM ROW({right})'

    predicate = f'o.player_id IS NULL OR {different("o", "s")}'
    candidates = conn.execute(text(f'''SELECT s.player_id, s.game_id, o.game_date AS old_date
        FROM {stage} s LEFT JOIN {target} o USING (player_id, game_id) WHERE {predicate}''')).all()
    if not candidates:
        return SaveReport(len(records), 0)
    if register:
        register_players(conn, records)
    assignments = ', '.join(f'{quote(c)} = COALESCE(EXCLUDED.{quote(c)}, t.{quote(c)})' for c in write_fields)
    changed = conn.execute(text(f'''INSERT INTO {target} AS t ({columns_sql})
        SELECT {', '.join('s.' + quote(c) for c in fields)} FROM {stage} s
        LEFT JOIN {target} o USING (player_id, game_id) WHERE {predicate}
        ON CONFLICT (player_id, game_id) DO UPDATE SET {assignments}
        WHERE {different('t', 'EXCLUDED')}
        RETURNING player_id, game_id, game_date''')).all()
    actual = {(row.player_id, row.game_id) for row in changed}
    dates = {row.game_date for row in changed if row.game_date is not None}
    dates.update(row.old_date for row in candidates
                 if row.old_date is not None and (row.player_id, row.game_id) in actual)
    return SaveReport(len(records), len(changed), tuple(sorted(dates)))
