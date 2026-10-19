export type OddsScope='FULL'|'Q1'|'H1'|'H2_REG';
export type PriceQuote={player_name:string;prop_type:string;line:number|null;matchup:string|null;over_price:number|null;under_price:number|null;updated_at:string|null;book?:string|null;source?:string|null;scope?:string|null;event_key?:string|null;event_date?:string|null};
export const PRICE_BOOKS=[{key:'bet365',label:'365'},{key:'betano',label:'Bto'},{key:'stake',label:'Ste'}] as const;
const norm=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function oddsBook(v:unknown):string|null{const s=norm(v).replace(/[^a-z0-9]/g,'');return s==='365'||s.startsWith('bet365')?'bet365':s==='bto'||s.startsWith('betano')?'betano':s==='ste'||s.startsWith('stake')?'stake':null;}
export function oddsMarket(v:unknown):string|null{
 const s=norm(v).replace(/[^a-z0-9+]/g,'').toUpperCase();
 const aliases:Record<string,string>={PTS:'PTS',POINTS:'PTS',PUNTOS:'PTS',REB:'REB',REBOUNDS:'REB',REBOTES:'REB',AST:'AST',ASSISTS:'AST',ASISTENCIAS:'AST',FGM:'FGM',FGA:'FGA',FG3M:'3PTM','3PT':'3PTM','3PM':'3PTM','3PTM':'3PTM',THREEPM:'3PTM',FG3A:'3PTA','3PA':'3PTA','3PTA':'3PTA',THREEPA:'3PTA',PR:'PR','PTS+REB':'PR',PTSREB:'PR',RP:'PR',PA:'PA','PTS+AST':'PA',PTSAST:'PA',AP:'PA',RA:'RA','REB+AST':'RA',REBAST:'RA',AR:'RA',PRA:'PRA','PTS+REB+AST':'PRA',PTSREBAST:'PRA',STL:'STL',STEALS:'STL',BLK:'BLK',BLOCKS:'BLK',STLBLK:'STL_BLK','STL+BLK':'STL_BLK',STOCKS:'STL_BLK',TOV:'TOV',TO:'TOV',TURNOVERS:'TOV',PF:'PF',FOULS:'PF',FTA:'FTA',FTM:'FTM'};
 return aliases[s]??null;
}
export function oddsScope(v:unknown):OddsScope|null{const s=(String(v??'FULL').trim().toUpperCase().replace(/[\s-]+/g,'_')||'FULL');return ['FULL','FULL_GAME','GAME','MATCH','PARTIDO'].includes(s)?'FULL':['Q1','1Q','1ST_QUARTER'].includes(s)?'Q1':['H1','1H','1ST_HALF'].includes(s)?'H1':['H2_REG','2H_REG','2ND_HALF_REG'].includes(s)?'H2_REG':null;}
export function oddsNumber(v:unknown){if(v==null||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
export function decimalPrice(v:unknown){const n=oddsNumber(v);return n!==null&&n>1?n:null;}
const TEAMS:Record<string,string[]>={ATL:['atl','atlanta hawks','hawks'],BOS:['bos','boston celtics','celtics'],BKN:['bkn','brooklyn nets','nets'],CHA:['cha','charlotte hornets','hornets'],CHI:['chi','chicago bulls','bulls'],CLE:['cle','cleveland cavaliers','cavaliers'],DAL:['dal','dallas mavericks','mavericks'],DEN:['den','denver nuggets','nuggets'],DET:['det','detroit pistons','pistons'],GSW:['gsw','golden state warriors','warriors'],HOU:['hou','houston rockets','rockets'],IND:['ind','indiana pacers','pacers'],LAC:['lac','la clippers','los angeles clippers','clippers'],LAL:['lal','la lakers','los angeles lakers','lakers'],MEM:['mem','memphis grizzlies','grizzlies'],MIA:['mia','miami heat','heat'],MIL:['mil','milwaukee bucks','bucks'],MIN:['min','minnesota timberwolves','timberwolves'],NOP:['nop','new orleans pelicans','pelicans'],NYK:['nyk','new york knicks','knicks'],OKC:['okc','oklahoma city thunder','thunder'],ORL:['orl','orlando magic','magic'],PHI:['phi','philadelphia 76ers','76ers'],PHX:['phx','phoenix suns','suns'],POR:['por','portland trail blazers','trail blazers'],SAC:['sac','sacramento kings','kings'],SAS:['sas','san antonio spurs','spurs'],TOR:['tor','toronto raptors','raptors'],UTA:['uta','utah jazz','jazz'],WAS:['was','washington wizards','wizards']};
export function normalizedEvent(raw:unknown){const text=' '+norm(raw).replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ')+' ';const teams=Object.entries(TEAMS).filter(([,aliases])=>aliases.some(alias=>text.includes(' '+alias+' '))).map(([team])=>team).sort();return teams.length===2?teams.join('-'):norm(raw).replace(/[^a-z0-9]/g,'')||'sin-partido';}
export function quoteEvent(q:PriceQuote){return q.event_key||normalizedEvent(q.matchup);}
// No se puede comparar una cuota antigua o sin fecha con el próximo partido.
export function selectUpcomingOddsEvent(rows:PriceQuote[],preferredDate?:string|null,now=new Date()):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
 const today=`${part('year')}-${part('month')}-${part('day')}`;
 const dateOnly=(value:unknown)=>{
  const date=String(value??'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const parsed=new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
 };
 const events=new Map<string,{key:string;date:string}>();
 for(const row of rows){
  const date=dateOnly(row.event_date);
  if(!date||date<today)continue;
  const key=quoteEvent(row);
  events.set(key,{key,date});
 }
 const upcoming=[...events.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
 const preferred=dateOnly(preferredDate);
 return (preferred&&preferred>=today?upcoming.find(event=>event.date===preferred)?.key:null)??upcoming[0]?.key??'';
}
export function quoteMatches(q:PriceQuote,market:string,scope:OddsScope){return oddsMarket(q.prop_type)===oddsMarket(market)&&oddsMarket(market)!==null&&oddsScope(q.scope)===scope;}
export function comparableQuotes(rows:PriceQuote[],market:string,scope:OddsScope,event:string){return rows.filter(q=>quoteMatches(q,market,scope)&&quoteEvent(q)===event&&oddsBook(q.book??(q.source==='legacy'?'stake':null))!==null);}
function quoteTime(value:unknown){if(value==null||value==='')return '';const date=value instanceof Date?value:new Date(String(value));return Number.isFinite(date.getTime())?date.toISOString():String(value);}
export function priceAt(rows:PriceQuote[],book:string,line:number,side:'over'|'under'){
 const quotes=rows.filter(q=>oddsBook(q.book??(q.source==='legacy'?'stake':null))===book&&oddsNumber(q.line)!==null&&Math.abs(Number(q.line)-line)<1e-8).sort((a,b)=>quoteTime(b.updated_at).localeCompare(quoteTime(a.updated_at)));
 const quote=quotes[0];if(!quote)return null;const price=decimalPrice(side==='over'?quote.over_price:quote.under_price);return price===null?null:{price,updatedAt:quoteTime(quote.updated_at)||null};
}
export function groupUniversalQuotes(rows:Record<string,any>[]):PriceQuote[]{
 const grouped=new Map<string,PriceQuote>(),seenSides=new Set<string>();
 for(const row of [...rows].sort((a,b)=>quoteTime(b.scraped_at_utc).localeCompare(quoteTime(a.scraped_at_utc)))){
  const book=oddsBook(row.book),market=oddsMarket(row.stat_key),scope=oddsScope(row.period_scope??row.period??row.scope??row.market_scope),line=oddsNumber(row.model_line??row.threshold),price=decimalPrice(row.odds_decimal);
  if(!book||!market||!scope||line===null||line<0||!['over','under'].includes(String(row.side).toLowerCase()))continue;
  const event=normalizedEvent(row.game_norm||row.partido);
  const date=String(row.event_date??row.game_date??row.start_time??'').slice(0,10)||null;
  const eventKey=`${event}|${date??''}`;
  const key=`${book}|${eventKey}|${scope}|${market}|${line}`;
  const quote=grouped.get(key)??{player_name:row.jugador??row.player_norm??'',prop_type:market,line,matchup:row.partido||row.game_norm||null,over_price:null,under_price:null,updated_at:quoteTime(row.scraped_at_utc)||null,book,scope,event_key:eventKey,event_date:date,source:'universal'};
  const field=String(row.side).toLowerCase()==='over'?'over_price':'under_price';
  const sideKey=`${key}|${field}`;if(!seenSides.has(sideKey)){quote[field]=price;seenSides.add(sideKey);}
  grouped.set(key,quote);
 }
 return [...grouped.values()];
}
