"""Compare typed cache snapshots; mutate only differing rows in one transaction."""
from datetime import date
from uuid import uuid4
from sqlalchemy import text


def qi(name):
    return '"' + name.replace('"', '""') + '"'


def sync_cache(conn, table, fields, source_sql, start, end, check=False):
    if date.fromisoformat(start) > date.fromisoformat(end):
        raise ValueError('Rango de fechas invertido.')
    if not fields or 'game_date' not in fields or 'row_id' in fields or len(set(fields)) != len(fields):
        raise ValueError('Columnas de caché inválidas.')
    target = 'public.' + qi(table)
    cols = ', '.join(map(qi, fields))
    stage = qi('cache_stage_' + uuid4().hex)
    old_stage = qi('cache_old_' + uuid4().hex)
    conn.execute(text("SET LOCAL lock_timeout = '5s'"))
    conn.execute(text("SET LOCAL statement_timeout = '120s'"))
    locked = conn.execute(text('SELECT pg_try_advisory_xact_lock(hashtext(:key))'),
                          {'key': 'moskprops.cache.' + table}).scalar_one()
    if not locked:
        raise RuntimeError('Ya hay otro refresco de esta caché.')
    params = {'s': start, 'e': end}
    # Stage in target types without copying indexes, identity or generated columns.
    conn.execute(text(f'CREATE TEMP TABLE {stage} ON COMMIT DROP AS SELECT {cols} FROM {target} WITH NO DATA'))
    conn.execute(text(f'INSERT INTO {stage} ({cols}) {source_sql}'), params)
    if conn.execute(text(f'SELECT EXISTS (SELECT 1 FROM {stage} WHERE game_date IS NULL OR game_date < CAST(:s AS date) OR game_date > CAST(:e AS date))'), params).scalar_one():
        raise ValueError('La vista devolvió fechas fuera del rango; no se modifica la caché.')
    # Stabilize target across comparison/delete/insert; reads remain possible.
    if not check:
        conn.execute(text(f'LOCK TABLE {target} IN SHARE ROW EXCLUSIVE MODE'))
    window = 'game_date BETWEEN CAST(:s AS date) AND CAST(:e AS date)'
    old = f'SELECT ctid AS row_id, {cols} FROM {target} WHERE {window}'
    # Read the target window once; reuse the small temporary snapshot for all comparisons.
    conn.execute(text(f'CREATE TEMP TABLE {old_stage} ON COMMIT DROP AS {old}'), params)
    old_keys = f"SELECT row_id, to_jsonb(o) - 'row_id' AS key FROM {old_stage} o"
    new_keys = f'SELECT s.ctid AS row_id, to_jsonb(s) AS key FROM {stage} s'
    # Count duplicates explicitly: equal sets with differing multiplicity aren't equal.
    ctes = f'''WITH old_keys AS ({old_keys}), new_keys AS ({new_keys}),
      old_counts AS (SELECT key, count(*) n FROM old_keys GROUP BY key),
      new_counts AS (SELECT key, count(*) n FROM new_keys GROUP BY key),
      old_ranked AS (SELECT row_id, key, row_number() OVER (PARTITION BY key ORDER BY row_id) n FROM old_keys),
      new_ranked AS (SELECT row_id, key, row_number() OVER (PARTITION BY key ORDER BY row_id) n FROM new_keys)'''
    removed = 'SELECT o.row_id FROM old_ranked o LEFT JOIN new_counts n USING(key) WHERE o.n > COALESCE(n.n,0)'
    added = 'SELECT n.row_id FROM new_ranked n LEFT JOIN old_counts o USING(key) WHERE n.n > COALESCE(o.n,0)'
    remove_count, add_count, source_count = conn.execute(text(ctes + f'''
      SELECT (SELECT count(*) FROM ({removed}) d),
             (SELECT count(*) FROM ({added}) a), (SELECT count(*) FROM {stage})'''), params).one()
    if source_count == 0 and remove_count:
        raise RuntimeError('La vista está vacía pero hay caché guardada. Se conserva; revisar la fuente antes de borrar.')
    if not check and (remove_count or add_count):
        conn.execute(text(ctes + f'DELETE FROM {target} WHERE ctid = ANY(ARRAY({removed}))'), params)
        # Both deltas use the same snapshot: surplus old copies and missing new copies.
        conn.execute(text(ctes + f'INSERT INTO {target} ({cols}) SELECT {cols} FROM {stage} WHERE ctid IN ({added})'), params)
    report = dict(source=int(source_count), removed=int(remove_count), added=int(add_count), check=check)
    print(f"{'COMPROBACIÓN' if check else 'CACHÉ'} {table}: fuente={source_count}; retirar={remove_count}; agregar={add_count}")
    return report
