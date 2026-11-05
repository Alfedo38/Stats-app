"""Auditoría de cobertura del archivo NBA local. Sin red, SQL ni cambios a los datos."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date
import gzip
import hashlib
import json
from pathlib import Path
import re

from .tracking_audit import numeric


def gid(value):
    raw = str(value or '')
    return str(int(raw)) if re.fullmatch(r'\d{1,10}', raw) and int(raw) else None


def run(directory, season, through):
    directory = directory.resolve()
    index = json.loads((directory / 'manifest.json').read_text())
    parts = index['parts']

    def load(key):
        meta = parts[key]
        source = (directory / meta['path']).resolve()
        if not source.is_relative_to(directory) or source.stat().st_size != meta['bytes'] or meta['bytes'] > 49_000_000:
            raise ValueError(f'Parte fuera de límites: {key}')
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != meta['sha256']:
            raise ValueError(f'Hash incorrecto: {key}')
        decoded = json.loads(gzip.decompress(data))
        if len(decoded) != meta['rows']:
            raise ValueError(f'Conteo incorrecto: {key}')
        return decoded

    tracking = defaultdict(Counter)
    candidates = defaultdict(Counter)
    anomaly_examples = []
    missing_examples = defaultdict(list)
    game_teams = {}
    by_type = {kind: set() for kind in ('shots', 'matchups')}
    for kind, keys in by_type.items():
        for key in parts:
            if key.startswith(kind + '/') and key.endswith('/' + season):
                player = key.split('/')[1]
                for row in load(key):
                    game = gid(row.get('game_id'))
                    if game:
                        keys.add((player, game))

    lower = season[:4] + '-10-01'
    for key in parts:
        if not key.startswith('facts/'):
            continue
        player = key.split('/')[1]
        seen = set()
        for row in load(key):
            day = str(row.get('game_date') or '')[:10]
            game = gid(row.get('game_id'))
            phase = {'002': 'Regular Season', '004': 'Playoffs'}.get(str(row.get('game_id') or '').zfill(10)[:3])
            if not lower <= day <= through or str(row.get('period_scope') or 'FULL') not in ('FULL', 'FULL_GAME') or not game or not phase or game in seen:
                continue
            seen.add(game)
            team = str(row.get('team_abbreviation') or '')
            if re.fullmatch(r'[A-Z]{2,3}', team):
                game_teams[(game, team)] = day
            current = tracking[phase]
            current['player_games'] += 1
            entry = {'date': day, 'game_id': game.zfill(10), 'player_id': player, 'team': team}
            for metric, actual in (('potential_ast', 'ast'), ('rebound_chances', 'reb'), ('touches', None), ('usage_pct', None)):
                value = numeric(row.get(metric))
                made = numeric(row.get(actual)) if actual else None
                reason = 'missing' if value is None else 'review' if (metric == 'potential_ast' and value >= 40 or made is not None and value < made) else 'valid'
                current[f'{metric}_{reason}'] += 1
                if reason != 'valid':
                    candidates[metric][day] += 1
                    if reason == 'review' and len(anomaly_examples) < 80:
                        anomaly_examples.append(dict(entry, metric=metric, value=value, actual=made))
                    if reason == 'missing' and len(missing_examples[metric]) < 25:
                        missing_examples[metric].append(entry)
            for kind, keys in by_type.items():
                current[f'{kind}_with_rows'] += (player, game) in keys

    defense_key = f'defense/{season}'
    defense = load(defense_key) if defense_key in parts else None
    covered = {}
    if defense is not None:
        for row in defense['games']:
            if str(row.get('date') or '') <= through and gid(row.get('id')):
                covered[(gid(row['id']), row.get('team'))] = row
    missing_teams = sorted(({'game_id': game.zfill(10), 'team': team, 'date': day} for (game, team), day in game_teams.items() if (game, team) not in covered), key=lambda r:(r['date'],r['game_id'],r['team']))
    return {'archive_id':index['id'], 'season':season, 'through':through, 'tracking':tracking,
            'candidate_dates':{m:dict(sorted(days.items())) for m,days in candidates.items()},
            'review_examples':anomaly_examples,'missing_examples':missing_examples,
            'defense':{'snapshot_present':defense is not None,'team_games_in_facts':len(game_teams),
                       'team_games_missing':len(missing_teams),'missing_examples':missing_teams[-80:],
                       'team_games_with_unknown_positions':sum(bool(r.get('unknownPositions')) for r in covered.values())},
            'notes':['Cobertura respecto de box scores locales, no respecto del calendario oficial.',
                     'Sin filas de tiros o marcas puede ser legítimo: verificar por partido antes de descargar.',
                     'No se verificaron cuotas, partes médicos, rotaciones ni la producción remota.']}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    p.add_argument('--season', required=True)
    p.add_argument('--through', required=True)
    a = p.parse_args()
    if not re.fullmatch(r'20\d{2}-\d{2}', a.season) or int(a.season[-2:]) != (int(a.season[:4])+1) % 100:
        p.error('Temporada inválida; usá AAAA-AA.')
    start_year = int(a.season[:4])
    try:
        day = date.fromisoformat(a.through)
        if not date(start_year, 10, 1) <= day < date(start_year + 1, 10, 1):
            raise ValueError('El corte debe caer dentro de la temporada elegida.')
        report = run(a.project / 'maintenance-state' / 'archive', a.season, day.isoformat())
        out = a.project / 'maintenance-state' / 'qa' / f'cobertura-nba-{a.season}-{day.isoformat()}.json'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(f'Informe: {out}')
        print(json.dumps({'tracking':report['tracking'],'defensa_faltante':report['defense']['team_games_missing']}, ensure_ascii=False))
    except (OSError, ValueError, KeyError) as e:
        p.exit(1, f'No se pudo auditar: {e}\n')


if __name__ == '__main__':
    main()
