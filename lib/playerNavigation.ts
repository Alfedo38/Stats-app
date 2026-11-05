import {isDate,TEAMS,MARKETS,emptyLeg,type Leg,type Market,type TicketDocument,type Book} from './ticketReader/model';
import {normalizedEvent,oddsBook,oddsScope,oddsMarket,quoteEvent,priceAt,type PriceQuote} from './nbaOdds';
export type GameContext={away:string;home:string;date:string;start?:string;returnTo:string};
export const PAGE_MARKETS:Record<string,Market>={pts:'PTS',reb:'REB',ast:'AST',pra:'PRA',pr:'PR',pa:'PA',ra:'RA','pts+reb+ast':'PRA','pts+reb':'PR','pts+ast':'PA','reb+ast':'RA',fgm:'FGM',fga:'FGA',fg3m:'3PT','3ptm':'3PT','3pt':'3PT','3pm':'3PT',fg3a:'3PA','3pta':'3PA',ftm:'FTM',fta:'FTA',stl:'STL',blk:'BLK',tov:'TO',to:'TO','stl+blk':'STL+BLK',stl_blk:'STL+BLK'};
const id=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0||typeof v==='string'&&/^[1-9]\d{0,12}$/.test(v)&&Number.isSafeInteger(Number(v));
export function gamePair(raw:unknown):string[]{const pair=String(raw??'').toUpperCase().split('-');return pair.length===2&&pair.every(t=>TEAMS.includes(t))&&pair[0]!==pair[1]?pair:[];}
export function validStart(raw:unknown,date:string):string|undefined {
 if(typeof raw!=='string'||raw.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(raw)||!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)||!Number.isFinite(Date.parse(raw)))return;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(raw));
 return ['year','month','day'].map(k=>day.find(p=>p.type===k)?.value).join('-')===date?raw:undefined;
}
export function matchupHref(away:string,home:string,date:string,start?:string,filters?:URLSearchParams){
 if(!gamePair(`${away}-${home}`).length||!isDate(date))return '/';
 const q=new URLSearchParams({date});if(validStart(start,date))q.set('start',start!);
 for(const key of ['season','phase','last','homeAway']){const v=filters?.get(key);if(v&&v.length<=32&&/^[\w .-]+$/.test(v))q.set(key,v);}
 return `/partidos/${away}-${home}?${q}`;
}
export function safeJornadaReturn(value:unknown):string|null {
 if(typeof value!=='string'||value.length>650||!value.startsWith('/trending?')||/[\\\r\n]/.test(value))return null;
 const u=new URL(value,'https://local.invalid'),p=u.searchParams,q=new URLSearchParams();
 if(u.pathname!=='/trending'||u.origin!=='https://local.invalid'||!isDate(p.get('date')))return null;
 q.set('date',p.get('date')!);
 for(const [key,pattern] of Object.entries({game:/^\d{1,15}$/,slate:/^nba$/,market:/^[a-z0-9_]{1,12}$/,side:/^(over|under)$/,book:/^(all|betano|bet365|stake)$/,n:/^(5|10)$/,mode:/^prices$/,minimum:/^(5|10)$/,only:/^1$/,sort:/^(rate|average|minutes)$/})){
  const v=p.get(key);if(v&&pattern.test(v))q.set(key,v);
 }
 const search=p.get('search')?.trim();if(search&&search.length<=100)q.set('search',search);
 return '/trending?'+q;
}
export function parseGameContext(params:Pick<URLSearchParams,'get'>):GameContext|null {
 const pair=gamePair(params.get('game')),date=params.get('date');if(!pair.length||!isDate(date))return null;
 const start=validStart(params.get('start'),date);let filters:URLSearchParams|undefined;
 const from=params.get('from');
 if(from&&from.length<=1200&&!/[\\\r\n]/.test(from)&&from.startsWith(`/partidos/${pair.join('-')}?`)){
  const u=new URL(from,'https://local.invalid');if(u.origin==='https://local.invalid'&&u.pathname===`/partidos/${pair.join('-')}`&&u.searchParams.get('date')===date)filters=u.searchParams;
 }
 return {away:pair[0],home:pair[1],date,start,returnTo:safeJornadaReturn(from)??matchupHref(pair[0],pair[1],date,start,filters)};
}
export function putGameContext(params:URLSearchParams,context:GameContext|null){if(!context)return;params.set('game',`${context.away}-${context.home}`);params.set('date',context.date);if(context.start)params.set('start',context.start);params.set('from',context.returnTo);}
export function playerGameHref(playerId:number|string,context:GameContext|null,team?:string|null){
 if(!id(playerId))return '/';const q=new URLSearchParams();if(context&&(!team||[context.away,context.home].includes(team)))putGameContext(q,context);
 return `/players/${playerId}${q.size?'?'+q:''}`;
}
export function safePlayerHref(value:unknown):string|null {
 if(typeof value!=='string'||value.length>1800||!/^\/players\/[1-9]\d{0,12}(?:\?|$)/.test(value)||/[\\\r\n]/.test(value))return null;
 const u=new URL(value,'https://local.invalid');if(u.origin!=='https://local.invalid'||!/^\/players\/[1-9]\d{0,12}$/.test(u.pathname))return null;
 const q=new URLSearchParams();putGameContext(q,parseGameContext(u.searchParams));
 for(const key of ['stat','line','n','scope','side','opponent','homeAway','min','wo','phase','absenceScope','absenceTeam','compare','defSeason','defWindow','defPosition','defBand','vista']){const v=u.searchParams.get(key);if(v&&v.length<=100)q.set(key,v);}
 for(const v of u.searchParams.getAll('absent').slice(0,8))if(v.length<=100)q.append('absent',v);
 return u.pathname+(q.size?'?'+q:'');
}
export function selectionPlayerHref(leg:Leg){
 if(!id(leg.playerId))return '/analizar-ticket';const stat=Object.entries(PAGE_MARKETS).find(([,market])=>market===leg.market)?.[0]??'pts';
 const q=new URLSearchParams({stat,scope:leg.scope,side:leg.operator==='under'||leg.operator==='at_most'?'under':'over'});
 const line=leg.line===null?null:leg.operator==='at_least'?leg.line-.5:leg.operator==='at_most'?leg.line+.5:leg.line;
 if(line!==null&&line>0)q.set('line',String(line));if(leg.teams.length===2&&isDate(leg.eventDate))putGameContext(q,{away:leg.teams[0],home:leg.teams[1],date:leg.eventDate,returnTo:matchupHref(leg.teams[0],leg.teams[1],leg.eventDate)});
 return `/players/${leg.playerId}?${q}`;
}
export function contextualOddsEvent(rows:PriceQuote[],context:GameContext){
 return rows.find(q=>q.event_date===context.date&&normalizedEvent(q.matchup)===normalizedEvent(`${context.away}-${context.home}`))?quoteEvent(rows.find(q=>q.event_date===context.date&&normalizedEvent(q.matchup)===normalizedEvent(`${context.away}-${context.home}`))!):'';
}
export function eventFromQuotes(rows:PriceQuote[]):GameContext|null {
 const choices=new Map<string,GameContext>();
 for(const q of rows){const pair=gamePair(normalizedEvent(q.matchup)),date=q.event_date;if(!pair.length||!isDate(date))continue;choices.set(`${pair.join('-')}:${date}`,{away:pair[0],home:pair[1],date,returnTo:matchupHref(pair[0],pair[1],date)});}
 return choices.size===1?[...choices.values()][0]:null;
}
export function selectionFromPage(input:{playerId:number|string;playerName:string;team?:string|null;stat:string;scope:Leg['scope'];side:'over'|'under';line:number;context:GameContext|null;date:string;book?:string|null;quotes:PriceQuote[]},now=new Date()):Leg {
 const market=PAGE_MARKETS[input.stat];if(!id(input.playerId)||!input.playerName.trim()||input.playerName.length>100||!market||!Number.isFinite(input.line)||input.line<0||input.line>300||!isDate(input.context?.date??input.date)||!['FULL','Q1','H1','H2_REG'].includes(input.scope)||!['over','under'].includes(input.side))throw Error('SELECTION_INVALID');
 const date=input.context?.date??input.date,teams=input.context?[input.context.away,input.context.home]:[];
 const book=oddsBook(input.book) as Book|null;const compatible=input.quotes.filter(q=>q.event_date===date&&teams.length===2&&normalizedEvent(q.matchup)===normalizedEvent(teams.join('-'))&&oddsScope(q.scope)===input.scope&&oddsMarket(q.prop_type)===oddsMarket(input.stat)&&q.updated_at&&Number.isFinite(Date.parse(q.updated_at))&&Date.parse(q.updated_at)<=now.getTime());
 const selected=book?priceAt(compatible,book,input.line,input.side):null;
 return {...emptyLeg(date,book??'unknown'),playerName:input.playerName.trim(),playerId:Number(input.playerId),market,operator:input.side,line:input.line,scope:input.scope,teams,matchup:teams.join(' – '),playerTeam:input.team&&teams.includes(input.team)?input.team:undefined,teamSource:teams.length?'manual':undefined,teamConfirmed:false,odds:selected?.price??null,origin:'player-page',quoteCapturedAt:selected?.updatedAt??undefined,confirmed:false};
}
export function legIdentity(leg:Leg){const side=leg.operator==='at_least'?'over':leg.operator==='at_most'?'under':leg.operator;const threshold=leg.line===null?null:leg.operator==='at_least'?leg.line-.5:leg.operator==='at_most'?leg.line+.5:leg.line;return JSON.stringify([leg.playerId??leg.playerName.toLocaleLowerCase(),[...leg.teams].sort(),leg.eventDate,leg.market,leg.scope,side,threshold,leg.book]);}
export function mergeSelection(doc:TicketDocument,leg:Leg):{document:TicketDocument;duplicate:boolean}{
 if(doc.legs.length&&doc.eventDate!==leg.eventDate)throw Error('DRAFT_DATE_CONFLICT');const duplicate=doc.legs.find(l=>legIdentity(l)===legIdentity(leg));
 if(!duplicate&&doc.legs.length>=40)throw Error('DRAFT_FULL');
 return {document:{...doc,eventDate:leg.eventDate,totalOdds:null,legs:duplicate?doc.legs.map(l=>l.id===duplicate.id?{...leg,id:l.id}:l):[...doc.legs,leg]},duplicate:!!duplicate};
}
