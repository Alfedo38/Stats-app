"""Defensa por posición, calculada sólo con los objetos deportivos locales.

No descarga datos NBA ni consulta o escribe tablas. archive.summaries publica
estas partes con el mismo índice verificado que los demás datos históricos.
"""
from __future__ import annotations
import json
import math
import re
from collections import defaultdict
from datetime import date

TEAMS = set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split())
METRICS = ('pts', 'reb', 'ast', 'fg3m', 'fga', 'fg3a', 'fta', 'fgm', 'ftm', 'oreb', 'dreb', 'stl', 'blk', 'tov', 'pf')
GROUPS = ('ALL', 'G', 'F', 'C')

def number(value):
    if isinstance(value, bool) or value is None or not isinstance(value, (str, int, float)):
        return None
    try:
        if isinstance(value, str) and not re.fullmatch(r'\d+(?:\.\d+)?', value.strip()):
            return None
        n = float(value)
        return n if math.isfinite(n) and n >= 0 else None
    except (ValueError, TypeError):
        return None

def minutes(row):
    for key in ('min_clean', 'minutes_clean', 'min_decimal', 'minutes_decimal', 'minutes', 'min', 'min_text', 'minutes_played'):
        value = row.get(key)
        if value is None or value == '':
            continue
        if isinstance(value, str) and ':' in value:
            if not re.fullmatch(r'\d+:\d{1,2}(?:\.\d+)?', value.strip()):
                return None
            m, s = map(float, value.split(':'))
            return m + s / 60 if s < 60 else None
        return number(value)
    return None

def position_group(raw):
    raw = str(raw or '').strip().upper()
    words = {'PG': 'G', 'SG': 'G', 'SF': 'F', 'PF': 'F', 'GUARD': 'G', 'FORWARD': 'F', 'CENTER': 'C', 'CENTRE': 'C', 'POINT GUARD': 'G', 'SHOOTING GUARD': 'G', 'SMALL FORWARD': 'F', 'POWER FORWARD': 'F'}
    if raw in words:
        return words[raw]
    parts = re.split(r'[-/]', raw)
    mapped = [words.get(p.strip(), p.strip() if p.strip() in ('G', 'F', 'C') else None) for p in parts]
    return mapped[0] if 1 <= len(mapped) <= 2 and all(mapped) else None

def game_id(value):
    raw = str(value or '').strip()
    return str(int(raw)) if re.fullmatch(r'\d{1,10}', raw) and int(raw) > 0 else None

def phase(row, gid):
    raw = str(row.get('season_type') or row.get('seasonType') or row.get('game_type') or '').lower().strip()
    if raw in ('regular season', 'regular', 'rs', 'temporada regular'):
        return 'Regular Season'
    if raw in ('playoffs', 'playoff', 'postseason'):
        return 'Playoffs'
    if raw:
        return None
    return {'002': 'Regular Season', '004': 'Playoffs'}.get(gid.zfill(10)[:3])

def normalize(row, positions):
    gid = game_id(row.get('game_id'))
    pid = game_id(row.get('player_id'))
    raw_date = str(row.get('game_date') or '')[:10]
    try:
        day = date.fromisoformat(raw_date)
    except ValueError:
        return None
    if not gid or not pid or str(row.get('period_scope') or 'FULL').upper() not in ('FULL', 'FULL_GAME'):
        return None
    season_type = phase(row, gid)
    if not season_type:
        return None
    team = str(row.get('team_abbreviation') or '').strip().upper()
    opponent = str(row.get('opponent_abbr') or row.get('opponent_clean') or row.get('opponent') or '').strip().upper()
    matchup = str(row.get('matchup_clean') or row.get('matchup') or '').upper()
    if opponent not in TEAMS:
        found = re.findall(r'\b(?:' + '|'.join(sorted(TEAMS)) + r')\b', matchup)
        choices = set(found) - {team}
        opponent = next(iter(choices)) if len(choices) == 1 else ''
    if team not in TEAMS or opponent not in TEAMS or team == opponent:
        return None
    played = minutes(row)
    if played is None or played <= 0 or played > 80:
        return None
    venue = str(row.get('home_away_clean') or row.get('home_away') or '').upper()
    if venue not in ('HOME', 'AWAY'):
        venue = 'AWAY' if '@' in matchup else 'HOME' if re.search(r'\bVS\.?\s', matchup) else None
    y = day.year - (day.month < 10)
    # La fecha y el ID de temporada oficial deben concordar cuando ambos existen.
    season = f'{y}-{str(y + 1)[-2:]}'
    declared = str(row.get('season_year') or row.get('season') or row.get('season_id') or '')
    if declared and declared not in (season, str(y), '2' + str(y)):
        return None
    group = position_group(row.get('position') or row.get('player_position') or positions.get(pid))
    aliases = {'fg3m': 'threepm', 'fg3a': 'threepa', 'tov': 'to'}
    values = {k: number(row.get(k) if row.get(k) is not None else row.get(aliases.get(k, k))) for k in METRICS}
    # Una pareja imposible queda sin dato, nunca se transforma en cero.
    for made, attempted in (('fgm', 'fga'), ('fg3m', 'fg3a'), ('ftm', 'fta')):
        if values[made] is not None and values[attempted] is not None and values[made] > values[attempted]:
            values[made] = values[attempted] = None
    return dict(id=gid, playerId=int(pid), name=str(row.get('player_name') or 'Jugador'), date=str(day), season=season, phase=season_type,
                team=team, opponent=opponent, venue=venue, position=group, minutes=round(played, 3), values=values)

def usage_pct(row):
    value = number(row.get('usage_pct', row.get('usg_pct')))
    if value is None or value > 100:
        return None
    return value * 100 if value <= 1 else value

def shot_zone(row):
    return {'Restricted Area': 0, 'In The Paint (Non-RA)': 1, 'Mid-Range': 2,
            'Left Corner 3': 3, 'Right Corner 3': 3, 'Above the Break 3': 3}.get(row.get('shot_zone_basic'))

def build(rows, positions, shot_games=None):
    unique, conflicts = {}, set()
    diagnostics = {'invalidRows': 0, 'conflictingPlayerGames': 0, 'incompleteTeamGames': 0, 'unknownPositions': 0}
    shot_games = shot_games or {}
    for row in rows:
        r = normalize(row, positions)
        if r is None:
            diagnostics['invalidRows'] += 1
            continue
        key = (r['id'], r['playerId'])
        r['usage'] = usage_pct(row)
        if key in unique and unique[key] != r:
            conflicts.add(key)
        else:
            unique[key] = r
    diagnostics['conflictingPlayerGames'] = len(conflicts)
    groups, identities = defaultdict(list), defaultdict(set)
    for key, r in unique.items():
        if key not in conflicts:
            groups[(r['season'], r['id'], r['team'])].append(r)
            identities[r['id']].add((r['date'], r['season'], r['phase'], tuple(sorted((r['team'], r['opponent'])))))
    games, players, baseline, pending = defaultdict(list), defaultdict(list), {}, {}
    combos = {'pra': ('pts', 'reb', 'ast'), 'pr': ('pts', 'reb'), 'pa': ('pts', 'ast'), 'ra': ('reb', 'ast')}
    all_metrics = METRICS + tuple(combos) + ('usage', 'minutes')
    prior_zones = defaultdict(lambda: [0, 0, 0, 0, 0])
    # El promedio de cada jugador se calcula antes de incorporar ese partido.
    ordered = sorted((r for k, r in unique.items() if k not in conflicts), key=lambda r: (r['date'], int(r['id']), r['playerId']))
    for r in ordered:
        if len(identities[r['id']]) != 1:
            continue
        k = (r['season'], r['phase'], r['playerId'])
        prior = baseline.setdefault(k, {m: [0.0, 0] for m in all_metrics})
        previous = pending.get(k)
        if previous and previous['date'] != r['date']:
            for values, zones in previous['rows']:
                if zones and sum(zones):
                    for index, count in enumerate(zones):
                        prior_zones[k][index] += count
                    prior_zones[k][4] += 1
                for m in all_metrics:
                    if values[m] is not None:
                        prior[m][0] += values[m]
                        prior[m][1] += 1
            pending.pop(k)
        r['baseline'] = {m: prior[m][0] / prior[m][1] if prior[m][1] else None for m in all_metrics}
        z = prior_zones[k]
        r['priorZones'] = list(z) if z[4] >= 5 and sum(z[:4]) >= 30 else None
        r['priorGames'] = prior['minutes'][1]
        r['usageGames'] = prior['usage'][1]
        values = dict(r['values'], usage=r.pop('usage'), minutes=r['minutes'])
        for m, fields in combos.items():
            parts = [values[f] for f in fields]
            values[m] = sum(parts) if all(v is not None for v in parts) else None
        pending.setdefault(k, {'date': r['date'], 'rows': []})['rows'].append((values, shot_games.get((r['id'],r['playerId']))))
        players[(r['season'], r['opponent'])].append(r)
    for (season, gid, _), roster in sorted(groups.items()):
        if len(identities[gid]) != 1:
            diagnostics['incompleteTeamGames'] += 1
            continue
        total_minutes = sum(r['minutes'] for r in roster)
        # 5 jugadores x 48 minutos, más prórrogas de 5 minutos. Tolerancia al redondeo.
        overtime = round((total_minutes - 240) / 25)
        if not 5 <= len(roster) <= 30 or not 0 <= overtime <= 8 or abs(total_minutes - (240 + 25 * overtime)) > 2:
            diagnostics['incompleteTeamGames'] += 1
            continue
        first = roster[0]
        unknown = sum(r['position'] is None for r in roster)
        diagnostics['unknownPositions'] += unknown
        values = {}
        for group in GROUPS:
            chosen = roster if group == 'ALL' else [r for r in roster if r['position'] == group]
            values[group] = {m: round(sum(r['values'][m] for r in chosen), 5)
                            if (group == 'ALL' or unknown == 0) and all(r['values'][m] is not None for r in chosen) else None
                            for m in METRICS}
        games[season].append(dict(id=gid, date=first['date'], season=season, phase=first['phase'], team=first['opponent'],
                                 venue='HOME' if first['venue'] == 'AWAY' else 'AWAY' if first['venue'] == 'HOME' else None,
                                 unknownPositions=unknown, groups=values))
    return games, players, diagnostics

def archive_parts(directory, manifest, positions, load_part, save_part):
    def facts():
        for name, meta in sorted(list(manifest['parts'].items())):
            if name.startswith('facts/'):
                yield from load_part(directory, meta)
    shots = {}
    for name, meta in manifest['parts'].items():
        if not name.startswith('shots/'):
            continue
        parts = name.split('/')
        if len(parts) != 3 or not parts[1].isdigit():
            continue
        pid = int(parts[1])
        seen = set()
        for row in load_part(directory, meta):
            gid, zone, event = game_id(row.get('game_id')), shot_zone(row), row.get('game_event_id')
            if not gid or zone is None or event is None or row.get('shot_attempted_flag') != 1 or (gid,event) in seen:
                continue
            seen.add((gid,event))
            shots.setdefault((gid,pid),[0,0,0,0])[zone] += 1
    games, players, diagnostics = build(facts(), positions, shots)
    source = 'Archivo NBA verificado · boxscores de partido completo'
    for name in list(manifest['parts']):
        if name.startswith(('defense/', 'defense-players/')):
            del manifest['parts'][name]
    for season, items in sorted(games.items()):
        payload = {'format': 1, 'season': season, 'scope': 'FULL', 'source': source,
                   'positionSource': 'Posición de la fila o referencia del catálogo NBA; no reconstruye el rol histórico',
                   'through': max(r['date'] for r in items), 'games': sorted(items, key=lambda r: (r['date'], int(r['id']), r['team'])),
                   'diagnostics': diagnostics}
        name = 'defense/' + season
        manifest['parts'][name] = save_part(directory, name, payload)
        for (s, team), rows in sorted(players.items()):
            if s != season:
                continue
            name = 'defense-players/' + season + '/' + team
            manifest['parts'][name] = save_part(directory, name, sorted(rows, key=lambda r: (r['date'], int(r['id']), r['playerId'])))
    print('DEFENSAS LOCALES: ' + json.dumps({'seasons': sorted(games), 'team_games': sum(map(len, games.values())), **diagnostics}), flush=True)

def main():
    from .common import STATE
    path = STATE / 'archive' / 'manifest.json'
    manifest = json.loads(path.read_text())
    from .archive import load_part
    for name, meta in sorted(manifest['parts'].items()):
        if name.startswith('defense/'):
            data = load_part(path.parent, meta)
            print(json.dumps({'season': data['season'], 'through': data['through'], 'team_games': len(data['games']), 'diagnostics': data['diagnostics']}, ensure_ascii=False))

if __name__ == '__main__':
    main()
