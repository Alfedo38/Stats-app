import 'server-only';
import {mergeNbaSlate,nbaSlateDate} from './nbaSlate';
import prisma from './prisma';
import {archiveManifest,archivePart,archiveEnabled} from './nbaArchive';
import {getCurrentRosterPlayers,CURRENT_ROSTER_UPDATED_AT} from './currentRosters';
import {rosterFitsDate} from './ticketReader/teamContext';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {oddsMarket,publishedQuoteDate} from './nbaOdds';
import {normalizedGame,plusDays,recentSample,extendedSample,jornadaQuotes,type JornadaData,type JornadaMarket} from './nbaJornada';

const cache=new Map<string,{until:number;value:Promise<JornadaData>}>();
export class JornadaError extends Error {constructor(public code:string,public status:number,message:string){super(message);}}
export function getJornada(date:string,market:JornadaMarket):Promise<JornadaData>{
  const key=date+':'+market,old=cache.get(key);if(old&&old.until>Date.now())return old.value;
  const value=loadJornada(date,market),entry={until:Date.now()+60000,value};cache.set(key,entry);
  if(cache.size>24)cache.delete(cache.keys().next().value!);
  value.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});return value;
}
export async function getNbaSlateSchedule(date:string){
  const next=plusDays(date,1);
  const [a,b]=await Promise.all([getJornadaSchedule(date),getJornadaSchedule(next).catch(()=>null)]);
  return {games:mergeNbaSlate(date,[{date,games:a},{date:next,games:b??[]}]),partial:b===null};
}
export async function getNbaSlate(date:string,market:JornadaMarket):Promise<JornadaData>{
  const next=plusDays(date,1);
  const [a,b]=await Promise.all([getJornada(date,market),getJornada(next,market).catch(()=>null)]);
  const games=mergeNbaSlate(date,[{date,games:a.games},{date:next,games:b?.games??[]}]);
  const ids=(day:string)=>new Set(games.filter(g=>g.eventDate===day).map(g=>g.id));
  const left=ids(date),right=ids(next);
  const versionsMatch=!right.size||a.archiveId===b?.archiveId||!left.size;
  const players=[...a.players.filter(p=>left.has(p.gameId)),...(b?.players??[]).filter(p=>right.has(p.gameId))];
  return {...a,games,players:versionsMatch?players:players.map(p=>({...p,values:[],minutes:[],dates:[],opponents:[],rivalValues:undefined,extended:undefined,support:undefined,seasons:[]})),archiveId:versionsMatch?(left.size?a.archiveId:b?.archiveId??null):null,
   history:versionsMatch&&(!left.size||a.history==='ready')&&(!right.size||b?.history==='ready')?'ready':'unavailable',
   quotes:left.size&&a.quotes!=='ready'?a.quotes:right.size&&b?b.quotes:'ready',
   priceCoverage:players.some(p=>p.quotes.length)?'ready':(left.size&&a.priceCoverage==='unmatched'||right.size&&b?.priceCoverage==='unmatched')?'unmatched':'missing',
   warnings:[...new Set([...(left.size?a.warnings:[]),...(right.size?b?.warnings??[]:[]),...(b?[]:['No pudimos verificar los partidos de madrugada.']),...(versionsMatch?[]:['Cambió el archivo histórico durante la carga. Volvé a consultar la jornada.'])])]};
}
export async function getJornadaSchedule(date:string){
  let schedule:Record<string,unknown>[];
  try{schedule=await prisma.$queryRawUnsafe<Record<string,unknown>[]>(
    'SELECT nba_game_id,away,home,start_utc,status_id,postponed FROM public.nba_daily_schedule WHERE event_date=$1::date AND postponed=false ORDER BY start_utc,nba_game_id LIMIT 41',date);
  }catch{throw new JornadaError('SCHEDULE_UNAVAILABLE',503,'No pudimos consultar el calendario. Reintentá en un momento.');}
  if(schedule.length>40)throw new JornadaError('SCHEDULE_LIMIT',503,'El calendario necesita revisión. No se mezclaron partidos.');
  return [...new Map(schedule.map(row=>normalizedGame(row,date)).filter(g=>g!==null).map(g=>[g.id,g])).values()];
}
const restSchedules=new Map<string,{expires:number;games:Promise<Awaited<ReturnType<typeof getJornadaSchedule>>>}>();
function withRestSchedule(date:string){
 const old=restSchedules.get(date);if(old&&old.expires>Date.now())return old.games;
 const games=prisma.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT nba_game_id,away,home,start_utc,status_id,postponed,
   to_char(event_date,'YYYY-MM-DD') AS day FROM public.nba_daily_schedule
   WHERE event_date BETWEEN ($1::date - 2) AND ($1::date - 1) AND status_id=3 AND postponed=false LIMIT 81`,date)
  .then(rows=>rows.length>80?[]:rows.map(row=>normalizedGame(row,String(row.day))).filter(g=>g!==null))
  .catch(()=>[]);
 if(restSchedules.size>=24)restSchedules.delete(restSchedules.keys().next().value!);
 restSchedules.set(date,{expires:Date.now()+120000,games});return games;
}
async function loadJornada(date:string,market:JornadaMarket):Promise<JornadaData>{
  const games=await getJornadaSchedule(date);
  const data:JornadaData={ok:true,date,market,generatedAt:new Date().toISOString(),rosterAt:CURRENT_ROSTER_UPDATED_AT,archiveId:null,history:'ready',quotes:'ready',games,players:[],warnings:[]};
  if(!games.length)return data;
  if(!rosterFitsDate(date,CURRENT_ROSTER_UPDATED_AT)){
    data.warnings.push('El plantel de referencia no cubre esta fecha. Podés abrir los partidos; actualizá los planteles para ver sus jugadores.');return data;
  }
  let summary:Record<string,unknown>={}, rivalIndex:Record<string,Record<string,unknown>>|null=null, extendedIndex:Record<string,unknown>|null=null;
  const roster=getCurrentRosterPlayers([...new Set(games.flatMap(g=>[g.away,g.home]))]);
  const [historical,prices,rest]=await Promise.allSettled([
    (async()=>{if(!archiveEnabled())throw Error('DISABLED');const m=await archiveManifest();const s=await archivePart('summaries',m);if(!s?.recent||typeof s.recent!=='object'||Array.isArray(s.recent))throw Error('EMPTY');const extended=m.parts?.jornada_history_v2?await archivePart('jornada_history_v2',m).catch(()=>null):null;const rivals=!extended&&m.parts?.jornada_rivals_v1?await archivePart('jornada_rivals_v1',m).catch(()=>null):null;return {id:m.id,recent:s.recent,rivals,extended};})(),
    prisma.$queryRawUnsafe<{row:Record<string,unknown>}[]>(
      `SELECT to_jsonb(o) AS row
       FROM public.latest_player_prop_odds_cache o
       WHERE lower(btrim(stat_key))=ANY($1::text[])
       AND (left(nullif(to_jsonb(o)->>'event_date',''),10)=$2::text
         OR (nullif(to_jsonb(o)->>'event_date','') IS NULL AND
           (left(nullif(to_jsonb(o)->>'game_date',''),10)=$2::text
            OR left(COALESCE(nullif(to_jsonb(o)->>'start_time',''),nullif(to_jsonb(o)->>'start_utc','')),10)
              BETWEEN ($2::date - 1)::text AND ($2::date + 1)::text)))
       ORDER BY scraped_at_utc DESC LIMIT 12001`,marketAliases(market),date),
    withRestSchedule(date),
  ]);
  if(rest.status==='fulfilled')for(const g of games){
    if(!g.start)continue;const prior=plusDays(nbaSlateDate(g.start,date),-1);
    const teams=new Set(rest.value.filter(x=>x.start&&x.status===3&&nbaSlateDate(x.start,x.eventDate??date)===prior).flatMap(x=>[x.away,x.home]));
    g.backToBack=[g.away,g.home].filter(t=>teams.has(t));
  }
  if(historical.status==='fulfilled'){summary=historical.value.recent;rivalIndex=historical.value.rivals??null;extendedIndex=historical.value.extended??null;data.archiveId=historical.value.id;}
  else {data.history='unavailable';data.warnings.push('No pudimos leer el resumen histórico verificado. Las estadísticas quedan S/D.');}
  let quotes:Record<string,unknown>[]=[];
  if(prices.status==='fulfilled'&&prices.value.length<=12000)quotes=prices.value.map(r=>r.row).filter(r=>publishedQuoteDate(r)===date);
  else {data.quotes=prices.status==='fulfilled'?'limited':'unavailable';data.warnings.push('No pudimos verificar las cuotas de este mercado. Las selecciones pueden agregarse sin precio.');}
  const byName=new Map<string,Record<string,unknown>[]>(),counts=new Map<string,number>();
  for(const p of roster){const name=canonicalOddsPlayerName(p.full_name);counts.set(name,(counts.get(name)??0)+1);}
  for(const q of quotes){const key=canonicalOddsPlayerName(q.jugador||q.player_norm);const list=byName.get(key)??[];list.push(q);byName.set(key,list);}
  const now=new Date();
  for(const game of games)for(const p of roster.filter(p=>p.team_abbreviation===game.away||p.team_abbreviation===game.home)){
    const name=canonicalOddsPlayerName(p.full_name);
    const opponent=p.team_abbreviation===game.away?game.home:game.away;
    const cutoff=nbaSlateDate(game.start,date);
    const extended=extendedIndex===null?undefined:extendedSample(extendedIndex[String(p.player_id)],p.player_id,cutoff,market,opponent);
    const rivalValues=extended?extended.h2hValues.slice(0,5):rivalIndex===null?undefined:recentSample(rivalIndex[String(p.player_id)]?.[opponent],p.player_id,cutoff,market).values.slice(0,5);
    data.players.push({rivalValues,extended,id:p.player_id,name:p.full_name,team:p.team_abbreviation,opponent,position:p.position,gameId:game.id,
      ...recentSample(summary[String(p.player_id)],p.player_id,cutoff,market,10,true),quotes:counts.get(name)===1?jornadaQuotes(byName.get(name)??[],p.full_name,game,date,market,now):[]});
  }
  if(data.quotes==='ready')data.priceCoverage=data.players.some(p=>p.quotes.length)?'ready':quotes.length?'unmatched':'missing';
  return data;
}
function marketAliases(market:JornadaMarket){
  const aliases:Record<string,string[]>={pts:['pts','points','puntos'],reb:['reb','rebounds','rebotes'],ast:['ast','assists','asistencias'],fg3m:['fg3m','3pt','3pm','3ptm','threepm'],fg3a:['fg3a','3pa','3pta','threepa'],pra:['pra','pts+reb+ast','ptsrebast'],pr:['pr','pts+reb','ptsreb','rp'],pa:['pa','pts+ast','ptsast','ap'],ra:['ra','reb+ast','rebast','ar']};
  return (aliases[market]??[market]).filter(v=>oddsMarket(v)===oddsMarket(market));
}
