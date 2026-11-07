import 'server-only';
import prisma from './prisma';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {getCurrentRosterPlayer,CURRENT_ROSTER_UPDATED_AT} from './currentRosters';
import {getJornadaSchedule,getNbaSlateSchedule} from './nbaJornadaData';
import {getInjuryReport} from './injuryReportData';
import {nbaSlateDate} from './nbaSlate';
import {rosterFitsDate} from './ticketReader/teamContext';
import {automaticImpact,confirmedGameAbsences,impactName,impactPlayerKey,type AutoImpactRequest,type AutoImpactReport,type AutoImpactPlayer} from './jornadaAbsenceImpact';
const cache=new Map<string,{until:number;value:Promise<AutoImpactReport>}>();
const teamSql="upper(trim(coalesce(to_jsonb(cache)->>'team_abbreviation',to_jsonb(cache)->>'team_abbr','')))";
const gameKey=(v:unknown)=>/^\d{1,15}$/.test(String(v))?String(Number(v)):'';
async function pooled<T,R>(items:T[],limit:number,run:(item:T)=>Promise<R>){let index=0;const values:R[]=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const n=index++;values[n]=await run(items[n]);}}));return values;}
export function getAutomaticImpacts(request:AutoImpactRequest):Promise<AutoImpactReport>{
 const key=JSON.stringify(request),old=cache.get(key);if(old&&old.until>Date.now())return old.value;
 const value=read(request),entry={until:Date.now()+60000,value};cache.set(key,entry);if(cache.size>16)cache.delete(cache.keys().next().value!);
 value.then(data=>{if(data.results.some(p=>p.status==='unavailable')&&cache.get(key)===entry)cache.delete(key);},()=>{if(cache.get(key)===entry)cache.delete(key);});return value;
}
async function read(request:AutoImpactRequest):Promise<AutoImpactReport>{
 const schedule=request.slate?await getNbaSlateSchedule(request.date):{games:await getJornadaSchedule(request.date)};
 const result:AutoImpactReport={...request,ok:true,version:2,archiveId:null,rosterAt:CURRENT_ROSTER_UPDATED_AT,results:request.players.map(p=>({...p,team:'',status:'unavailable',reason:'Partido o plantel sin verificar',items:[]}))};
 const valid=request.players.flatMap((p,index)=>{const game=schedule.games.find(g=>g.id===p.gameId),roster=getCurrentRosterPlayer(p.playerId),eventDate=game?.eventDate??request.date;if(!game||!roster||![game.away,game.home].includes(roster.team_abbreviation)||!rosterFitsDate(eventDate,CURRENT_ROSTER_UPDATED_AT))return [];const row=result.results[index];row.team=roster.team_abbreviation;return [{p,game,eventDate,row}];});
 const dates=[...new Set(valid.map(v=>v.eventDate))],reports=new Map(await Promise.all(dates.map(async day=>[day,await getInjuryReport(day).catch(()=>null)] as const)));
 const pending=valid.flatMap(v=>{
  const report=reports.get(v.eventDate),outs=report?confirmedGameAbsences(report,v.game,v.eventDate,v.row.team):null;
  if(!outs){v.row.reason=report?.stale?'Parte de lesiones desactualizado':'Parte de lesiones sin verificar';return [];}
  if(outs.some(o=>o.playerId===v.p.playerId)){v.row.status='player_out';delete v.row.reason;return [];}
  const mates=outs.filter(o=>o.playerId!==v.p.playerId&&getCurrentRosterPlayer(o.playerId!)?.team_abbreviation===v.row.team);
  v.row.status=mates.length?'ready':'none';delete v.row.reason;return mates.length?[{...v,mates}]:[];
 });
 if(!pending.length)return result;
 function failed(reason:string){for(const v of pending){v.row.status='unavailable';v.row.reason=reason;v.row.items=[];}return result;}
 if(!archiveEnabled())return failed('Histórico no disponible');
 try{
  const manifest=await archiveManifest();result.archiveId=manifest.id;
  const ids=[...new Set(pending.flatMap(v=>[v.p.playerId,...v.mates.map(m=>m.playerId!)]))];
  const facts=new Map(await pooled(ids,6,async id=>{try{const rows=await archivePart(`facts/${id}`,manifest);return [id,Array.isArray(rows)?rows:null] as const;}catch{return [id,null] as const;}}));
  const targetIds=pending.map(v=>v.p.playerId),teams=[...new Set(pending.map(v=>v.row.team))];
  const catalogue=await prisma.$queryRawUnsafe<{player_id:string;team:string;name:string}[]>(`SELECT DISTINCT cache.player_id::text AS player_id,${teamSql} AS team,trim(cache.absent_teammate) AS name FROM public.ludo_wo_games_modal_cache cache WHERE cache.player_id=ANY($1::bigint[]) AND ${teamSql}=ANY($2::text[]) AND cache.absent_teammate IS NOT NULL LIMIT 8193`,targetIds,teams);
  if(catalogue.length>8192)return failed('Historial de ausencias excedido');
  const wanted=new Map(pending.map(v=>[v.p.playerId,v]));
  const aliases=catalogue.filter(r=>{const target=wanted.get(Number(r.player_id));return target?.row.team===r.team&&target.mates.some(m=>impactName(m.name)===impactName(r.name));});
  const gameIds=[...new Set(pending.flatMap(v=>(facts.get(v.p.playerId)??[]).filter(r=>String(r.game_date).slice(0,10)<nbaSlateDate(v.game.start,v.eventDate)).map(r=>gameKey(r.game_id)).filter(Boolean)))];
  const absences=aliases.length&&gameIds.length?await prisma.$queryRawUnsafe<{row:Record<string,any>}[]>(`WITH requested AS (SELECT item->>'player_id' AS player_id,item->>'team' AS team,item->>'name' AS name FROM jsonb_array_elements($1::jsonb) item) SELECT jsonb_build_object('player_id',cache.player_id::text,'game_id',cache.game_id,'team_abbreviation',${teamSql},'absent_teammate',cache.absent_teammate,'absent_status',to_jsonb(cache)->>'absent_status') AS row FROM public.ludo_wo_games_modal_cache cache JOIN requested r ON cache.player_id=r.player_id::bigint AND ${teamSql}=r.team AND trim(cache.absent_teammate)=r.name WHERE ltrim(cache.game_id::text,'0')=ANY($2::text[]) LIMIT 20001`,JSON.stringify(aliases),gameIds):[];
  if(absences.length>20000)return failed('Historial de ausencias excedido');
  const byPlayer=new Map<number,Record<string,any>[]>();for(const {row} of absences){const id=Number(row.player_id),list=byPlayer.get(id)??[];list.push(row);byPlayer.set(id,list);}
  for(const v of pending){
   const own=facts.get(v.p.playerId);if(!own){v.row.status='unavailable';v.row.reason='Histórico sin verificar';continue;}
   for(const mate of v.mates){const teammate=facts.get(mate.playerId!);if(!teammate){v.row.status='unavailable';v.row.reason='Histórico sin verificar';v.row.items=[];break;}
    const canonical=getCurrentRosterPlayer(mate.playerId!)!;
    v.row.items.push(automaticImpact(own,teammate,byPlayer.get(v.p.playerId)??[],{playerId:v.p.playerId,mode:'current',team:v.row.team,market:request.market,scope:'FULL',side:'over',line:.5,asOfDate:nbaSlateDate(v.game.start,v.eventDate),phase:'ALL',season:'all',lastN:1000,opponent:null,homeAway:null,minMinutes:null,thresholds:[]},{playerId:mate.playerId!,name:canonical.full_name,reportAt:mate.reportAt}));
   }
   v.row.items.sort((a,b)=>b.withoutCount-a.withoutCount||a.name.localeCompare(b.name));
  }
  return result;
 }catch{return failed('No se pudo verificar el histórico de ausencias');}
}
