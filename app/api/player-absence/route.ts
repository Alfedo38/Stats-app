import {withAuth,readBody} from '@/lib/auth/server';
import prisma from '@/lib/prisma';
import {NextResponse} from 'next/server';
import {CURRENT_ROSTER_SEASON,CURRENT_ROSTER_UPDATED_AT,getCurrentRosterPlayer,getCurrentRosterTeam} from '@/lib/currentRosters';
import {absenceName,absenceOptions,absenceTeam,rosterReferenceWarning,type AbsenceScope,type RecordedAbsence} from '@/lib/playerAbsenceContext';
import {cleanAbsences} from '@/lib/nbaGameFilters';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const ABSENT=['OUT','INACTIVE','DNP','DID NOT PLAY','DID_NOT_PLAY','DIDNOTPLAY','NOT_PLAYED','ABSENT','SUSPENDED','REST'];
const teamSql="upper(trim(coalesce(to_jsonb(cache)->>'team_abbreviation',to_jsonb(cache)->>'team_abbr','')))";
const statusSql="upper(trim(coalesce(to_jsonb(cache)->>'absent_status','')))";
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
function context(player:number,scope:AbsenceScope,requestedTeam:string){
 const current=getCurrentRosterPlayer(player),currentTeam=absenceTeam(current?.team_abbreviation);
 if(scope==='current'&&(!currentTeam||CURRENT_ROSTER_UPDATED_AT>today()))return null;
 if(scope==='current'&&requestedTeam&&requestedTeam!==currentTeam)return null;
 return {scope,team:scope==='current'?currentTeam:requestedTeam,currentTeam:currentTeam||null,snapshotAt:CURRENT_ROSTER_UPDATED_AT,rosterSeason:CURRENT_ROSTER_SEASON,rosterWarning:rosterReferenceWarning(CURRENT_ROSTER_UPDATED_AT,today())};
}
async function catalog(player:number,scope:AbsenceScope,team:string){
 const rows=await prisma.$queryRawUnsafe<RecordedAbsence[]>(`SELECT trim(cache.absent_teammate) AS name,${teamSql} AS team,
   count(DISTINCT cache.game_id) FILTER (WHERE ${statusSql}=ANY($3::text[]))::int AS games
   FROM public.ludo_wo_games_modal_cache cache WHERE cache.player_id=$1::bigint
   AND cache.absent_teammate IS NOT NULL AND trim(cache.absent_teammate)<>''
   AND ($2::text='' OR ${teamSql}=$2::text)
   GROUP BY trim(cache.absent_teammate),${teamSql} ORDER BY name,team LIMIT 256`,player,scope==='current'?team:'',ABSENT);
 return {rows,options:absenceOptions(scope,player,scope==='current'?getCurrentRosterTeam(team):[],rows,team),teams:[...new Set(rows.map(r=>absenceTeam(r.team)).filter(Boolean))].sort()};
}
function parameters(rawScope:unknown,rawTeam:unknown){
 if(rawScope!=null&&rawScope!=='current'&&rawScope!=='historical')return null;
 if(rawTeam!=null&&rawTeam!==''&&!absenceTeam(rawTeam))return null;
 return {scope:(rawScope??'current') as AbsenceScope,team:absenceTeam(rawTeam)};
}
export const GET=withAuth(async(req:Request)=>{
 const params=new URL(req.url).searchParams,player=Number(params.get('playerId')),p=parameters(params.get('scope'),params.get('team'));
 if(!Number.isSafeInteger(player)||player<=0||!p)return json({ok:false,error:'Jugador o contexto inválido.'},400);
 const ctx=context(player,p.scope,p.team);
 if(!ctx)return json({ok:false,error:'No hay un plantel actual confirmado para este jugador. Podés consultar Históricos.'},503);
 try{
  const {options,teams}=await catalog(player,ctx.scope,ctx.team);
  return json({ok:true,catalogueVersion:3,...ctx,names:options.map(o=>o.name),options:options.map(({aliases,...option})=>option),teams,source:ctx.scope==='current'?'Plantel actual; ausencias registradas por equipo':'Historial de ausencias por equipo'});
 }catch{return json({ok:false,error:'No se pudo cargar el catálogo de ausencias.'},503);}
});
export const POST=withAuth(async(req:Request)=>{
 const body=await readBody(req),player=Number(body.playerId),p=parameters(body.scope,body.team);
 if(!Number.isSafeInteger(player)||player<=0||!p||!Array.isArray(body.names)||body.names.length>8||body.names.some((n:unknown)=>typeof n!=='string'||!n.trim()||n.length>100))return json({ok:false,error:'Elegí un jugador y hasta 8 compañeros válidos.'},400);
 const names=cleanAbsences(body.names),ctx=context(player,p.scope,p.team);
 if(!ctx)return json({ok:false,error:'No hay un plantel actual confirmado para este contexto. Consultá Históricos.'},503);
 try{
  const matches:Record<string,string[]>=Object.fromEntries(names.map(name=>[name,[]]));
  if(names.length){
   const {options}=await catalog(player,ctx.scope,ctx.team),aliases:{name:string;alias:string}[]=[];
   for(const name of names){const found=options.filter(o=>absenceName(o.name)===absenceName(name));if(found.length!==1)return json({ok:false,error:'Una selección no pertenece al equipo o contexto elegido. Revisá la lista o cambiá a Históricos.'},400);for(const alias of found[0].aliases)aliases.push({name,alias});}
   const rows=await prisma.$queryRawUnsafe<{name:string;game_id:string}[]>(`WITH requested AS (SELECT item->>'name' AS name,item->>'alias' AS alias FROM jsonb_array_elements($2::jsonb) item)
    SELECT DISTINCT requested.name,cache.game_id::text AS game_id FROM requested
    JOIN public.ludo_wo_games_modal_cache cache ON lower(trim(cache.absent_teammate))=lower(requested.alias)
    WHERE cache.player_id=$1::bigint AND cache.game_id IS NOT NULL
    AND ($3::text='' OR ${teamSql}=$3::text) AND ${statusSql}=ANY($4::text[])`,player,JSON.stringify(aliases),ctx.team,ABSENT);
   for(const row of rows)if(Object.hasOwn(matches,row.name))matches[row.name].push(row.game_id);
  }
  return json({ok:true,...ctx,matches,source:'Ausencias registradas y filtradas por equipo',emptyMeans:'Sin ausencias confirmadas para esta selección; no implica que estuviera disponible.'});
 }catch{return json({ok:false,error:'No se pudieron consultar los partidos con ausencias. Reintentá.'},503);}
});
