"""Recupera marcas defensivas NBA faltantes en un almacén local reanudable."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import date, datetime, timedelta
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

from .defense_snapshot import TEAMS, normalize, number as archive_number

FILENAME = 'matchup-history-v1.sqlite3'
MAX_BODY = 4_000_000
URL = 'https://stats.nba.com/stats/boxscorematchupsv3?GameID='
PHASES = {'002': 'Regular Season', '004': 'Playoffs'}
STATS = {
    'matchupMinutesSort': 'matchup_minutes_sort',
    'partialPossessions': 'partial_possessions',
    'percentageOffensiveTotalTime': 'percentage_offensive_total_time',
    'switchesOn': 'switches_on', 'playerPoints': 'player_points', 'teamPoints': 'team_points',
    'matchupAssists': 'matchup_assists', 'matchupPotentialAssists': 'matchup_potential_assists',
    'matchupTurnovers': 'matchup_turnovers', 'matchupBlocks': 'matchup_blocks',
    'matchupFieldGoalsMade': 'matchup_field_goals_made',
    'matchupFieldGoalsAttempted': 'matchup_field_goals_attempted',
    'matchupThreePointersMade': 'matchup_three_pointers_made',
    'matchupThreePointersAttempted': 'matchup_three_pointers_attempted',
    'shootingFouls': 'shooting_fouls',
}


def positive_id(value):
    if not re.fullmatch(r'[1-9]\d{0,9}', str(value)):
        raise ValueError('ID de jugador inválido')
    return int(value)


def game_id(value):
    raw = str(value)
    if not re.fullmatch(r'\d{1,10}', raw) or raw.zfill(10)[:3] not in PHASES:
        return None
    return raw.zfill(10)


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) and value >= 0 else None


def valid_season(value):
    return isinstance(value, str) and bool(re.fullmatch(r'20\d{2}-\d{2}', value)) and int(value[-2:]) == (int(value[:4]) + 1) % 100


def seasons(at):
    year = at.year - (at.month < 10)
    return [f'{y}-{(y + 1) % 100:02d}' for y in range(year, year - 4, -1)]


def archive_rows(directory, meta):
    path = (directory / meta['path']).resolve()
    if not path.is_relative_to(directory.resolve()) or not 0 < meta['bytes'] <= 49_000_000:
        raise ValueError('Parte fuera del archivo')
    raw = path.read_bytes()
    if len(raw) != meta['bytes'] or hashlib.sha256(raw).hexdigest() != meta['sha256']:
        raise ValueError('Parte con hash incorrecto: ' + str(path.name))
    rows = json.loads(gzip.decompress(raw))
    if not isinstance(rows, list) or len(rows) != meta['rows']:
        raise ValueError('Parte con conteo incorrecto')
    return rows


def game_index(path):
    if path.stat().st_size > MAX_BODY:
        raise ValueError('Calendario demasiado grande')
    data = json.loads(path.read_bytes())
    if not isinstance(data,list) or not 1 <= len(data) <= 6000:
        raise ValueError('Calendario inválido')
    result = {}
    for g in data:
        gid, day, season, teams = g['id'], g['date'], g['season'], frozenset(g['teams'])
        when = date.fromisoformat(day)
        if (not gid or gid in result or game_id(gid) != gid or when.isoformat() != day
                or season != seasons(when)[0] or gid[3:5] != season[2:4] or len(teams) != 2 or not teams <= TEAMS):
            raise ValueError('Identidad inválida en el calendario')
        result[gid] = dict(id=gid,date=day,season=season,teams=teams,expected={})
    return result


def plan(directory, wanted_seasons, before, player=None, opponent=None, calendar=None):
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('format') != 1 or not manifest['parts']:
        raise ValueError('Índice local inválido o vacío')
    games, conflicts = {}, set()
    for key, part in manifest['parts'].items():
        if not key.startswith('facts/') or player is not None and key != f'facts/{player}':
            continue
        for raw in archive_rows(directory, part):
            r = normalize(raw, {})
            if not r or r['season'] not in wanted_seasons or r['date'] >= before or opponent and r['opponent'] != opponent:
                continue
            gid = game_id(r['id'])
            if not gid or gid[3:5] != r['season'][2:4] or r['phase'] != PHASES[gid[:3]]:
                continue
            teams = frozenset((r['team'], r['opponent']))
            g = games.setdefault(gid, {'id': gid, 'date': r['date'], 'season': r['season'], 'teams': teams, 'expected': {}})
            if (g['date'], g['season'], g['teams']) != (r['date'], r['season'], teams) or g['expected'].get(r['playerId'], r['team']) != r['team']:
                conflicts.add(gid)
            else:
                g['expected'][r['playerId']] = r['team']
    for gid in conflicts:
        del games[gid]
    if calendar and player is None and opponent is None:
        for gid, g in game_index(calendar).items():
            if gid in conflicts or g['season'] not in wanted_seasons or g['date'] >= before:
                continue
            old = games.get(gid)
            if old and any(old[k] != g[k] for k in ('date','season','teams')):
                conflicts.add(gid)
                del games[gid]
                continue
            selected = games.setdefault(gid, g)
            # Sin suficientes box scores de ambos equipos no se puede confirmar cobertura previa.
            present = Counter(selected['expected'].values())
            selected['unverified_roster'] = any(present[team] < 5 for team in g['teams'])
    for key, part in manifest['parts'].items():
        bits = key.split('/')
        if len(bits) != 3 or bits[0] != 'matchups' or not bits[1].isdigit() or bits[2] not in wanted_seasons or player is not None and bits[1] != str(player):
            continue
        for row in archive_rows(directory, part):
            g = games.get(game_id(row.get('game_id')))
            if g is None or g['season'] != bits[2]:
                continue
            try:
                pid = positive_id(row.get('offensive_player_id'))
                defender = positive_id(row.get('defensive_player_id'))
            except ValueError:
                continue
            if pid != int(bits[1]) or pid == defender or pid not in g['expected'] or str(row.get('game_date') or '')[:10] != g['date']:
                continue
            if (row.get('offensive_team_abbr'), row.get('defensive_team_abbr')) != (g['expected'][pid], next(iter(g['teams'] - {g['expected'][pid]}))):
                continue
            clock = str(row.get('matchup_minutes') or '')
            if (archive_number(row.get('partial_possessions')) or archive_number(row.get('matchup_minutes_sort'))
                    or re.fullmatch(r'\d{1,2}:[0-5]\d', clock) and int(clock.replace(':', '')) > 0):
                g.setdefault('archived', set()).add(pid)
    return manifest.get('id'), sorted(games.values(), key=lambda g: (g['date'], g['id']), reverse=True), len(conflicts)


def parse(payload, game):
    box = payload['boxScoreMatchups']
    if box.get('gameId') != game['id']:
        raise ValueError('La respuesta pertenece a otro partido')
    home, away = box['homeTeam'], box['awayTeam']
    if {home['teamTricode'], away['teamTricode']} != game['teams'] or home['teamId'] != box['homeTeamId'] or away['teamId'] != box['awayTeamId']:
        raise ValueError('Los equipos no coinciden con el archivo')
    rosters = {}
    for team in (home, away):
        players = team['players']
        if not isinstance(players, list) or not 1 <= len(players) <= 30:
            raise ValueError('Plantel de la fuente inválido')
        roster = {positive_id(p['personId']): p for p in players}
        if len(roster) != len(players):
            raise ValueError('Jugadores duplicados')
        rosters[team['teamTricode']] = roster
    if set(rosters[home['teamTricode']]) & set(rosters[away['teamTricode']]):
        raise ValueError('Jugador figura en ambos equipos')
    rows = {}
    for team, rival in ((home, away), (away, home)):
        own, opposing = team['teamTricode'], rival['teamTricode']
        for pid, p in rosters[own].items():
            items = p['matchups']
            if not isinstance(items, list) or len(items) > 30:
                raise ValueError('Cruces inválidos')
            for item in items:
                defender = positive_id(item['personId'])
                target = rosters[opposing].get(defender)
                if defender in rosters[own] or (defender not in rosters[opposing] and game['expected'].get(defender) != opposing):
                    raise ValueError('Defensor no verificado en el equipo rival')
                if game['expected'].get(pid, own) != own:
                    raise ValueError('Atacante no coincide con el archivo')
                stat = item['statistics']
                values = {dst: number(stat.get(src)) for src, dst in STATS.items()}
                if not (values['matchup_minutes_sort'] or values['partial_possessions']):
                    continue
                for made, attempted in (('matchup_field_goals_made', 'matchup_field_goals_attempted'),
                                        ('matchup_three_pointers_made', 'matchup_three_pointers_attempted')):
                    if values[made] is not None and values[attempted] is not None and values[made] > values[attempted]:
                        raise ValueError('Tiros anotados mayores que intentados')
                core = [values[k] for k in ('matchup_field_goals_made', 'matchup_field_goals_attempted',
                                             'matchup_three_pointers_made', 'matchup_three_pointers_attempted', 'player_points')]
                if any(value is None for value in core):
                    raise ValueError('Faltan estadísticas de la marca')
                made, attempts, made3, attempts3, _ = core
                if made3 > made or attempts3 > attempts or made - made3 > attempts - attempts3:
                    raise ValueError('Dobles y triples incompatibles con los tiros de campo')
                name = ' '.join(str(item.get(k) or (target or {}).get(k) or '').strip() for k in ('firstName', 'familyName')).strip()
                if not name:
                    raise ValueError('Defensor sin nombre')
                clock = str(stat.get('matchupMinutes') or '')
                row = {'game_id': game['id'], 'game_date': game['date'], 'season': game['season'], 'season_type': PHASES[game['id'][:3]],
                       'offensive_player_id': pid, 'defensive_player_id': defender, 'offensive_team_abbr': own, 'defensive_team_abbr': opposing,
                       'defensive_player_name': name[:120], 'defensive_position': (target or {}).get('position') or '',
                       'matchup_minutes': clock if re.fullmatch(r'\d{1,2}:[0-5]\d', clock) else None, **values}
                ident = (pid, defender)
                if ident in rows and rows[ident] != row:
                    raise ValueError('Marcas repetidas con datos contradictorios')
                rows[ident] = row
    if {r['offensive_team_abbr'] for r in rows.values()} != game['teams']:
        raise ValueError('La NBA no devolvió marcas verificables de ambos equipos')
    return list(rows.values())


def download(game):
    request = urllib.request.Request(URL + game['id'], headers={
        'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json',
        'Referer': 'https://www.nba.com/', 'Origin': 'https://www.nba.com',
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read(MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        raise ValueError('Respuesta demasiado grande')
    return parse(json.loads(raw), game)


def connect(path, readonly=False):
    db = sqlite3.connect(path.resolve().as_uri() + ('?mode=ro' if readonly else ''), uri=True, timeout=20)
    if not readonly:
        db.executescript('''
          CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, date TEXT NOT NULL, season TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS matchups (
            game_id TEXT NOT NULL, season TEXT NOT NULL, attacker INTEGER NOT NULL, defender INTEGER NOT NULL, body TEXT NOT NULL,
            PRIMARY KEY(game_id,attacker,defender));
          CREATE INDEX IF NOT EXISTS matchups_by_player ON matchups(attacker,season);
        ''')
    return db


def store_game(db, game, rows):
    with db:
        stored = db.execute('INSERT OR IGNORE INTO games VALUES (?,?,?)', (game['id'], game['date'], game['season']))
        if not stored.rowcount:
            if db.execute('SELECT date,season FROM games WHERE id=?', (game['id'],)).fetchone() != (game['date'], game['season']):
                raise ValueError('El partido local ya existe con otra fecha o temporada')
            return False
        db.executemany('INSERT INTO matchups VALUES (?,?,?,?,?)', (
            (r['game_id'], r['season'], r['offensive_player_id'], r['defensive_player_id'], json.dumps(r, ensure_ascii=False)) for r in rows))
    return True


def import_seed(source, db_path, before):
    if source.stat().st_size > MAX_BODY:
        raise ValueError('Muestra demasiado grande')
    games = json.loads(source.read_bytes())
    if not isinstance(games, list) or not 1 <= len(games) <= 20:
        raise ValueError('Formato de muestra inválido')
    known = set()
    for g in games:
        gid, season, day, teams, rows = g['id'], g['season'], g['date'], set(g['teams']), g['rows']
        when = date.fromisoformat(day)
        if (game_id(gid) != gid or gid in known or when.isoformat() != day or day >= before
                or season != seasons(when)[0] or gid[3:5] != season[2:4]
                or len(teams) != 2 or not teams <= TEAMS or not isinstance(rows, list) or not 1 <= len(rows) <= 1200):
            raise ValueError('Partido de la muestra inválido')
        known.add(gid)
        covered, identities = set(), set()
        for r in rows:
            pid, did = positive_id(r['offensive_player_id']), positive_id(r['defensive_player_id'])
            own, rival = r['offensive_team_abbr'], r['defensive_team_abbr']
            if ((r['game_id'], r['game_date'], r['season'], r['season_type']) != (gid, day, season, PHASES[gid[:3]])
                    or {own, rival} != teams or own == rival or pid == did or (pid,did) in identities
                    or not (number(r['partial_possessions']) or number(r['matchup_minutes_sort']))):
                raise ValueError('Identidad inválida en la muestra')
            identities.add((pid,did))
            covered.add(own)
        if covered != teams:
            raise ValueError('La muestra no cubre ambos equipos')
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect(db_path)) as db:
        return sum(store_game(db, g, g['rows']) for g in games), len(games)


def local_games(path):
    if not path.is_file():
        return set(), {}
    with closing(connect(path, readonly=True)) as db:
        staged = {x[0] for x in db.execute('SELECT id FROM games')}
        covered = defaultdict(set)
        for gid, attacker in db.execute('SELECT DISTINCT game_id,attacker FROM matchups'):
            covered[gid].add(attacker)
        return staged, covered


def integrate(path, directory, manifest, load_part, save_part, identity):
    """Añade solo pares nuevos y completa campos vacíos de pares ya archivados."""
    if not path.is_file():
        return 0
    changed = 0
    with closing(connect(path, readonly=True)) as db:
        db.execute('BEGIN')
        groups = db.execute('SELECT DISTINCT attacker,season FROM matchups ORDER BY attacker,season')
        for attacker, season in groups:
            if positive_id(attacker) != attacker or not valid_season(season):
                raise ValueError('Clave de marca local inválida')
            name = f'matchups/{attacker}/{season}'
            old = load_part(directory, manifest['parts'][name]) if name in manifest['parts'] else []
            found = {identity('matchups', row): row for row in old}
            if len(found) != len(old):
                raise ValueError('Marcas duplicadas en el archivo: ' + name)
            dirty = False
            for (body,) in db.execute('SELECT body FROM matchups WHERE attacker=? AND season=?', (attacker, season)):
                row = json.loads(body)
                if row['offensive_player_id'] != attacker or row['season'] != season or not game_id(row['game_id']):
                    raise ValueError('Fila local no coincide con su grupo')
                ident = identity('matchups', row)
                original = found.get(ident, {})
                if original and (str(original.get('game_date') or '')[:10] != row['game_date'] or
                                 any(original.get(field) not in (None, '', row[field]) for field in ('offensive_team_abbr', 'defensive_team_abbr'))):
                    raise ValueError('Identidad contradictoria en ' + name)
                merged = {**row, **{k: v for k, v in original.items() if v is not None and v != ''}}
                if original != merged:
                    found[ident] = merged
                    changed += 1
                    dirty = True
            if dirty:
                manifest['parts'][name] = save_part(directory, name, [r for _, r in sorted(found.items())])
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('plan', 'download', 'import-seed'))
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--season', action='append')
    parser.add_argument('--seed', type=Path)
    parser.add_argument('--calendar', type=Path, help='Índice oficial de partidos finalizados; solo para la liga completa')
    parser.add_argument('--before', type=date.fromisoformat)
    parser.add_argument('--player', type=positive_id)
    parser.add_argument('--opponent', choices=sorted(TEAMS))
    parser.add_argument('--limit', type=int, default=25)
    parser.add_argument('--delay', type=float, default=1.5)
    args = parser.parse_args()
    today = datetime.now(ZoneInfo('America/Buenos_Aires')).date()
    before = args.before or today
    wanted = list(dict.fromkeys(args.season or seasons(before)))
    if not 1 <= len(wanted) <= 4 or any(not valid_season(s) for s in wanted):
        parser.error('Indicá de una a cuatro temporadas válidas.')
    if not 1 <= args.limit <= 5000 or not 1 <= args.delay <= 60 or before > today + timedelta(days=1):
        parser.error('Límite, pausa o fecha fuera de rango.')
    if args.calendar and (args.player or args.opponent):
        parser.error('El calendario de liga no se usa con --player ni --opponent.')
    state = args.project / 'maintenance-state'
    db_path = state / FILENAME
    if args.action == 'import-seed':
        if not args.seed:
            parser.error('Indicá --seed con la muestra descargada.')
        try:
            new, total = import_seed(args.seed, db_path, before.isoformat())
        except (OSError, sqlite3.Error, ValueError, KeyError, TypeError) as error:
            parser.exit(1, f'Muestra no importada: {error}\n')
        print(f'{new}/{total} partidos nuevos en SQLite local. El resto ya estaba descargado.')
        return 0
    try:
        archive_id, games, conflicts = plan(state / 'archive', set(wanted), before.isoformat(), args.player, args.opponent, args.calendar)
        done, local = local_games(db_path)
    except (OSError, sqlite3.Error, ValueError, KeyError) as error:
        parser.exit(1, f'No se pudo leer el archivo local: {error}\n')
    waiting = [g for g in games if (g.get('unverified_roster') or set(g['expected']) - g.get('archived', set())) and g['id'] not in done]
    report = {}
    for s in wanted:
        sample = [g for g in games if g['season'] == s]
        report[s] = dict(games=len(sample), games_without_verifiable_roster=sum(g.get('unverified_roster', False) for g in sample), player_games=sum(len(g['expected']) for g in sample),
                         archived=sum(len(g.get('archived', set())) for g in sample),
                         staged_missing_from_archive=sum(len((set(g['expected']) - g.get('archived', set())) & local.get(g['id'], set())) for g in sample),
                         pending_games=sum(g['season'] == s for g in waiting),
                         still_missing_after_download=sum(len(set(g['expected']) - g.get('archived', set()) - local.get(g['id'], set())) for g in sample if g['id'] in done))
    output = {'archive': archive_id, 'season_coverage': report, 'conflicting_games': conflicts,
              'pending_examples': [{k: g[k] for k in ('id', 'date', 'season')} for g in waiting[:20]]}
    if args.player is not None:
        output['player_game_examples'] = [
            dict(id=g['id'], date=g['date'], season=g['season'], teams=sorted(g['teams']),
                 state='archivado' if args.player in g.get('archived', set()) else
                 'descargado' if args.player in local.get(g['id'], set()) else
                 'sin marca en la respuesta NBA' if g['id'] in done else 'pendiente')
            for g in games[:30]
        ]
    print(json.dumps(output, ensure_ascii=False, indent=2), flush=True)
    if args.action == 'plan' or not waiting:
        return 0
    failures = Counter()
    with closing(connect(db_path)) as db:
        for i, g in enumerate(waiting[:args.limit]):
            if i:
                time.sleep(args.delay)
            try:
                rows = download(g)
                store_game(db, g, rows)
                missing = len(set(g['expected']) - {r['offensive_player_id'] for r in rows} - g.get('archived', set()))
                print(f"{g['id']} · {g['date']}: {len(rows)} marcas guardadas, {missing} jugadores esperados siguen sin fila", flush=True)
                failures['consecutive'] = 0
            except urllib.error.HTTPError as error:
                print(f"{g['id']}: NBA HTTP {error.code}; queda pendiente.", flush=True)
                if error.code in (401, 403, 429):
                    return 1
                failures.update(('consecutive', 'total'))
            except (ValueError, KeyError, TypeError, OSError) as error:
                print(f"{g['id']}: sin descarga verificable ({type(error).__name__}); queda pendiente.", flush=True)
                failures.update(('consecutive', 'total'))
            if failures['consecutive'] >= 3:
                print('Tres fallas seguidas. Se guardó el avance; volvé a ejecutar más tarde.')
                break
    print('Las descargas válidas quedaron en SQLite local. El próximo exportador de archivo las integra.')
    return int(bool(failures['total']))


if __name__ == '__main__':
    raise SystemExit(main())
