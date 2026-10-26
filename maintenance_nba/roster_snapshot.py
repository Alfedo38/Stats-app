"""Referencia actual NBA verificada; sólo actualiza el archivo local del plantel."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

TEAMS = {'ATL':1610612737,'BOS':1610612738,'BKN':1610612751,'CHA':1610612766,'CHI':1610612741,'CLE':1610612739,'DAL':1610612742,'DEN':1610612743,'DET':1610612765,'GSW':1610612744,'HOU':1610612745,'IND':1610612754,'LAC':1610612746,'LAL':1610612747,'MEM':1610612763,'MIA':1610612748,'MIL':1610612749,'MIN':1610612750,'NOP':1610612740,'NYK':1610612752,'OKC':1610612760,'ORL':1610612753,'PHI':1610612755,'PHX':1610612756,'POR':1610612757,'SAC':1610612758,'SAS':1610612759,'TOR':1610612761,'UTA':1610612762,'WAS':1610612764}
PROFILE = ('jersey_number','position','height','weight','birthdate','age','experience','school','acquisition')
SOURCE = 'NBA Stats CommonAllPlayers; IsOnlyCurrentSeason=1; ROSTERSTATUS=1'
TZ = ZoneInfo('America/Argentina/Buenos_Aires')

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False).encode()+b'\n'

def validate(snapshot):
    if not isinstance(snapshot,dict) or not re.fullmatch(r'20\d{2}-\d{2}',str(snapshot.get('season',''))):raise ValueError('Temporada del plantel inválida')
    day=str(snapshot.get('snapshot_date',''))
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day):raise ValueError('Fecha del plantel inválida')
    datetime.strptime(day,'%Y-%m-%d')
    teams=snapshot.get('teams')
    if not isinstance(teams,list) or len(teams)!=30:raise ValueError('Se necesitan los 30 equipos; se conserva la referencia anterior')
    seen=set();ids=set()
    for team in teams:
        abbr=team.get('team_abbreviation')
        if abbr not in TEAMS or abbr in seen or type(team.get('team_id')) is not int or team['team_id']!=TEAMS[abbr]:raise ValueError('Identidad de equipo inválida o duplicada')
        seen.add(abbr);players=team.get('players')
        if not isinstance(players,list) or not 10<=len(players)<=30:raise ValueError('Plantel incompleto o fuera de rango: '+abbr)
        for player in players:
            pid=player.get('player_id');name=player.get('full_name')
            if type(pid) is not int or pid<=0 or pid in ids or not isinstance(name,str) or not 3<=len(name.strip())<=100:raise ValueError('Identidad de jugador inválida o repetida')
            ids.add(pid)
    return snapshot

def from_nba(payload,season,day):
    params=payload.get('parameters',{})
    if params.get('Season')!=season or str(params.get('IsOnlyCurrentSeason'))!='1' or str(params.get('LeagueID'))!='00':raise ValueError('NBA no confirmó la temporada y el alcance solicitados')
    required={'PERSON_ID','DISPLAY_FIRST_LAST','ROSTERSTATUS','TEAM_ID','TEAM_ABBREVIATION'}
    sets=[s for s in payload.get('resultSets',[]) if isinstance(s,dict) and required<=set(s.get('headers',[]))]
    if len(sets)!=1:raise ValueError('Respuesta NBA sin un catálogo único de jugadores')
    data=sets[0];headers=data['headers']
    if len(headers)!=len(set(headers)) or not isinstance(data.get('rowSet'),list):raise ValueError('Columnas o filas NBA inválidas')
    teams={abbr:{'team_abbreviation':abbr,'team_id':tid,'slug':abbr.lower(),'source_url':'https://www.nba.com/stats/players/bio?TeamID='+str(tid),'players':[]} for abbr,tid in TEAMS.items()}
    for raw in data['rowSet']:
        if not isinstance(raw,list) or len(raw)!=len(headers):raise ValueError('Fila NBA incompleta')
        row=dict(zip(headers,raw))
        if str(row['ROSTERSTATUS'])!='1' or row['TEAM_ID'] in (None,0,'0'):continue
        team=str(row['TEAM_ABBREVIATION']).strip().upper()
        if team not in TEAMS or row['TEAM_ID']!=TEAMS[team]:raise ValueError('NBA devolvió un equipo no verificable')
        if row.get('TEAM_SLUG'):teams[team]['slug']=str(row['TEAM_SLUG'])
        player={key:None for key in PROFILE}
        player.update(player_id=row['PERSON_ID'],full_name=str(row['DISPLAY_FIRST_LAST']).strip())
        teams[team]['players'].append(player)
    for team in teams.values():team['players'].sort(key=lambda p:(p['full_name'],p['player_id']))
    return validate({'snapshot_date':day,'season':season,'source':SOURCE,'teams':list(teams.values())})

def merge_profiles(previous,current):
    validate(current)
    if previous.get('season')!=current['season']:raise ValueError('La referencia anterior pertenece a otra temporada')
    profiles={};duplicates=set();oldteams={}
    for team in previous.get('teams',[]):
        oldteams[team.get('team_abbreviation')]=team
        for player in team.get('players',[]):
            pid=player.get('player_id')
            if pid in profiles:duplicates.add(pid)
            profiles[pid]=(player,team.get('team_abbreviation'))
    result=json.loads(json.dumps(current))
    for team in result['teams']:
        oldteam=oldteams.get(team['team_abbreviation'],{})
        # Conserva metadatos de la página del mismo equipo.
        for key in ('slug','source_url'):
            if oldteam.get(key):team[key]=oldteam[key]
        for player in team['players']:
            pid=player['player_id']
            if pid not in profiles or pid in duplicates:continue
            old,oldteamname=profiles[pid]
            for key in PROFILE:
                if key in ('jersey_number','acquisition') and oldteamname!=team['team_abbreviation']:continue
                if old.get(key) is not None:player[key]=old[key]
    return validate(result)

def atomic(path,data,mode=0o644):
    path.parent.mkdir(parents=True,exist_ok=True);fd,temp=tempfile.mkstemp(dir=path.parent,prefix='.roster-')
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(temp,mode);os.replace(temp,path)
    finally:Path(temp).unlink(missing_ok=True)

def download(season):
    url='https://stats.nba.com/stats/commonallplayers?'+urllib.parse.urlencode({'IsOnlyCurrentSeason':1,'LeagueID':'00','Season':season})
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.nba.com/','Origin':'https://www.nba.com/','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=45) as response:data=response.read(5_000_001)
    if len(data)>5_000_000:raise ValueError('Respuesta NBA demasiado grande')
    return from_nba(json.loads(data),season,datetime.now(TZ).date().isoformat())

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--apply',action='store_true');a=p.parse_args()
    root=a.project.expanduser().resolve();path=root/'data/nba_rosters_2026_27.json'
    if path.is_symlink() or not path.resolve().is_relative_to(root):raise ValueError('Ruta de planteles no válida')
    previous_bytes=path.read_bytes();previous=json.loads(previous_bytes)
    current=merge_profiles(previous,download(previous['season']));encoded=canonical(current)
    print('Referencia NBA:',current['season'],current['snapshot_date'],';',sum(len(t['players']) for t in current['teams']),'jugadores / 30 equipos')
    if not a.apply:print('Vista previa; agregá --apply para guardar el archivo.');return
    if encoded==previous_bytes:print('La referencia ya estaba actualizada.');return
    backup=root/'maintenance-state/patch-backups'/datetime.now(timezone.utc).strftime('planteles-%Y%m%dT%H%M%S%fZ')
    if not backup.resolve().is_relative_to(root):raise ValueError('Ruta de copia no válida')
    backup.mkdir(parents=True,mode=0o700);atomic(backup/path.name,previous_bytes,0o600)
    if path.read_bytes()!=previous_bytes:raise ValueError('El archivo cambió durante la descarga; no se reemplazó')
    atomic(path,encoded,path.stat().st_mode&0o777)
    print('Referencia local actualizada. Reiniciá la app; para producción, incluí este archivo en el próximo despliegue.')

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError) as e:raise SystemExit('No se actualizó el plantel: '+str(e))
