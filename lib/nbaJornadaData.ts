import 'server-only';
import {mergeNbaSlate,nbaSlateDate} from './nbaSlate';
import prisma from './prisma';
import {archiveManifest,archivePart,archiveEnabled} from './nbaArchive';
import {getCurrentRosterPlayers,CURRENT_ROSTER_UPDATED_AT} from './currentRosters';
import {rosterFitsDate} from './ticketReader/teamContext';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {oddsMarket,publishedQuoteDate,publishedQuoteScope,type OddsScope} from './nbaOdds';
import {normalizedGame,plusDays,recentJornadaRows,recentSample,extendedSample,jornadaQuotes,type JornadaData,type JornadaMarket} from './nbaJornada';
import {indexPeriodBoxes,periodBox,periodGameKey,periodSelection,recentPeriodGames,type PartialScope,type PeriodGame} from './nbaPeriodSample';

const cache=new Map<string,{until:number;value:Promise<JornadaData>}>();
export class JornadaError extends Error {constructor(public code:string,public status:number,message:string){super(message);}}
export function getJornada(date:string,market:JornadaMarket,scope:OddsScope='FULL'):Promise<JornadaData>{
  const key=date+':'+market+':'+scope,old=cache.get(key);if(old&&old.until>Date.now())return old.value;
  const value=loadJornada(date,market,scope),entry={until:Date.now()+60000,value};cache.set(key,entry);
  if(cache.size>24)cache.delete(cache.keys().next().value!);
  value.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});return value;
}
export async function getNbaSlateSchedule(date:string){
  const next=plusDays(date,1);
  const [a,b]=await Promise.all([getJornadaSchedule(date),getJornadaSchedule(next).catch(()=>null)]);
  return {games:mergeNbaSlate(date,[{date,games:a},{date:next,games:b??[]}]),partial:b===null};
}
export async function getNbaSlate(date:string,market:JornadaMarket,scope:OddsScope='FULL'):Promise<JornadaData>{
  const next=plusDays(date,1);
  const [a,b]=await Promise.all([getJornada(date,market,scope),getJornada(next,market,scope).catch(()=>null)]);
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
type PeriodIndex=ReturnType<typeof indexPeriodBoxes>;
const periodCache=new Map<string,{until:number;value:Promise<PeriodIndex>}>();
function jornadaPeriodBoxes(games:PeriodGame[],scope:PartialScope){
  if(!games.length)return Promise.resolve(new Map() as PeriodIndex);
  const byGame=new Map(games.map(g=>[periodGameKey(g),g]));
  const ids=[...byGame.keys()].sort();
  const key=scope+':'+ids.join(',');
  const old=periodCache.get(key);if(old&&old.until>Date.now())return old.value;
  const unique=ids.map(id=>byGame.get(id)!);
  const dates=unique.map(g=>g.date).sort();
  const wanted=unique.map(g=>({player_id:g.playerId,game_id:g.gameId,game_date:g.date}));
  const value=prisma.$queryRawUnsafe<{row:Record<string,unknown>}[]>(
    `SELECT to_jsonb(cache) AS row
     FROM public.player_period_splits_front_v2_cache cache
     JOIN jsonb_to_recordset($1::jsonb) AS wanted(player_id bigint,game_id text,game_date date)
       ON cache.player_id=wanted.player_id AND cache.game_date=wanted.game_date
       AND ltrim(cache.game_id::text,'0')=ltrim(wanted.game_id,'0')
     WHERE cache.split_code=ANY($2::text[]) AND cache.game_date BETWEEN $3::date AND $4::date
     LIMIT 10001`,JSON.stringify(wanted),scope==='H2_REG'?['H2','H2_REG']:[scope],dates[0],dates.at(-1)!
  ).then(rows=>{
    if(rows.length>10000)throw Error('PERIOD_ROWS_LIMIT');
    return indexPeriodBoxes(rows.map(r=>r.row),scope);
  });
  const entry={until:Date.now()+60000,value};
  if(periodCache.size>=12)periodCache.delete(periodCache.keys().next().value!);
  periodCache.set(key,entry);value.catch(()=>{if(periodCache.get(key)===entry)periodCache.delete(key);});
  return value;
}
async function loadJornada(date:string,market:JornadaMarket,scope:OddsScope):Promise<JornadaData>{
  const games=await getJornadaSchedule(date);
  const data:JornadaData={ok:true,date,market,scope,generatedAt:new Date().toISOString(),rosterAt:CURRENT_ROSTER_UPDATED_AT,archiveId:null,history:'ready',quotes:'ready',games,players:[],warnings:[]};
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
  if(prices.status==='fulfilled'&&prices.value.length<=12000)quotes=prices.value.map(r=>r.row).filter(r=>publishedQuoteDate(r)===date&&publishedQuoteScope(r)===scope);
  else {data.quotes=prices.status==='fulfilled'?'limited':'unavailable';data.warnings.push('No pudimos verificar las cuotas de este mercado. Las selecciones pueden agregarse sin precio.');}
  const byName=new Map<string,Record<string,unknown>[]>(),counts=new Map<string,number>();
  for(const p of roster){const name=canonicalOddsPlayerName(p.full_name);counts.set(name,(counts.get(name)??0)+1);}
  for(const q of quotes){const key=canonicalOddsPlayerName(q.jugador||q.player_norm);const list=byName.get(key)??[];list.push(q);byName.set(key,list);}
  const entries=games.flatMap(game=>roster.filter(p=>p.team_abbreviation===game.away||p.team_abbreviation===game.home).map(p=>{
    const id=String(p.player_id),cutoff=nbaSlateDate(game.start,date);
    const recent=[...(Array.isArray(summary[id])?summary[id]:[]),...(Array.isArray(extendedIndex?.[id])?extendedIndex[id]:[])];
    const periodGames=scope==='FULL'?[]:recentPeriodGames(recentJornadaRows(recent,p.player_id,cutoff,Infinity),p.player_id,cutoff);
    return {game,p,cutoff,recent,periodGames};
  }));
  const periodIndex=scope==='FULL'?null:await jornadaPeriodBoxes(entries.flatMap(e=>e.periodGames),scope).catch(()=>{
    data.history='unavailable';data.warnings.push('No pudimos verificar el histórico del período elegido. Los parciales quedan S/D.');
    return null;
  });
  const now=new Date();
  for(const {game,p,cutoff,recent,periodGames} of entries){
    const id=String(p.player_id),name=canonicalOddsPlayerName(p.full_name),opponent=p.team_abbreviation===game.away?game.home:game.away;
    const extended=scope==='FULL'&&extendedIndex!==null?extendedSample(extendedIndex[id],p.player_id,cutoff,market,opponent):undefined;
    const rivalValues=extended?extended.h2hValues.slice(0,5):scope==='FULL'&&rivalIndex!==null?recentSample(rivalIndex[id]?.[opponent],p.player_id,cutoff,market).values.slice(0,5):undefined;
    const sample=scope==='FULL'?recentSample(recent,p.player_id,cutoff,market,10,true):(()=>{
      const boxes=periodGames.map(g=>periodBox(periodIndex?.get(periodGameKey(g))??[],scope));
      return {values:boxes.map(b=>periodSelection(b,market)),minutes:boxes.map(b=>b.minutes),dates:periodGames.map(g=>g.date),seasons:[]};
    })();
    data.players.push({rivalValues,extended,id:p.player_id,name:p.full_name,team:p.team_abbreviation,opponent,position:p.position,gameId:game.id,
      ...sample,quotes:counts.get(name)===1?jornadaQuotes(byName.get(name)??[],p.full_name,game,date,market,now,scope):[]});
  }
  if(scope!=='FULL'&&data.history==='ready'&&data.players.length&&!data.players.some(p=>p.values.some(v=>v!==null))){
    data.warnings.push('Todavía no hay parciales con dato para este mercado y fecha.');
  }
  if(data.quotes==='ready')data.priceCoverage=data.players.some(p=>p.quotes.length)?'ready':quotes.length?'unmatched':'missing';
  return data;
}
function marketAliases(market:JornadaMarket){
  const aliases:Record<string,string[]>={pts:['pts','points','puntos'],reb:['reb','rebounds','rebotes'],ast:['ast','assists','asistencias'],fg3m:['fg3m','3pt','3pm','3ptm','threepm'],fg3a:['fg3a','3pa','3pta','threepa'],pra:['pra','pts+reb+ast','ptsrebast'],pr:['pr','pts+reb','ptsreb','rp'],pa:['pa','pts+ast','ptsast','ap'],ra:['ra','reb+ast','rebast','ar']};
  return (aliases[market]??[market]).filter(v=>oddsMarket(v)===oddsMarket(market));
}
