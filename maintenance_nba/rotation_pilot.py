"""Piloto local: reconstruye rotaciones de partidos NBA finalizados, sin SQL ni publicación."""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
import gzip
import hashlib
from itertools import combinations
import json
import os
from pathlib import Path
import re
import tempfile
import time
import unicodedata
import urllib.request
from zoneinfo import ZoneInfo

TEAMS = ('BOS', 'LAL')
IDS = re.compile(r'00[24]\d{7}\Z')
TIME = re.compile(r'PT(?:(\d+)M)?(?:(\d+(?:\.\d{1,3})?)S)?\Z')
MAX_BODY = 4_000_000
TOLERANCE_MS = 1000
SOURCE = 'NBA jugada a jugada + box score oficial'


class Unverified(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise Unverified(reason)


def ms(value):
    m = TIME.fullmatch(str(value))
    require(m and any(m.groups()) and (not m[2] or Decimal(m[2]) < 60), 'RELOJ_INVALIDO')
    return int(60_000 * int(m[1] or 0) + 1000 * Decimal(m[2] or '0'))


def number(value):
    require(re.fullmatch(r'[1-9]\d{0,9}', str(value)), 'IDENTIDAD_INVALIDA')
    return int(value)


def canonical_id(raw):
    raw = str(raw)
    require(raw.isdigit() and len(raw) <= 10 and IDS.fullmatch(raw.zfill(10)), 'PARTIDO_INVALIDO')
    return raw.zfill(10)


def period_length(p):
    return 720_000 if p <= 4 else 300_000


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as f:
        tmp = Path(f.name)
        try:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
            f.flush()
            os.replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)


def roster(raw):
    people = {}
    for p in raw['players']:
        pid = number(p['personId'])
        require(pid not in people and str(p.get('starter')) in ('0','1') and str(p.get('played')) in ('0','1'), 'PLANTEL_INVALIDO')
        played = str(p['played']) == '1'
        clock = p['statistics'].get('minutes')
        mins = ms(clock) if clock else None
        starter = str(p['starter']) == '1'
        require((played and mins is not None) or (not played and not starter and not mins), 'MINUTOS_INVALIDOS')
        people[pid] = {'name':str(p.get('name') or f'Jugador {pid}')[:100], 'starter':starter, 'played':played, 'box':mins or 0}
    require(5 <= len(people) <= 25 and sum(p['starter'] for p in people.values()) == 5, 'QUINTETO_INICIAL_INVALIDO')
    return people


def period_candidates(events, people, period):
    duration = period_length(period)
    required, forbidden, seen, grouped = set(), set(), set(), defaultdict(list)
    for at, op, pid in events:
        if op == 'actor':
            if pid not in seen:
                required.add(pid)
        else:
            if pid not in seen:
                (required if op == 'out' else forbidden).add(pid)
                seen.add(pid)
        grouped[at].append((op,pid))
    if period == 1:
        starts = [tuple(pid for pid, p in people.items() if p['starter'])]
    else:
        possible = sorted(pid for pid, p in people.items() if p['played'] and pid not in required | forbidden)
        require(len(required) <= 5 and required.isdisjoint(forbidden), 'ROL_DE_PERIODO_CONTRADICTORIO')
        starts = (tuple(sorted(required | set(extra))) for extra in combinations(possible, 5 - len(required)))
    results = {}
    for i, initial in enumerate(starts):
        require(i < 3000, 'DEMASIADOS_QUINTETOS_POSIBLES')
        live, segments, last, valid = set(initial), [], 0, True
        for at, group in sorted(grouped.items()):
            if at > last:
                segments.append((last,at,tuple(sorted(live))))
            # En un mismo reloj pueden entrar/salir varios jugadores. No se crean tramos de cero segundos.
            before = live.copy()
            touched = set()
            for op,pid in group:
                if op == 'actor':
                    continue
                if (pid in live) != (op == 'out'):
                    valid = False
                    break
                if op == 'out':
                    live.remove(pid)
                else:
                    live.add(pid)
                touched.add(pid)
            if not valid or len(live) != 5 or any(pid not in before | live | touched for op,pid in group if op == 'actor'):
                valid = False
                break
            last = at
        if not valid:
            continue
        if last < duration:
            segments.append((last,duration,tuple(sorted(live))))
        # Los eventos sin cambios no dividen tramos; los finales de período sí.
        combined = []
        for a,b,lineup in segments:
            if combined and combined[-1][2] == lineup:
                combined[-1] = (combined[-1][0],b,lineup)
            else:
                combined.append((a,b,lineup))
        totals = defaultdict(int)
        for a,b,lineup in combined:
            for pid in lineup:
                totals[pid] += b-a
        if all(t <= people[pid]['box'] + TOLERANCE_MS for pid,t in totals.items()):
            results[tuple(combined)] = dict(totals)
    require(bool(results), f'QUINTETO_NO_RECONSTRUIDO_Q{period}')
    return list(results.items())


def solve(periods, people):
    ids = tuple(people)
    targets = tuple(people[i]['box'] for i in ids)
    require(abs(sum(targets) - 5*sum(period_length(i) for i in range(1,len(periods)+1))) <= len(ids)*TOLERANCE_MS, 'MINUTOS_DE_EQUIPO_NO_CONCILIAN')
    options = [[(spans, tuple(m.get(i,0) for i in ids)) for spans,m in p] for p in periods]
    lows, highs = [None]*(len(options)+1), [None]*(len(options)+1)
    lows[-1] = highs[-1] = (0,)*len(ids)
    for i in range(len(options)-1,-1,-1):
        cols = list(zip(*(v for _,v in options[i])))
        lows[i] = tuple(n+min(c) for n,c in zip(lows[i+1],cols))
        highs[i] = tuple(n+max(c) for n,c in zip(highs[i+1],cols))
    solutions, attempts = [], 0

    def walk(i, totals, path):
        nonlocal attempts
        if len(solutions)>1:
            return
        attempts += 1
        require(attempts <= 70_000, 'BUSQUEDA_AMBIGUA')
        if any(t+l > want+TOLERANCE_MS or t+h < want-TOLERANCE_MS
               for t,l,h,want in zip(totals,lows[i],highs[i],targets)):
            return
        if i == len(options):
            solutions.append(path)
            return
        for spans, vector in options[i]:
            walk(i+1, tuple(x+y for x,y in zip(totals,vector)), path+[spans])
            if len(solutions)>1:
                break

    walk(0,(0,)*len(ids),[])
    require(bool(solutions), 'MINUTOS_INDIVIDUALES_NO_CONCILIAN')
    require(len(solutions)==1, 'ROTACION_NO_UNICA')
    return solutions[0]


def reconstruct(game_id, day, box, pbp):
    game_id = canonical_id(game_id)
    date.fromisoformat(day)
    g, live = box['game'], pbp['game']
    require(str(g['gameId']) == game_id and str(live['gameId']) == game_id, 'ID_DE_FUENTE_DISTINTO')
    require(str(g['gameStatus']) == '3', 'PARTIDO_NO_FINALIZADO')
    reported = str(g.get('gameEt') or g.get('gameTimeLocal') or '')[:10]
    require(not reported or reported == day, 'FECHA_DE_FUENTE_DISTINTA')
    final_period = number(g['period'])
    require(4 <= final_period <= 10, 'PERIODOS_INVALIDOS')
    teams = {number(t['teamId']): (t['teamTricode'], roster(t)) for t in (g['homeTeam'],g['awayTeam'])}
    require(len(teams)==2 and len({code for code,_ in teams.values()})==2, 'EQUIPOS_INVALIDOS')
    require(all(re.fullmatch(r'[A-Z]{3}', c) for c,_ in teams.values()), 'EQUIPOS_INVALIDOS')
    first, second = [set(r) for _,r in teams.values()]
    require(first.isdisjoint(second), 'JUGADOR_EN_DOS_EQUIPOS')
    actions = live['actions']
    require(isinstance(actions,list) and 8 <= len(actions) <= 2500, 'JUGADA_A_JUGADA_INCOMPLETO')
    # El orden de la lista es el orden oficial. actionNumber puede repetirse en correcciones.
    order = [number(a['actionId']) for a in actions] if all(a.get('actionId') for a in actions) else []
    require(not order or order == sorted(set(order)), 'ORDEN_DE_JUGADAS_INVALIDO')
    boundaries, events, clocks = defaultdict(list), defaultdict(list), {}
    prior_period=1
    for a in actions:
        period = number(a['period'])
        require(period >= prior_period, 'ORDEN_DE_PERIODOS_INVALIDO')
        prior_period=period
        require(period <= final_period, 'PERIODO_FUERA_DE_RANGO')
        clock = ms(a['clock'])
        require(0 <= clock <= clocks.get(period,period_length(period)), 'RELOJ_NO_MONOTONO')
        clocks[period] = clock
        elapsed = period_length(period) - clock
        typ = str(a.get('actionType') or '').lower()
        sub = str(a.get('subType') or '').lower()
        if typ == 'period' and sub in ('start','end'):
            boundaries[period].append((sub,elapsed))
        elif typ == 'substitution' or typ in ('2pt','3pt','freethrow','rebound'):
            tid = a.get('teamId')
            pid = a.get('personId')
            if typ != 'substitution' and (not pid or str(pid)=='0' or typ=='rebound' and str(pid).isdigit() and int(pid) in teams):
                continue
            tid,pid = number(tid),number(pid)
            require(tid in teams and pid in teams[tid][1] and teams[tid][1][pid]['played'], 'JUGADA_SIN_IDENTIDAD_CONCILIADA')
            require(typ != 'substitution' or sub in ('in','out'), 'SUSTITUCION_SIN_DIRECCION')
            events[tid,period].append((elapsed,sub if typ=='substitution' else 'actor',pid))
    for p in range(1,final_period+1):
        require(boundaries[p] == [('start',0),('end',period_length(p))], f'PERIODO_INCOMPLETO_Q{p}')
    rows, rejected = {}, {}
    for tid,(team,people) in teams.items():
        try:
            timeline = solve([period_candidates(events[tid,p],people,p) for p in range(1,final_period+1)],people)
            spans = defaultdict(list)
            for period,lineups in enumerate(timeline,1):
                for a,b,lineup in lineups:
                    for pid in lineup:
                        own = spans[pid]
                        if own and own[-1][0]==period and own[-1][2]==a:
                            own[-1][2] = b
                        else:
                            own.append([period,a,b])
            for pid,p in people.items():
                own = spans[pid]
                played_ms = sum(b-a for _,a,b in own)
                require(not p['played'] or own or p['box'] == 0, 'JUGADOR_SIN_TRAMOS')
                rows[str(pid)] = {'gameId':game_id,'date':day,'team':team,'starter':p['starter'],
                    'played':p['played'],'boxMs':p['box'],'playedMs':played_ms,
                    'periods':final_period,'spans':own}
        except Unverified as e:
            rejected[team] = str(e)
            rows = {pid:r for pid,r in rows.items() if r['team']!=team}
    return {'gameId':game_id,'date':day,'source':SOURCE,'players':rows,'rejected':rejected,
            'teams':[t[0] for t in teams.values()]}


def archived_games(root, season, before, limit, teams):
    folder = root/'maintenance-state'/'archive'
    manifest = json.loads((folder/'manifest.json').read_text())
    found = {t:{} for t in teams}
    for key, meta in manifest['parts'].items():
        if not key.startswith('facts/'):
            continue
        path = (folder/meta['path']).resolve()
        require(path.is_relative_to(folder.resolve()), 'RUTA_DE_ARCHIVO_INVALIDA')
        data = path.read_bytes()
        require(len(data)==meta['bytes'] and hashlib.sha256(data).hexdigest()==meta['sha256'], 'HASH_DE_ARCHIVO_INVALIDO')
        for r in json.loads(gzip.decompress(data)):
            day = str(r.get('game_date') or '')[:10]
            team = r.get('team_abbreviation') or r.get('team_abbr')
            raw_id = str(r.get('game_id') or '').zfill(10)
            if team in found and IDS.fullmatch(raw_id) and raw_id[3:5]==season[2:4] and day < before and str(r.get('period_scope') or 'FULL')=='FULL':
                old=found[team].get(raw_id)
                require(old is None or old==day, 'FECHA_DE_ARCHIVO_CONTRADICTORIA')
                found[team][raw_id]=day
    return {g:d for t in teams for g,d in sorted(found[t].items(),key=lambda x:(x[1],x[0]),reverse=True)[:limit]}


def name_key(raw):
    return ''.join(c for c in unicodedata.normalize('NFKD',str(raw or '')).lower() if c.isascii() and c.isalnum())


def adapt_stats(game_id, traditional, summary, playbyplay):
    """Stats V3 trae una fila por cambio, con el que entra identificado por nombre."""
    g=traditional['boxScoreTraditional']
    items=[x for x in summary['resultSets'] if x['name']=='GameSummary']
    require(len(items)==1 and len(items[0]['rowSet'])==1, 'RESUMEN_OFICIAL_INCOMPLETO')
    line=dict(zip(items[0]['headers'],items[0]['rowSet'][0]))
    require(str(line['GAME_ID'])==game_id==str(g['gameId'])==str(playbyplay['game']['gameId']), 'ID_DE_FUENTE_DISTINTO')
    require(str(line['GAME_STATUS_ID'])=='3', 'PARTIDO_NO_FINALIZADO')
    box={'gameId':game_id,'gameStatus':3,'period':line['LIVE_PERIOD'],'gameEt':line['GAME_DATE_EST']}
    names={}
    for side in ('homeTeam','awayTeam'):
        team=g[side]
        tid=number(team['teamId'])
        require(tid==number(line['HOME_TEAM_ID' if side=='homeTeam' else 'VISITOR_TEAM_ID']), 'EQUIPOS_DE_FUENTE_DISTINTOS')
        players=[]
        for p in team['players']:
            pid=number(p['personId'])
            full=f"{p.get('firstName','')} {p.get('familyName','')}".strip()
            names[tid,pid]={name_key(v) for v in (full,p.get('familyName'),p.get('nameI')) if v}
            minute=p['statistics']['minutes']
            require(not minute or re.fullmatch(r'\d{1,2}:[0-5]\d(?:\.\d{1,3})?',minute), 'MINUTOS_INVALIDOS')
            if minute:
                m,sec=minute.split(':')
                clock=f'PT{m}M{sec}S'
            else:
                clock=None
            players.append({'personId':pid,'name':full,'starter':int(bool(str(p.get('position') or '').strip())),
                            'played':int(bool(minute)),'statistics':{'minutes':clock}})
        box[side]={'teamId':tid,'teamTricode':team['teamTricode'],'players':players}
    actions=[]
    source=playbyplay['game']['actions']
    require([a['actionId'] for a in source]==sorted({a['actionId'] for a in source}), 'ORDEN_DE_JUGADAS_INVALIDO')
    for a in source:
        c={k:v for k,v in a.items() if k!='actionId'}
        typ=str(a['actionType']).lower()
        if typ=='substitution':
            m=re.fullmatch(r'SUB:\s*(.+?)\s+FOR\s+(.+)',a['description'],flags=re.I)
            tid,out=number(a['teamId']),number(a['personId'])
            require(m and name_key(m[2]) in names.get((tid,out),set()), 'SALIDA_STATS_NO_IDENTIFICADA')
            entrants=[pid for (team,pid),aliases in names.items() if team==tid and pid!=out and name_key(m[1]) in aliases]
            require(len(entrants)==1, 'ENTRADA_STATS_AMBIGUA')
            actions.extend([{**c,'subType':'out'},{**c,'subType':'in','personId':entrants[0]}])
        else:
            c['actionType']={'made shot':'2pt','missed shot':'2pt','free throw':'freethrow'}.get(typ,typ)
            actions.append(c)
    return {'game':box},{'game':{'gameId':game_id,'actions':actions}}


def stats_game(game_id, raw, refresh, offline):
    from importlib import import_module
    payloads=[]
    for endpoint, cls in [('boxscoretraditionalv3','BoxScoreTraditionalV3'),('boxscoresummaryv2','BoxScoreSummaryV2'),('playbyplayv3','PlayByPlayV3')]:
        path=raw/f'{endpoint}_{game_id}.json'
        if path.is_file() and not refresh:
            payloads.append(json.loads(path.read_text()))
            continue
        require(not offline, 'FALTAN_JSON_DE_STATS_EN_RAW')
        try:
            factory=getattr(import_module(f'nba_api.stats.endpoints.{endpoint}'),cls)
            response=factory(game_id=game_id,timeout=15).get_dict()
        except (ImportError, OSError, ValueError, KeyError) as e:
            raise Unverified(f'FALLO_STATS_NBA: {type(e).__name__}') from e
        require(isinstance(response,dict) and bool(response),'STATS_SIN_DATOS')
        atomic_json(path,response)
        payloads.append(response)
        time.sleep(0.6)
    return adapt_stats(game_id,*payloads)


def fetch_game(kind, game_id, raw, refresh):
    file = raw/f'{kind}_{game_id}.json'
    if file.is_file() and not refresh:
        return json.loads(file.read_text())
    url = f'https://cdn.nba.com/static/json/liveData/{kind}/{kind}_{game_id}.json'
    request = urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=12) as response:
            require(response.geturl().startswith('https://cdn.nba.com/'), 'ORIGEN_INESPERADO')
            body=response.read(MAX_BODY+1)
        require(len(body)<=MAX_BODY, 'FUENTE_EXCEDE_LIMITE')
        data=json.loads(body)
        require(str(data.get('game',{}).get('gameId'))==game_id, 'ID_DE_FUENTE_DISTINTO')
        atomic_json(file,data)
        return data
    finally:
        time.sleep(0.6)


def save_snapshot(state):
    by_player = defaultdict(list)
    games = sorted((state/'games').glob('*.json'))
    require(len(games)<=160, 'PILOTO_EXCEDE_160_PARTIDOS')
    for path in games:
        game=json.loads(path.read_text())
        for pid,row in game['players'].items():
            by_player[pid].append(row)
    payload={'version':1,'source':SOURCE,'players':{pid:sorted(rows,key=lambda r:(r['date'],r['gameId']),reverse=True) for pid,rows in by_player.items()}}
    atomic_json(state/'snapshot.json',payload)
    return len(by_player)


def archive_parts(state, directory, manifest, save_part, load_part):
    path = state/'rotation-pilot'/'snapshot.json'
    if not path.is_file():
        return
    require(path.stat().st_size<=8_000_000, 'PILOTO_EXCEDE_LIMITE')
    pilot=json.loads(path.read_text())
    require(pilot['version']==1 and isinstance(pilot['players'],dict) and len(pilot['players'])<=650, 'PILOTO_INVALIDO')
    for pid, rows in pilot['players'].items():
        require(str(number(pid))==pid and isinstance(rows,list) and len(rows)<=160, 'PILOTO_INVALIDO')
        key='rotations/'+pid
        old=load_part(directory,manifest['parts'][key]) if key in manifest['parts'] else []
        merged={r['gameId']:r for r in [*old,*rows]}
        # Mantener el piloto chico incluso si se vuelve a correr durante varias temporadas.
        rows=sorted(merged.values(),key=lambda r:(r['date'],r['gameId']),reverse=True)[:160]
        manifest['parts'][key]=save_part(directory,key,rows)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1])
    p.add_argument('--game',action='append',default=[],metavar='ID:AAAA-MM-DD')
    p.add_argument('--season',default='2026-27')
    p.add_argument('--before',default=datetime.now(ZoneInfo('America/Argentina/Buenos_Aires')).date().isoformat())
    p.add_argument('--teams',nargs='+',choices=TEAMS,default=list(TEAMS))
    p.add_argument('--per-team',type=int,default=6)
    p.add_argument('--source',choices=('live','stats'),default='live')
    p.add_argument('--offline',action='store_true',help='No descarga: usa JSON guardados en rotation-pilot/raw.')
    p.add_argument('--refresh',action='store_true',help='Vuelve a consultar las fuentes; no se combina con --offline.')
    a=p.parse_args()
    if not re.fullmatch(r'20\d{2}-\d{2}',a.season) or (int(a.season[:4])+1)%100!=int(a.season[-2:]) or not 1<=a.per_team<=12 or len(a.game)>24 or a.offline and a.refresh:
        p.error('Temporada, tamaño del piloto o modo inválidos.')
    state=a.project/'maintenance-state'/'rotation-pilot'
    raw=state/'raw'
    try:
        before=date.fromisoformat(a.before).isoformat()
        games={canonical_id(x.split(':',1)[0]):date.fromisoformat(x.split(':',1)[1]).isoformat() for x in a.game} if a.game else archived_games(a.project,a.season,before,a.per_team,a.teams)
        require(games,'SIN_PARTIDOS_PARA_EL_PILOTO')
    except (OSError,ValueError,KeyError,IndexError) as e:
        p.exit(1,f'No se pudo armar la muestra: {e}\n')
    report=[]
    for gid,day in sorted(games.items(),key=lambda x:x[1],reverse=True):
        target=state/'games'/f'{gid}.json'
        try:
            if a.source=='stats':
                box,pbp=stats_game(gid,raw,a.refresh,a.offline)
            else:
                box,pbp=(json.loads((raw/f'{kind}_{gid}.json').read_text()) if a.offline else fetch_game(kind,gid,raw,a.refresh) for kind in ('boxscore','playbyplay'))
            result=reconstruct(gid,day,box,pbp)
            require(bool(set(a.teams)&set(result['teams'])), 'FUERA_DE_LOS_DOS_EQUIPOS_DEL_PILOTO')
            # Piloto de dos equipos: se pueden verificar ambos lados pero solo se incorpora el solicitado.
            result['players']={pid:r for pid,r in result['players'].items() if r['team'] in a.teams}
            require(result['players'],'SIN_EQUIPOS_CONCILIADOS: '+str(result['rejected']))
            atomic_json(target,result)
            row={'game':gid,'date':day,'verified':sorted({x['team'] for x in result['players'].values()}),'excluded':result['rejected']}
        except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:
            row={'game':gid,'date':day,'verified':[],'error':str(e)[:180],'previousRetained':target.is_file()}
        report.append(row)
        print(json.dumps(row,ensure_ascii=False),flush=True)
    n=save_snapshot(state)
    atomic_json(state/'report.json',{'source':SOURCE,'games':report,'playersInSnapshot':n})
    print(f'Informe: {state/"report.json"} · {sum(bool(r["verified"]) for r in report)}/{len(report)} partidos con equipo conciliado. No se publicó nada.')
    return 0 if any(r['verified'] for r in report) else 1


if __name__=='__main__':
    raise SystemExit(main())
