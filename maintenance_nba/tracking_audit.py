"""Revisión local del tracking del archivo. Sin red, base de datos ni lectura de .env."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import math
from datetime import date
from pathlib import Path


def numeric(value):
    if isinstance(value, bool) or value is None or not isinstance(value, (int, float, str)):
        return None
    try:
        number = float(value)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(number) or number < 0:
        return None
    return int(number) if number.is_integer() else number


def review(rows, player_id, as_of, archive_id=None):
    day = date.fromisoformat(as_of)
    year = day.year - (day.month < 10)
    start = f'{year-1}-10-01'
    allowed = [f'{year}-{str(year+1)[-2:]}', f'{year-1}-{str(year)[-2:]}']
    result, issues, seen = [], [], set()
    for row in rows:
        if str(row.get('player_id')) != str(player_id):
            issues.append({'code': 'PLAYER_MISMATCH'})
            continue
        game_day = str(row.get('game_date', ''))[:10]
        try:
            date.fromisoformat(game_day)
        except ValueError:
            issues.append({'code': 'INVALID_DATE'})
            continue
        raw_id = str(row.get('game_id', ''))
        key = raw_id.lstrip('0') if raw_id.isdigit() else ''
        if not key:
            issues.append({'code': 'INVALID_GAME_ID'})
            continue
        if key in seen:
            issues.append({'code': 'DUPLICATE_GAME', 'game_id': raw_id})
            continue
        seen.add(key)
        phase = str(row.get('season_type', '')).lower()
        official = phase in ('regular season', 'playoffs') or not phase and raw_id.zfill(10)[:3] in ('002', '004')
        ast, potential = numeric(row.get('ast')), numeric(row.get('potential_ast'))
        reb, chances = numeric(row.get('reb')), numeric(row.get('rebound_chances'))
        item = {'game_id': raw_id, 'date': game_day, 'team': row.get('team_abbreviation'),
                'opponent': row.get('opponent_clean') or row.get('opponent_abbr') or row.get('opponent'),
                'ast': ast, 'potential_ast': potential, 'reb': reb, 'rebound_chances': chances,
                'eligible': start <= game_day < as_of and official, 'flags': []}
        if ast is not None and potential is not None and potential < ast:
            item['flags'].append('POTENTIAL_BELOW_AST')
        if reb is not None and chances is not None and chances < reb:
            item['flags'].append('CHANCES_BELOW_REB')
        if potential is None:
            item['flags'].append('POTENTIAL_MISSING')
        if potential is not None and potential >= 40:
            item['flags'].append('UNUSUAL_POTENTIAL_REVIEW_SOURCE')
        result.append(item)
    result.sort(key=lambda row: (row['date'], row['game_id']), reverse=True)
    eligible = [row for row in result if row['eligible']]
    return {'format': 1, 'archiveId': archive_id, 'playerId': player_id, 'asOfDate': as_of,
            'seasons': allowed, 'window': 20, 'eligibleGames': len(eligible),
            'games': eligible[:20], 'flaggedGames': [row for row in result if row['flags']][:30],
            'issues': issues[:30], 'network': False, 'database': False,
            'note': 'UNUSUAL indica revisión, no un dato demostrado incorrecto. No se modificaron valores.'}


def inspect_archive(project, player_id, as_of):
    archive = project / 'maintenance-state/archive'
    manifest = json.loads((archive / 'manifest.json').read_text())
    meta = manifest.get('parts', {}).get(f'facts/{player_id}')
    if not meta:
        raise ValueError('El archivo local no contiene los datos de este jugador.')
    target = (archive / meta['path']).resolve()
    if not target.is_relative_to(archive.resolve()):
        raise ValueError('Ruta inválida en el índice local.')
    compressed = target.read_bytes()
    if hashlib.sha256(compressed).hexdigest() != meta['sha256']:
        raise ValueError('La parte local no coincide con el hash del índice.')
    rows = json.loads(gzip.decompress(compressed))
    if not isinstance(rows, list) or len(rows) != meta['rows']:
        raise ValueError('El conteo local no coincide con el índice.')
    return review(rows, player_id, as_of, manifest.get('id'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--player-id', type=int, required=True)
    parser.add_argument('--as-of', required=True)
    args = parser.parse_args()
    try:
        if args.player_id <= 0:
            raise ValueError('ID inválido.')
        date.fromisoformat(args.as_of)
        project = args.project.expanduser().resolve()
        result = inspect_archive(project, args.player_id, args.as_of)
        output = project / f'maintenance-state/qa/tracking-{args.player_id}-{args.as_of}.json'
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        output.chmod(0o600)
        print(f'Informe: {output}')
        print(f"Muestra: {len(result['games'])}/20; temporadas: {' + '.join(result['seasons'])}")
        print(f"Partidos señalados para revisar: {len(result['flaggedGames'])}")
    except (OSError, ValueError, KeyError, TypeError):
        print('ERROR: no se pudo revisar el archivo local. Comprobá ID, fecha e integridad del archivo. No se modificaron datos.')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
