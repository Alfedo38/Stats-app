"""Pruebas deportivas sintéticas; sin red, BD ni credenciales."""
from pathlib import Path
import copy
import json
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from maintenance_nba.defense_snapshot import build, normalize, number, minutes, position_group, archive_parts, TEAMS

checks=[]
def check(name, fn):
    fn()
    checks.append(name)
    print('OK '+name)
def eq(a,b):
    assert a==b, (a,b)
teams=sorted(TEAMS)
positions={str(1000+t*10+p): ('G' if p<3 else 'F' if p<6 else 'C') for t in range(30) for p in range(8)}
def roster(t=0, day=10, **changes):
    rival=t+1 if t%2==0 else t-1
    gid='00226'+str((day-10)*15+t//2+1).zfill(5)
    return [dict(player_id=1000+t*10+p,player_name=f'Jugador {t}-{p}',team_abbreviation=teams[t],game_id=gid,game_date=f'2026-10-{day:02}',season_id='22026',season_type='Regular Season',matchup=f'{teams[t]} '+('vs. ' if t%2==0 else '@ ')+teams[rival],min='30:00',pts=10+t+day-10,reb=4,ast=3,fgm=4,fga=10,fg3m=1,fg3a=3,ftm=1,fta=2,oreb=1,dreb=3,stl=0,blk=0,tov=1,pf=2,**changes) for p in range(8)]
facts=[r for day in range(10,25) for t in range(30) for r in roster(t,day)]
def prior_shot_and_usage():
    rows=[r for day in range(10,17) for r in roster(0,day,usage_pct=.20 if day<15 else .95)]
    pid=rows[0]['player_id']
    shots={(str(int(r['game_id'])),pid):[6,0,0,0] if r['game_date']<'2026-10-15' else [0,0,0,99] for r in rows if r['player_id']==pid}
    _,by_opponent,_=build(rows,positions,shots)
    sample=[r for r in by_opponent[('2026-27',teams[1])] if r['playerId']==pid]
    eq(sample[4]['priorZones'],None)
    eq(sample[5]['priorZones'],[30,0,0,0,5])
    eq(sample[5]['baseline']['usage'],20)
    eq(sample[5]['usageGames'],5)
check('Perfiles de uso y tiro usan solo partidos anteriores y exigen cobertura',prior_shot_and_usage)
games,players,diagnostics=build(facts,positions)
check('30 equipos y 15 partidos completos por equipo',lambda:eq(len(games['2026-27']),450))
check('Ceros confirmados se conservan; vacío y booleano no son cero',lambda:[eq(number(v),expected) for v,expected in [(None,None),('',None),(False,None),({},None),('nan',None),(-1,None),(0,0),('0',0)]])
check('Minutos MM:SS, prórroga y valores inválidos',lambda:[eq(minutes({'min':v}),expected) for v,expected in [('30:30',30.5),('30:99',None),(False,None),(None,None)]])
check('Posiciones mixtas conservan la primera; desconocida queda vacía',lambda:[eq(position_group(v),g) for v,g in [('F-G','F'),('G-F','G'),('F-C','F'),('C-F','C'),('SG','G'),('SF','F'),('Forward-Guard','F'),('Guard-Forward','G'),('PG-SG','G'),('Guard-unknown',None),('desconocida',None)]])
first=games['2026-27'][0]
check('Permite es la suma del rival, no un promedio individual',lambda:eq(first['groups']['ALL']['pts'],sum(r['pts'] for r in roster(0))))
check('Grupos separan bases, aleros y pívots sin duplicar mixtos',lambda:eq(first['groups']['G']['pts'],30))
check('La defensa se atribuye al equipo contrario y su cancha',lambda:eq((first['team'],first['venue']),(teams[1],'AWAY')))
check('DNP o minutos ausentes no inventan participación',lambda:[eq(normalize({**roster()[0],'min':v},positions),None) for v in [0,None,False,'']])
check('Pretemporada, identidad y temporada incoherentes se excluyen',lambda:[eq(normalize({**roster()[0],**v},positions),None) for v in [{'season_type':'Preseason'},{'game_id':'x'},{'game_date':'2026-02-30'},{'season_id':'2025-26'},{'period_scope':'Q1'}]])
missing=roster();missing[0]['reb']=None
check('Un rebote ausente deja sin dato el total, conserva otros mercados',lambda:eq((build(missing,positions)[0]['2026-27'][0]['groups']['ALL']['reb'],build(missing,positions)[0]['2026-27'][0]['groups']['ALL']['pts']),(None,80)))
unknown=dict(positions);unknown.pop(str(roster()[0]['player_id']))
check('Posición desconocida invalida grupos pero conserva total de equipo',lambda:eq((build(roster(),unknown)[0]['2026-27'][0]['groups']['G']['pts'],build(roster(),unknown)[0]['2026-27'][0]['groups']['ALL']['pts']),(None,80)))
check('Un roster incompleto no produce un total defensivo falso',lambda:eq(len(build(roster()[:-1],positions)[0]),0))
ot=roster()
for p,r in enumerate(ot):r['min']=35 if p<5 else 30
check('Prórroga completa de 265 minutos es válida',lambda:eq(len(build(ot,positions)[0]['2026-27']),1))
check('Duplicado con ceros iniciales no duplica totales',lambda:eq(len(build(roster()+[{**roster()[0],'game_id':str(int(roster()[0]['game_id']))}],positions)[0]['2026-27']),1))
check('Dos resultados contradictorios no se eligen silenciosamente',lambda:eq(len(build(roster()+[{**roster()[0],'pts':99}],positions)[0]),0))
conflict=roster();conflict[0]['matchup']=f'{teams[0]} vs. {teams[3]}'
check('Un mismo partido con rivales contradictorios se excluye',lambda:eq(len(build(conflict,positions)[0]),0))
impossible=roster();impossible[0]['fgm']=11
check('Anotados mayores que intentos quedan sin dato',lambda:eq(build(impossible,positions)[0]['2026-27'][0]['groups']['ALL']['fga'],None))
pr=players[('2026-27',teams[1])]
pid=roster()[0]['player_id'];one=[r for r in pr if r['playerId']==pid]
check('El promedio previo excluye al propio partido y a futuros',lambda:eq([r['baseline']['pts'] for r in one[:3]],[None,10,10.5]))
paired=roster()+roster(day=11)
paired[0]['ast']=None
check('PRA previo requiere componentes en los mismos partidos',lambda:eq([r for r in build(paired,positions)[1][('2026-27',teams[1])] if r['playerId']==pid][-1]['baseline']['pra'],None))
same=roster()+[{**r,'game_id':'0022600999'} for r in roster()]
check('Dos registros del mismo día no se usan como antecedente previo',lambda:eq([r['baseline']['pts'] for r in build(same,positions)[1][('2026-27',teams[1])] if r['playerId']==pid],[None,None]))
stored={};manifest={'parts':{'facts/fixture':{}}}
def save(directory,name,data):
    stored[name]=data
    return {'rows':len(data),'bytes':1,'path':name,'sha256':'a'*64}
archive_parts(None,manifest,positions,lambda directory,meta:facts,save)
check('Exportación crea parte de temporada y una por rival, sin alterar facts',lambda:eq((len([k for k in manifest['parts'] if k.startswith('defense/')]),len([k for k in manifest['parts'] if k.startswith('defense-players/')]),'facts/fixture' in manifest['parts']),(1,30,True)))
check('Resumen anuncia formato, período, fecha y origen de posiciones',lambda:eq((stored['defense/2026-27']['format'],stored['defense/2026-27']['scope'],stored['defense/2026-27']['through']),(1,'FULL','2026-10-24')))
output=Path('maintenance-state/qa/defensas-fixture.json');output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps({'games':games['2026-27'],'players':players[('2026-27',teams[1])],'snapshot':stored['defense/2026-27'],'tests':checks,'checks':len(checks)},ensure_ascii=False))
print(f'Defensas locales: {len(checks)} verificaciones; sin red ni BD.')
