"""Potenciales por partido: descarga NBA reanudable, sólo SQLite local.

No usa credenciales, no escribe PostgreSQL y no crea boxscores incompletos.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import gzip
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

VERSION = 1
SEASONS = ('2023-24', '2024-25')
PHASES = ('Regular Season', 'Playoffs')
TEAMS = set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split())
SOURCE = 'NBA leaguedashptstats / Passing / Totals / fecha individual'
HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.nba.com/', 'Origin': 'https://www.nba.com'}


class DataError(ValueError):
    pass


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def atomic(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix='.' + path.name)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def integer(value, label):
    if isinstance(value, bool) or value is None or str(value).strip() == '':
        raise DataError(label + ' ausente o inválido')
    try:
        n = float(value)
    except (ValueError, TypeError, OverflowError):
        raise DataError(label + ' inválido') from None
    if not math.isfinite(n) or n < 0 or n != int(n):
        raise DataError(label + ' no es un entero no negativo')
    return int(n)


def potential(value):
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return integer(value, 'POTENTIAL_AST')


def norm_game(value):
    n = integer(value, 'GAME_ID')
    if not n:
        raise DataError('GAME_ID vacío')
    return str(n).zfill(10)


def parse_set(payload, required):
    sets = payload.get('resultSets') if isinstance(payload, dict) else None
    if not isinstance(sets, list):
        raise DataError('NBA no devolvió resultSets')
    candidates = [s for s in sets if isinstance(s, dict) and isinstance(s.get('headers'), list) and set(required) <= set(s['headers'])]
    if len(candidates) != 1:
        raise DataError('NBA no devolvió un único conjunto con las columnas necesarias')
    s = candidates[0]
    if len(set(s['headers'])) != len(s['headers']) or not isinstance(s.get('rowSet'), list):
        raise DataError('Columnas duplicadas o filas inválidas')
    output = []
    for row in s['rowSet']:
        if not isinstance(row, list) or len(row) != len(s['headers']):
            raise DataError('Una fila NBA tiene un formato inesperado')
        output.append(dict(zip(s['headers'], row)))
    return output


def passing_params(day, season, phase):
    d = date.fromisoformat(day).strftime('%m/%d/%Y')
    return dict(College='', Conference='', Country='', DateFrom=d, DateTo=d, Division='', DraftPick='', DraftYear='', GameScope='', Height='', LastNGames=0, LeagueID='00', Location='', Month=0, OpponentTeamID=0, Outcome='', PORound=0, PaceAdjust='N', PerMode='Totals', PlayerExperience='', PlayerOrTeam='Player', PlayerPosition='', PtMeasureType='Passing', Season=season, SeasonSegment='', SeasonType=phase, StarterBench='', TeamID=0, VsConference='', VsDivision='', Weight='')


class NBA:
    def __init__(self, delay=1.5, timeout=45):
        self.delay, self.timeout, self.last = delay, timeout, 0.0

    def get(self, endpoint, params):
        for attempt in range(3):
            time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            req = urllib.request.Request('https://stats.nba.com/stats/' + endpoint + '?' + urllib.parse.urlencode(params), headers=HEADERS)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as response:
                    data = response.read(25_000_001)
                if len(data) > 25_000_000:
                    raise DataError('Respuesta NBA demasiado grande')
                return json.loads(data)
            except urllib.error.HTTPError as error:
                if error.code in (403, 429):
                    raise DataError('NBA HTTP ' + str(error.code) + ': descarga detenida; los avances locales se conservaron') from None
                if attempt == 2 or error.code < 500:
                    raise DataError('NBA HTTP ' + str(error.code)) from None
            except (OSError, TimeoutError, json.JSONDecodeError):
                if attempt == 2:
                    raise DataError('No se pudo obtener una respuesta JSON de NBA; reintentá más tarde') from None
            time.sleep(2 * (attempt + 1))


def open_store(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(path, timeout=30)
    version = c.execute('PRAGMA user_version').fetchone()[0]
    if version not in (0, VERSION):
        c.close()
        raise DataError('Versión SQLite no compatible')
    c.execute('PRAGMA journal_mode=WAL')
    c.executescript('''
      CREATE TABLE IF NOT EXISTS responses (
        cache_key TEXT PRIMARY KEY, sha256 TEXT NOT NULL, payload BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS potential_games (
        season TEXT NOT NULL, phase TEXT NOT NULL, game_date TEXT NOT NULL,
        game_id TEXT NOT NULL, player_id INTEGER NOT NULL, player_name TEXT NOT NULL,
        team TEXT NOT NULL, opponent TEXT NOT NULL, potential_ast INTEGER NOT NULL,
        PRIMARY KEY (player_id,game_id));
      CREATE TABLE IF NOT EXISTS days (
        season TEXT NOT NULL, phase TEXT NOT NULL, game_date TEXT NOT NULL,
        expected INTEGER NOT NULL, found INTEGER NOT NULL, missing INTEGER NOT NULL,
        checked_at TEXT NOT NULL, PRIMARY KEY(season,phase,game_date));
      CREATE TABLE IF NOT EXISTS team_labels (
        player_id INTEGER NOT NULL, game_id TEXT NOT NULL, game_date TEXT NOT NULL,
        actual_team TEXT NOT NULL, reported_team TEXT NOT NULL,
        PRIMARY KEY(player_id,game_id));
    ''')
    c.execute('PRAGMA user_version=1')
    return c


def cached(c, client, key, endpoint, params, refresh=False):
    row = c.execute('SELECT sha256,payload FROM responses WHERE cache_key=?', (key,)).fetchone()
    if row and not refresh:
        data = gzip.decompress(row[1])
        if digest(data) != row[0]:
            raise DataError('Caché local dañada: ' + key)
        return json.loads(data)
    payload = client.get(endpoint, params)
    data = canonical(payload)
    # Se valida antes de usar; no se pierde la copia previa si la red falla.
    return payload


def save_response(c, key, payload):
    data = canonical(payload)
    c.execute('INSERT OR REPLACE INTO responses VALUES(?,?,?)', (key, digest(data), gzip.compress(data, mtime=0)))


def roster_rows(payload, season, phase):
    rows = parse_set(payload, ['PLAYER_ID', 'TEAM_ABBREVIATION', 'GAME_ID', 'GAME_DATE', 'MATCHUP', 'MIN'])
    if not rows:
        raise DataError('Índice de jugadores/partidos vacío; no se marca la temporada como descargada')
    prefix = '002' if phase == 'Regular Season' else '004'
    result, identities, player_days = [], set(), set()
    for r in rows:
        game = norm_game(r['GAME_ID'])
        if not game.startswith(prefix):
            raise DataError('Un partido no corresponde al tipo de temporada solicitado')
        day = str(r['GAME_DATE'])[:10]
        date.fromisoformat(day)
        if not f'{season[:4]}-09-01' <= day < f'{int(season[:4]) + 1}-09-01':
            raise DataError('Fecha fuera de la temporada solicitada')
        player = integer(r['PLAYER_ID'], 'PLAYER_ID')
        team = str(r['TEAM_ABBREVIATION']).strip().upper()
        match = re.fullmatch(r'([A-Z]{3})\s+(?:vs\.?|@)\s+([A-Z]{3})', str(r['MATCHUP']).strip(), re.I)
        if not player or team not in TEAMS or not match or match[1].upper() != team or match[2].upper() not in TEAMS or match[2].upper() == team:
            raise DataError('Identidad o rival del índice no verificable')
        ident = (player, game)
        if ident in identities or (player, day) in player_days:
            raise DataError('Jugador duplicado o con más de un partido en la misma fecha')
        identities.add(ident)
        player_days.add((player, day))
        # LeagueGameLog sólo indexa actuaciones; 0.0 puede ser tiempo redondeado.
        minutes = r['MIN']
        if isinstance(minutes, str) and ':' in minutes:
            mm, ss = minutes.split(':', 1)
            minutes = float(mm) + float(ss) / 60
        if minutes is None or not math.isfinite(float(minutes)) or float(minutes) < 0:
            raise DataError('Minutos del índice no verificables')
        result.append(dict(season=season, phase=phase, game_date=day, game_id=game, player_id=player, player_name=str(r.get('PLAYER_NAME') or ''), team=team, opponent=match[2].upper()))
    if not result:
        raise DataError('Índice sin jugadores con minutos confirmados')
    return result


def join_day(payload, roster):
    if not roster:
        raise DataError('No hay índice diario para verificar Passing')
    context = {(r['game_date'], r['season'], r['phase']) for r in roster}
    if len(context) != 1:
        raise DataError('Passing requiere exactamente una fecha/temporada/tipo')
    day, season, phase = next(iter(context))
    requested = passing_params(day, season, phase)
    parameters = payload.get('parameters') if isinstance(payload, dict) else None
    if not isinstance(parameters, dict) or any(parameters.get(k) != requested[k] for k in ('DateFrom','DateTo','Season','SeasonType','PtMeasureType','PerMode')):
        raise DataError('NBA no confirmó el rango diario y el modo Totals solicitados')
    rows = parse_set(payload, ['PLAYER_ID', 'TEAM_ABBREVIATION', 'GP', 'POTENTIAL_AST'])
    expected = {r['player_id']: r for r in roster}
    if len(expected) != len(roster):
        raise DataError('Índice diario ambiguo')
    result, seen = [], set()
    for raw in rows:
        pid = integer(raw['PLAYER_ID'], 'PLAYER_ID')
        if pid in seen:
            raise DataError('Jugador repetido en Passing diario')
        seen.add(pid)
        gp = integer(raw['GP'], 'GP')
        if gp == 0:
            continue
        if gp != 1:
            raise DataError('Passing devolvió un agregado de varios partidos')
        base = expected.get(pid)
        if base is None:
            raise DataError('Passing contiene un jugador sin partido verificable en esa fecha')
        reported_team = str(raw['TEAM_ABBREVIATION']).strip().upper()
        if reported_team not in TEAMS:
            raise DataError('Passing contiene un equipo no reconocible')
        value = potential(raw['POTENTIAL_AST'])
        if value is not None:
            # Passing puede etiquetar un equipo posterior al traspaso. La identidad
            # del encuentro viene del índice jugador+fecha, único y verificado.
            result.append({**base, 'potential_ast': value, 'reported_team': reported_team})
    return result


def store_day(c, season, phase, day, roster, payload):
    values = join_day(payload, roster)
    with c:
        # Un reintento incompleto no borra los potenciales ya verificados.
        c.executemany('INSERT OR REPLACE INTO potential_games VALUES(:season,:phase,:game_date,:game_id,:player_id,:player_name,:team,:opponent,:potential_ast)', values)
        c.executemany('INSERT OR REPLACE INTO team_labels VALUES(:player_id,:game_id,:game_date,:team,:reported_team)', [r for r in values if r['team'] != r['reported_team']])
        found = c.execute('SELECT count(*) FROM potential_games WHERE season=? AND phase=? AND game_date=?', (season, phase, day)).fetchone()[0]
        c.execute('INSERT OR REPLACE INTO days VALUES(?,?,?,?,?,?,?)', (season, phase, day, len(roster), found, max(0, len(roster) - found), datetime.now(timezone.utc).isoformat()))
        save_response(c, f'passing/{season}/{phase}/{day}', payload)
    return found


def report(c):
    summaries = [dict(zip(('season','phase','days','expected','found','missing'), r)) for r in c.execute('SELECT season,phase,count(*),sum(expected),sum(found),sum(missing) FROM days GROUP BY season,phase ORDER BY season,phase')]
    indexed = []
    for key, sha, compressed in c.execute("SELECT cache_key,sha256,payload FROM responses WHERE cache_key LIKE 'index/%' ORDER BY cache_key"):
        raw = gzip.decompress(compressed)
        if digest(raw) != sha:
            raise DataError('Índice local dañado')
        _, season, phase = key.split('/', 2)
        roster = roster_rows(json.loads(raw), season, phase)
        total_days = len({r['game_date'] for r in roster})
        done = next((r for r in summaries if r['season'] == season and r['phase'] == phase), {'days': 0, 'missing': 0, 'found': 0})
        indexed.append({'season': season, 'phase': phase, 'dates_in_index': total_days, 'dates_downloaded': done['days'], 'dates_pending': total_days - done['days'], 'player_games_in_index': len(roster), 'download_finished': total_days == done['days'], 'coverage_complete': total_days == done['days'] and done['missing'] == 0})
    gaps = [dict(zip(('season','phase','date','expected','found','missing'), r)) for r in c.execute('SELECT season,phase,game_date,expected,found,missing FROM days WHERE missing>0 ORDER BY season,phase,game_date')]
    labels = [dict(zip(('player_id','game_id','date','actual_team','passing_team'), r)) for r in c.execute('SELECT * FROM team_labels ORDER BY game_date,player_id LIMIT 20')]
    return {'format': 1, 'source': SOURCE, 'indexed_coverage': indexed, 'summaries': summaries, 'days_with_missing': gaps, 'rows': c.execute('SELECT count(*) FROM potential_games').fetchone()[0], 'team_labels_reconciled': c.execute('SELECT count(*) FROM team_labels').fetchone()[0], 'team_label_examples': labels}


def download(c, client, seasons, phases, max_days=None, retry_missing=False):
    done = 0
    for season in seasons:
        for phase in phases:
            cache_key = f'index/{season}/{phase}'
            payload = cached(c, client, cache_key, 'leaguegamelog', dict(Counter=0, DateFrom='', DateTo='', Direction='ASC', LeagueID='00', PlayerOrTeam='P', Season=season, SeasonType=phase, Sorter='DATE'))
            roster = roster_rows(payload, season, phase)
            with c:
                save_response(c, cache_key, payload)
            days = sorted({r['game_date'] for r in roster})
            print(f'{season} · {phase}: {len(days)} fechas, {len(roster)} jugador-partidos en el índice', flush=True)
            for day in days:
                prior = c.execute('SELECT missing FROM days WHERE season=? AND phase=? AND game_date=?', (season, phase, day)).fetchone()
                if prior and (prior[0] == 0 or not retry_missing):
                    continue
                if max_days is not None and done >= max_days:
                    return
                daily = [r for r in roster if r['game_date'] == day]
                key = f'passing/{season}/{phase}/{day}'
                payload = cached(c, client, key, 'leaguedashptstats', passing_params(day, season, phase), refresh=bool(prior and retry_missing))
                found = store_day(c, season, phase, day, daily, payload)
                done += 1
                print(f'  {day}: potenciales {found}/{len(daily)} · avance guardado', flush=True)


def enrich_archive(directory, manifest, load_part, save_part):
    """Actualiza sólo potential_ast de facts existentes; no agrega filas parciales."""
    from .common import STATE
    path = STATE / 'potential-history' / 'history.sqlite'
    if not path.exists():
        return
    conn = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        if conn.execute('PRAGMA user_version').fetchone()[0] != VERSION:
            raise DataError('Versión del histórico de potenciales inválida')
        columns = ('season','phase','game_date','game_id','player_id','player_name','team','opponent','potential_ast')
        data = [dict(zip(columns, r)) for r in conn.execute('SELECT * FROM potential_games ORDER BY player_id,game_id')]
    finally:
        conn.close()
    by_player = {}
    for row in data:
        by_player.setdefault(str(row['player_id']), {})[norm_game(row['game_id'])] = row
    used, changed, mismatches = set(), 0, []
    for pid, indexed in by_player.items():
        name = 'facts/' + pid
        if name not in manifest['parts']:
            continue
        rows = load_part(directory, manifest['parts'][name])
        dirty = False
        for r in rows:
            row = indexed.get(norm_game(r.get('game_id')))
            if not row:
                continue
            team = str(r.get('team_abbreviation') or r.get('team_abbr') or '').strip().upper()
            if str(r.get('game_date',''))[:10] != row['game_date'] or team != row['team'] or integer(r.get('player_id'), 'player_id') != row['player_id']:
                mismatches.append({'player_id': row['player_id'], 'game_id': row['game_id']})
                continue
            used.add((row['player_id'], row['game_id']))
            if r.get('potential_ast') != row['potential_ast'] or r.get('potential_ast_source') != SOURCE:
                r['potential_ast'] = row['potential_ast']
                r['potential_ast_source'] = SOURCE
                dirty = True
                changed += 1
        if dirty:
            manifest['parts'][name] = save_part(directory, name, rows)
    info = {'downloaded': len(data), 'matched_archive': len(used), 'changed': changed, 'not_in_archive_or_mismatch': len(data) - len(used), 'identity_mismatches': mismatches[:50], 'source': SOURCE}
    atomic(STATE / 'potential-history' / 'archive-report.json', canonical(info))
    manifest['potential_ast_history'] = {'format': VERSION, 'sha256': digest(canonical(data)), 'matched_archive': len(used)}
    print('POTENCIALES HISTÓRICOS: ' + json.dumps(info, ensure_ascii=False), flush=True)


def main():
    p = argparse.ArgumentParser(description='Potenciales históricos NBA; descarga local sin PostgreSQL ni credenciales')
    p.add_argument('command', choices=['probe','download','report'])
    p.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    p.add_argument('--seasons', nargs='+', choices=SEASONS, default=list(SEASONS))
    p.add_argument('--phases', nargs='+', choices=PHASES, default=list(PHASES))
    p.add_argument('--retry-missing', action='store_true')
    p.add_argument('--max-days', type=int)
    p.add_argument('--delay', type=float, default=1.5)
    a = p.parse_args()
    if a.max_days is not None and a.max_days < 1 or not math.isfinite(a.delay) or a.delay < 1:
        p.error('--max-days debe ser positivo y --delay al menos 1 segundo')
    folder = a.project.resolve() / 'maintenance-state' / 'potential-history'
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / 'download.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Ya hay una descarga de potenciales en curso.', file=sys.stderr)
            return 75
        with contextlib.closing(open_store(folder / 'history.sqlite')) as c:
            try:
                if a.command == 'probe':
                    for season in a.seasons:
                        download(c, NBA(a.delay), [season], ['Regular Season'], max_days=1, retry_missing=a.retry_missing)
                elif a.command == 'download':
                    download(c, NBA(a.delay), a.seasons, a.phases, max_days=a.max_days, retry_missing=a.retry_missing)
                result = report(c)
                atomic(folder / 'report.json', canonical(result))
                print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
                return 0
            except (DataError, sqlite3.Error, ValueError, OSError) as error:
                try:
                    atomic(folder / 'report.json', canonical(report(c)))
                except (DataError, sqlite3.Error, ValueError, OSError):
                    pass
                print('ERROR: ' + str(error), file=sys.stderr)
                return 1


if __name__ == '__main__':
    raise SystemExit(main())
