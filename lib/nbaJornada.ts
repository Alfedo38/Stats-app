import {finiteStat, selectionOutcome, selectionSummary} from './selectionStats';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {oddsMarket, oddsScope, oddsBook, type PriceQuote} from './nbaOdds';
import {selectQuote} from './ticketReader/quoteMatch';
import {isDate, TEAMS, emptyLeg, type Book} from './ticketReader/model';
import {matchupHref, playerGameHref, selectionFromPage, type GameContext} from './playerNavigation';
import {getMinutesValue} from './formatters';
import {historySeasons,twoSeasonRows} from './nbaHistoryWindow';
import {getOpponent} from './playerUtils';
import {gamePhase} from './nbaGameFilters';

export const JORNADA_MARKETS = {
  pts:'Puntos', reb:'Rebotes', ast:'Asistencias', fg3m:'Triples anotados',
  pra:'PRA', pr:'Puntos + rebotes', pa:'Puntos + asistencias', ra:'Rebotes + asistencias',
  fga:'Tiros de campo intentados', fg3a:'Triples intentados', fta:'Tiros libres intentados',
} as const;
export type JornadaMarket = keyof typeof JORNADA_MARKETS;
export type JornadaGame = {id:string; away:string; home:string; start:string|null; status:number|null; eventDate?:string};
export type JornadaQuote = PriceQuote & {overCapturedAt:string|null;underCapturedAt:string|null};
export type JornadaPlayer = {id:number; name:string; team:string; opponent:string; gameId:string; position:string|null;
  values:(number|null)[]; minutes:(number|null)[]; dates:string[]; opponents?:(string|null)[]; rivalValues?:(number|null)[]; extended?:{season:string;seasonValues:(number|null)[];h2hValues:(number|null)[]}; seasons:string[]; quotes:JornadaQuote[]};
export type JornadaData = {ok:true; date:string; market:JornadaMarket; generatedAt:string; rosterAt:string;
  archiveId:string|null; history:'ready'|'unavailable'; quotes:'ready'|'unavailable'|'limited';
  games:JornadaGame[]; players:JornadaPlayer[]; warnings:string[]};
export const BOOK_LABELS:Record<string,string> = {bet365:'bet365',betano:'Betano',stake:'Stake'};
export const marketIsValid = (s:unknown):s is JornadaMarket => typeof s==='string'&&Object.hasOwn(JORNADA_MARKETS,s);
export function argDate(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(k=>parts.find(x=>x.type===k)!.value).join('-');
}
export function plusDays(date:string,n:number){return new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function jornadaDateAllowed(date:unknown,now=new Date()):date is string{return isDate(date)&&date>=plusDays(argDate(now),-30)&&date<=plusDays(argDate(now),7);}
export function normalizedGame(row:Record<string,unknown>,date:string):JornadaGame|null {
  const id=String(row.nba_game_id??''),away=String(row.away??''),home=String(row.home??'');
  if(!/^\d{1,15}$/.test(id)||!TEAMS.includes(away)||!TEAMS.includes(home)||away===home||row.postponed===true)return null;
  const start=row.start_utc instanceof Date?row.start_utc.toISOString():String(row.start_utc??'');
  const valid=/^\d{4}-\d{2}-\d{2}T/.test(start)&&/(?:Z|[+-]\d{2}:\d{2})$/.test(start)&&Number.isFinite(Date.parse(start))&&argDate(new Date(start))===date;
  const status=finiteStat(row.status_id);
  return {id,away,home,start:valid?new Date(start).toISOString():null,status:status===null?null:Math.trunc(status)};
}
type Row = Record<string,unknown>;
function gameId(row:Row){const raw=String(row.game_id??'');return /^\d{1,15}$/.test(raw)?String(Number(raw)):null;}
export function recentSample(rows:unknown,playerId:number,date:string,market:JornadaMarket,limit=10){
  const fields:Record<string,string[]>={pra:['pts','reb','ast'],pr:['pts','reb'],pa:['pts','ast'],ra:['reb','ast']};
  const valid=twoSeasonRows((Array.isArray(rows)?rows:[]),date).filter((row):row is Row=>!!row&&typeof row==='object'&&!Array.isArray(row))
    .filter(r=>Number(r.player_id)===playerId&&isDate(String(r.game_date??'').slice(0,10))&&String(r.game_date).slice(0,10)<date&&gameId(r)!==null)
    .filter(r=>gamePhase(r)==='Regular Season'||gamePhase(r)==='Playoffs')
    .filter(r=>oddsScope(r.period_scope??'FULL')==='FULL')
    .filter(r=>{const min=getMinutesValue(r);return min===null||min>0;})
    .sort((a,b)=>String(b.game_date).localeCompare(String(a.game_date))||Number(b.game_id)-Number(a.game_id));
  const unique=new Map<string,Row>();
  for(const row of valid)if(!unique.has(gameId(row)!))unique.set(gameId(row)!,row);
  const chosen=[...unique.values()].slice(0,limit);
  return {values:chosen.map(r=>{const parts=(fields[market]??[market]).map(k=>finiteStat(r[k]));return parts.every(v=>v!==null)?parts.reduce<number>((s,v)=>s+v!,0):null;}),
    minutes:chosen.map(r=>getMinutesValue(r)),dates:chosen.map(r=>String(r.game_date).slice(0,10)),
    opponents:chosen.map(r=>{const t=getOpponent(r);return TEAMS.includes(t)&&t!==String(r.team_abbreviation??"").trim().toUpperCase()?t:null;}),
    seasons:[...new Set(chosen.map(r=>String(r.season_year??r.season??r.season_id??'')).filter(Boolean))]};
}
export function extendedSample(rows:unknown,playerId:number,date:string,market:JornadaMarket,opponent:string){
  const season=historySeasons(date)[0];
  const sample=recentSample(rows,playerId,date,market,Infinity);
  const start=season.slice(0,4)+'-10-01';
  return {season,seasonValues:sample.values.filter((_,i)=>sample.dates[i]>=start),
    h2hValues:sample.values.filter((_,i)=>sample.opponents[i]===opponent)};
}
export function summaryFor(player:JornadaPlayer,n:5|10,line:number|null,side:'over'|'under'){
  return {stat:selectionSummary(player.values.slice(0,n),line??NaN,side),minutes:selectionSummary(player.minutes.slice(0,n),NaN,'over')};
}
export function contextFor(game:JornadaGame,date:string):GameContext{return {away:game.away,home:game.home,date,...(game.start?{start:game.start}:{}),returnTo:matchupHref(game.away,game.home,date,game.start??undefined)};}
export function jornadaPlayerHref(player:JornadaPlayer,game:JornadaGame,date:string,market:JornadaMarket,line:number|null,side:'over'|'under',sample:5|10=10,book?:string|null,returnTo?:string){
  const href=playerGameHref(player.id,contextFor(game,date)),q=new URLSearchParams(href.split('?')[1]);
  if(returnTo)q.set('from',returnTo);
  q.set('stat',market);q.set('scope','FULL');q.set('side',side);q.set('n',String(sample));if(book&&quoteAt(player,book,line,side))q.set('book',book);if(line!==null)q.set('line',String(line));
  return href.split('?')[0]+'?'+q;
}
export function jornadaLeg(player:JornadaPlayer,game:JornadaGame,date:string,market:JornadaMarket,line:number,side:'over'|'under',book:string|null,now=new Date()){
  if(!validJornadaLine(line))throw Error('LINE_REQUIRED');
  const quotes=player.quotes.map(q=>({...q,updated_at:side==='over'?q.overCapturedAt:q.underCapturedAt}));
  return selectionFromPage({playerId:player.id,playerName:player.name,team:player.team,stat:market,scope:'FULL',side,line,context:contextFor(game,date),date,book,quotes},now);
}
// Check player identity before calling the same strict price matcher as the analyzer.
export function jornadaQuotes(rows:Row[],name:string,game:JornadaGame,date:string,market:JornadaMarket,now=new Date()):JornadaQuote[]{
  const own=rows.filter(r=>canonicalOddsPlayerName(r.jugador||r.player_norm)===canonicalOddsPlayerName(name));
  const lines=new Set<number>();
  for(const row of own){
    if(oddsMarket(row.stat_key)!==oddsMarket(market)||oddsScope(row.period_scope??row.period??row.scope??row.market_scope)!=='FULL')continue;
    const value=finiteStat(row.model_line??row.threshold),op=String(row.side??'').toLowerCase();
    if(value===null)continue;
    const line=op==='at_least'?Math.ceil(value)-.5:op==='at_most'?Math.floor(value)+.5:value;
    if(line>0&&line<=300)lines.add(line);
  }
  const quotes:JornadaQuote[]=[];
  for(const line of [...lines].sort((a,b)=>a-b))for(const book of ['bet365','betano','stake'] as const){
    const leg={...emptyLeg(date,book),playerName:name,teams:[game.away,game.home],market:({fg3m:'3PT',fg3a:'3PA'} as Record<string,string>)[market]??market.toUpperCase(),scope:'FULL',line};
    const over=selectQuote(own,{...leg,operator:'over'} as Parameters<typeof selectQuote>[1],now),under=selectQuote(own,{...leg,operator:'under'} as Parameters<typeof selectQuote>[1],now);
    // Exclude impossible future captures even within the analyzer's clock tolerance.
    const usable=(q:typeof over)=>q.status==='matched'&&!!q.capturedAt&&Date.parse(q.capturedAt)<=now.getTime();
    if(!usable(over)&&!usable(under))continue;
    quotes.push({player_name:name,prop_type:oddsMarket(market)!,scope:'FULL',line,matchup:game.away+' @ '+game.home,event_date:date,book,
      over_price:usable(over)?over.price!:null,under_price:usable(under)?under.price!:null,
      updated_at:usable(over)?over.capturedAt!:under.capturedAt!,
      overCapturedAt:usable(over)?over.capturedAt!:null,underCapturedAt:usable(under)?under.capturedAt!:null});
  }
  return quotes;
}
export function availableLines(player:JornadaPlayer,book:string,side:'over'|'under'){
  const field=side==='over'?'over_price':'under_price';
  return [...new Set(player.quotes.filter(q=>(book==='all'||oddsBook(q.book)===book)&&finiteStat(q[field])!==null&&Number(q[field])>1).map(q=>q.line!))].sort((a,b)=>a-b);
}
export const JORNADA_MIN_LINE=0.5;
export const JORNADA_MAX_LINE=299.5;
export function validJornadaLine(line:number|null):line is number{
  return line!==null&&line>=JORNADA_MIN_LINE&&line<=JORNADA_MAX_LINE&&Number.isInteger(line-0.5);
}
export function defaultLine(player:JornadaPlayer){
  const average=selectionSummary(player.values.slice(0,10),NaN,'over').average;
  // Nearest half-point on the 0.5, 1.5, … grid. At a tie, use the higher line.
  return average===null?null:Math.min(JORNADA_MAX_LINE,Math.floor(average)+0.5);
}
export function publishedJornadaLine(player:JornadaPlayer,book:string,side:'over'|'under',requested?:number|null){
  const lines=availableLines(player,book,side).filter(validJornadaLine);
  if(requested!=null&&lines.includes(requested))return requested;
  const reference=defaultLine(player);
  return lines.sort((a,b)=>reference===null?a-b:Math.abs(a-reference)-Math.abs(b-reference)||a-b)[0]??null;
}
export function quoteAt(player:JornadaPlayer,book:string,line:number|null,side:'over'|'under'){
  const field=side==='over'?'over_price':'under_price';
  const quote=player.quotes.find(q=>q.book===book&&q.line===line&&Number(q[field])>1);
  return quote?{price:Number(quote[field]),capturedAt:side==='over'?quote.overCapturedAt:quote.underCapturedAt}:null;
}

/** The published archive summary contains at most ten rows per player. */
export function jornadaEvidence(player:JornadaPlayer,line:number|null,side:'over'|'under'){
  const threshold=line??NaN, values=player.values.slice(0,10);
  const recentRival=values.filter((_,i)=>player.opponents?.[i]===player.opponent);
  const rivalSource=recentRival.length?'recent':player.rivalValues!==undefined?'rival':'unavailable';
  const rival=recentRival.length?recentRival:player.rivalValues?.slice(0,5)??[];
  const dots=values.map(value=>selectionOutcome(value,threshold,side));
  let streak=0;
  for(const outcome of dots){if(outcome!=='hit')break;streak++;}
  return {l5:selectionSummary(values.slice(0,5),threshold,side),
    l10:selectionSummary(values,threshold,side),rival:selectionSummary(rival,threshold,side),rivalSource,
    dots,streak};
}
export function bestJornadaPrice(player:JornadaPlayer,line:number|null,side:'over'|'under',books=Object.keys(BOOK_LABELS)){
  const prices=books.map(book=>quoteAt(player,book,line,side)?.price??null).filter((n):n is number=>n!==null);
  return prices.length>1?Math.max(...prices):null;
}
