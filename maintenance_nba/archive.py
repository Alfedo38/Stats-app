"""Archivo incremental: objetos inmutables, índice al final y vaciado condicionado."""
from __future__ import annotations
import gzip, json, os, urllib.request, urllib.error, sqlite3, sys
from decimal import Decimal,InvalidOperation
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from .common import STATE,env,engine,canonical,sha,atomic,rows

# Sólo datos deportivos. Nunca credenciales, sesiones ni cuentas.
SOURCES = {
 'facts':('public.player_page_game_fact_cache','player_id',('player_id','game_id')),
 'shots':('public.nba_shots','player_id',('player_id','game_id','game_event_id')),
 'matchups':('public.nba_player_matchups','offensive_player_id',('offensive_player_id','defensive_player_id','game_id')),
}

def season(r):
    v=str(r.get('season') or r.get('season_year') or r.get('season_id') or '')
    if len(v)==7 and v[4]=='-':return v
    if len(v)==5 and v.startswith('2') and v.isdigit():v=v[1:]
    if len(v)==4 and v.isdigit():return f'{v}-{str(int(v)+1)[-2:]}'
    d=str(r.get('game_date',''))
    if len(d)<10:raise ValueError('Fila sin temporada ni fecha')
    y=int(d[:4])-(int(d[5:7])<10)
    return f'{y}-{str(y+1)[-2:]}'

def id_key(value):
    raw=str(value if value is not None else '').strip()
    try:
        number=Decimal(raw)
        if number.is_finite() and number==number.to_integral() and number>=0:return str(int(number))
    except InvalidOperation:pass
    return raw

def key(kind,r):
    pid=id_key(r.get(SOURCES[kind][1]))
    if not pid.isdigit():raise ValueError('Identidad de jugador inválida')
    return f'{kind}/{pid}' + ('' if kind=='facts' else '/'+season(r))

def identity(kind,r):
    values=[id_key(r.get(k)) for k in SOURCES[kind][2]]
    if any(not x for x in values):raise ValueError('Falta clave natural en '+kind)
    return tuple(values)

def merge(kind,old,new):
    for label,data in (('archivo',old),('entrada',new)):
        ids=[identity(kind,r) for r in data]
        if len(ids)!=len(set(ids)):raise ValueError('Claves duplicadas en '+kind+' ('+label+'); se conserva el original')
    result={identity(kind,r):r for r in old}
    for r in new:
        ident=identity(kind,r);result[ident]={**result.get(ident,{}),**r}
    return sorted(result.values(),key=lambda r:identity(kind,r))

class Storage:
    def __init__(self):
        e=env();self.url=(e.get('SUPABASE_URL') or e.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
        self.token=e.get('SUPABASE_SERVICE_ROLE_KEY','');self.bucket=e.get('NBA_ARCHIVE_BUCKET','nba-history')
        if not self.url.startswith('https://') or not self.token:raise ValueError('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (sólo servidor)')
        if not self.bucket.replace('-','').isalnum():raise ValueError('Bucket inválido')
    def setup(self):
        # Crea sólo el bucket nombrado, privado. Un bucket existente público se rechaza.
        req=urllib.request.Request(self.url+'/storage/v1/bucket/'+self.bucket,headers={'apikey':self.token,'Authorization':'Bearer '+self.token})
        try:
            with urllib.request.urlopen(req,timeout=30) as response:data=json.load(response)
        except urllib.error.HTTPError as ex:
            try:
                detail=json.loads(ex.read())
            except (ValueError, UnicodeError):
                detail={}
            missing=(ex.code==404 or (ex.code==400 and isinstance(detail,dict) and detail.get('code')=='NoSuchBucket'))
            if not missing:
                raise RuntimeError('No se pudo consultar el bucket: HTTP '+str(ex.code)) from None
            body=canonical({'id':self.bucket,'name':self.bucket,'public':False,'file_size_limit':49000000})
            req=urllib.request.Request(self.url+'/storage/v1/bucket',data=body,method='POST',headers={'apikey':self.token,'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
            with urllib.request.urlopen(req,timeout=30) as response:response.read()
        self.check_private();print('Bucket privado verificado:',self.bucket)
    def call(self,method,path,data=None):
        request=urllib.request.Request(self.url+'/storage/v1/'+path,data=data,method=method,headers={
          'apikey':self.token,'Authorization':'Bearer '+self.token,'Content-Type':'application/octet-stream','x-upsert':'true'})
        try:
            with urllib.request.urlopen(request,timeout=120) as r:return r.read()
        except urllib.error.HTTPError as ex:
            raise RuntimeError(f'Storage HTTP {ex.code}; revisar permisos, cuota y bucket privado') from None
    def get(self,path):
        nonce='?cacheNonce='+os.urandom(16).hex() if path=='manifest.json' else ''
        return self.call('GET','object/authenticated/'+self.bucket+'/'+path+nonce)
    def put(self,path,data):
        if len(data)>49_000_000:raise ValueError('Objeto mayor de 49 MB: subdividir antes de publicar')
        self.call('POST','object/'+self.bucket+'/'+path,data)
        if sha(self.get(path))!=sha(data):raise ValueError('No coincide la descarga verificada: '+path)
    def check_private(self):
        data=json.loads(self.call('GET','bucket/'+self.bucket))
        if data.get('public') is not False:raise ValueError('El bucket debe existir y ser privado')

def read_manifest(directory):
    p=directory/'manifest.json'
    return json.loads(p.read_text()) if p.exists() else {'format':1,'parts':{},'source_snapshots':{}}

def load_part(directory,meta):
    b=(directory/meta['path']).read_bytes()
    if sha(b)!=meta['sha256']:raise ValueError('Archivo local modificado: '+meta['path'])
    data=json.loads(gzip.decompress(b))
    if len(data)!=meta['rows']:raise ValueError('Conteo de archivo inválido')
    return data

def save_part(directory,name,data):
    b=gzip.compress(canonical(data),compresslevel=6,mtime=0);digest=sha(b)
    path=f'objects/{name}/{digest}.json.gz'
    atomic(directory/path,b)
    return {'path':path,'sha256':digest,'rows':len(data),'bytes':len(b)}

def table_snapshot(data):return {'rows':len(data),'sha256':sha(canonical(sorted((canonical(r).decode() for r in data))))}

def summary_inputs(c):
    fouls=rows(c,"SELECT season_year AS season,player_id,count(*)::int AS games,avg(coalesce(pf,0))::real AS pf_avg FROM public.player_game_logs GROUP BY season_year,player_id")
    positions={str(r['id']):r.get('position') or '' for r in rows(c,'SELECT id,position FROM public.players')}
    return fouls,positions

def summaries(directory,manifest,c=None,*,summary_data=None):
    # Se calcula una vez en el PC; evita escanear todos los tiros en cada visita web.
    recent={};zones=defaultdict(lambda:defaultdict(lambda:{'games':set(),'made':0,'attempts':0}))
    league=defaultdict(set);dates=defaultdict(set);players={}
    for name,meta in list(manifest['parts'].items()):
        if not name.startswith(('facts/','shots/')):continue
        data=load_part(directory,meta)
        if name.startswith('facts/'):
            recent[name.split('/')[1]]=sorted(data,key=lambda r:str(r.get('game_date','')),reverse=True)[:10]
        for r in data:
            if name.startswith('facts/'):
                pid=str(r['player_id']);players[pid]=str(r.get('player_name') or '')
                t=r.get('team_abbreviation');d=str(r.get('game_date') or '')[:10]
                if t and d:dates[season(r)+'/'+t].add(d)
                continue
            if r.get('shot_attempted_flag')!=1 or not r.get('opponent_abbr'):continue
            s=season(r);phase=str(r.get('season_type') or '');team=r['opponent_abbr'];g=str(r['game_id']);z=r.get('shot_zone_basic') or 'Sin zona'
            for p in {'ALL',phase}:
                k=s+'/'+p;league[k].add((g,team))
                a=zones[k][(team,z)];a['games'].add(g);a['made']+=int(r.get('shot_made_flag')==1);a['attempts']+=1
    defense={}
    for k,by_zone in zones.items():
        zone_names={z for t,z in by_zone};teams={t for t,z in by_zone}
        for t in teams:
            games=set().union(*(v['games'] for (team,z),v in by_zone.items() if team==t))
            result=[]
            for z in zone_names:
                a=by_zone.get((t,z),{'attempts':0,'made':0});lv=[v for (team,zone),v in by_zone.items() if zone==z]
                result.append({'zone':z,'attempts':a['attempts'],'made':a['made'],'games':len(games),'league_attempts':sum(v['attempts'] for v in lv),'league_made':sum(v['made'] for v in lv),'league_team_games':len(league[k])})
            defense[k+'/'+t]=sorted(result,key=lambda r:-r['attempts'])
    fouls,positions=summary_data if summary_data is not None else summary_inputs(c)
    payload={'recent':recent,'defense':defense,'teamDates':{k:sorted(v) for k,v in dates.items()},'players':players,'positions':positions,'fouls':fouls}
    manifest['parts']['summaries']=save_part(directory,'summaries',payload)
    # Los objetos de resumen son objetos JSON, no listas.
    manifest['parts']['summaries']['rows']=len(payload)

def export(upload=False):
    directory=STATE/'archive';directory.mkdir(parents=True,exist_ok=True)
    manifest=read_manifest(directory);db=engine()
    # NBA_ARCHIVE_TIMEOUT_FIX_V2: no compresión ni hashing dentro de la transacción.
    print('ARCHIVO: leyendo fuentes remotas...',flush=True)
    try:
        with db.connect().execution_options(isolation_level='REPEATABLE READ') as c,c.begin():
            from sqlalchemy import text
            c.execute(text('SET TRANSACTION READ ONLY'))
            source_data={kind:rows(c,'SELECT * FROM '+table) for kind,(table,_,_) in SOURCES.items()}
            summary_data=summary_inputs(c)
    finally:
        db.dispose()
    print('ARCHIVO: lectura cerrada; procesando archivos locales...',flush=True)
    for kind,(table,pid,keys) in SOURCES.items():
        data=source_data.pop(kind);grouped=defaultdict(list)
        # Datos nuevos de caché/tiros se preparan en el PC, sin reinsertar historia en Supabase.
        extra=[]
        if kind=='facts' and (STATE/'facts-pending.json.gz').exists():
            extra=json.loads(gzip.decompress((STATE/'facts-pending.json.gz').read_bytes()))
        if kind in ('shots','matchups') and env().get('NBA_CONTEXT_SQLITE'):
            from .common import ROOT
            sys.path.insert(0,str(ROOT/'motor_python/NBA'))
            from nba_context_upload import shot_values,SHOT_COLUMNS,MATCHUP_COLUMNS
            local=sqlite3.connect('file:'+env()['NBA_CONTEXT_SQLITE']+'?mode=ro',uri=True);local.row_factory=sqlite3.Row
            try:
                for item in local.execute('SELECT * FROM '+kind):
                    extra.append(dict(zip(SHOT_COLUMNS,shot_values(item))) if kind=='shots' else dict(item))
            finally:local.close()
        for r in data+extra:grouped[key(kind,r)].append(r)
        for name,new in grouped.items():
            old=load_part(directory,manifest['parts'][name]) if name in manifest['parts'] else []
            manifest['parts'][name]=save_part(directory,name,merge(kind,old,new))
        manifest['source_snapshots'][kind]=table_snapshot(data)
    # POTENTIAL_HISTORY_V1
    from .potential_history import enrich_archive
    enrich_archive(directory,manifest,load_part,save_part)
    summaries(directory,manifest,summary_data=summary_data)
    manifest['updated_at']=datetime.now(timezone.utc).isoformat()
    manifest['counts']={kind:sum(m['rows'] for n,m in manifest['parts'].items() if n.startswith(kind+'/')) for kind in SOURCES}
    manifest['id']=sha(canonical({k:v for k,v in manifest.items() if k not in ('id','updated_at')}))
    atomic(directory/'manifest.json',canonical(manifest))
    size=sum(x['bytes'] for x in manifest['parts'].values())
    print(json.dumps({'id':manifest['id'],'rows':manifest['counts'],'compressed_bytes':size,'uploaded':False}))
    if not upload:return manifest
    storage=Storage();storage.check_private()
    if (directory/'published.json').exists() and json.loads((directory/'published.json').read_text()).get('id')==manifest['id']:
        print('ARCHIVO SIN CAMBIOS: no se reescribieron objetos ni el índice remoto.')
        return manifest
    # Cuenta uso REAL de todos los buckets (incluye archivos anteriores).
    db=engine()
    with db.connect() as c:
        used=rows(c,"SELECT coalesce(sum((metadata->>'size')::bigint),0)::bigint AS bytes FROM storage.objects")[0]['bytes']
    db.dispose();budget=int(env().get('NBA_STORAGE_BUDGET_BYTES','900000000'))
    missing=[m for m in manifest['parts'].values() if not (directory/('uploaded-'+m['sha256'])).exists()]
    if used+sum(m['bytes'] for m in missing)>budget:raise ValueError('No hay margen en Storage. No se subió ni vació ninguna tabla. Revisar archivos viejos con el informe.')
    for m in missing:
        storage.put(m['path'],(directory/m['path']).read_bytes());atomic(directory/('uploaded-'+m['sha256']),b'verified')
    # El puntero se publica sólo después de todos los objetos.
    storage.put('manifest.json',canonical(manifest))
    atomic(directory/'published.json',canonical(manifest))
    print('ARCHIVO PUBLICADO Y VERIFICADO:',manifest['id'])
    return manifest

def verify_cloud(manifest):
    s=Storage();remote=json.loads(s.get('manifest.json'))
    if remote!=manifest:raise ValueError('El índice remoto difiere del publicado localmente')
    for m in manifest['parts'].values():
        b=s.get(m['path'])
        if sha(b)!=m['sha256'] or len(json.loads(gzip.decompress(b)))!=m['rows']:raise ValueError('Archivo remoto no verificado')

def reclaim(web_url):
    """Vaciado explícito, sólo caché/tiros/matchups ya archivados; nunca CASCADE."""
    directory=STATE/'archive';manifest=json.loads((directory/'published.json').read_text())
    verify_cloud(manifest)
    if not web_url.startswith('https://'):raise ValueError('Se requiere URL HTTPS de la web ya desplegada')
    with urllib.request.urlopen(web_url.rstrip('/')+'/api/nba-archive-health',timeout=90) as r:health=json.load(r)
    if health.get('archiveId')!=manifest['id'] or health.get('readerVersion')!=1 or health.get('ok') is not True:
        raise ValueError('La web todavía no está leyendo este archivo. No se vació nada')
    db=engine()
    from sqlalchemy import text
    with db.begin() as c:
        c.execute(text("SET LOCAL lock_timeout='10s'"))
        c.execute(text('SELECT pg_advisory_xact_lock(88401729)'))
        dependent=rows(c,"""SELECT DISTINCT n.nspname AS schema,v.relname AS view
          FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid JOIN pg_class v ON v.oid=rw.ev_class
          JOIN pg_namespace n ON n.oid=v.relnamespace
          WHERE d.refobjid IN ('public.player_page_game_fact_cache'::regclass,'public.nba_shots'::regclass,'public.nba_player_matchups'::regclass)
          AND v.oid<>d.refobjid AND v.relkind IN ('v','m')""")
        if dependent:raise ValueError('Hay vistas SQL que dependen de las tablas a vaciar: '+str(dependent)+'. Revisarlas antes de liberar; no se vació nada')
        for kind,(table,pid,keys) in SOURCES.items():
            c.execute(text('LOCK TABLE '+table+' IN ACCESS EXCLUSIVE MODE'))
        for kind,(table,pid,keys) in SOURCES.items():
            data=rows(c,'SELECT * FROM '+table)
            if table_snapshot(data)!=manifest['source_snapshots'][kind]:raise ValueError('Hay datos nuevos desde la exportación. Volvé a exportar antes de vaciar')
        # Mantiene nombres, permisos y vistas; PostgreSQL aborta si hay FK que lo impida.
        for table,_,_ in SOURCES.values():c.execute(text('TRUNCATE TABLE '+table))
    db.dispose();print('Tres tablas vaciadas. Histórico verificado en archivos locales y remotos. Ejecutá preflight para medir espacio real.')
