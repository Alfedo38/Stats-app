import {canonicalOddsPlayerName,matchesOddsPlayer} from '../oddsPlayerNames';
import {normalizedEvent,oddsBook,oddsMarket,oddsScope} from '../nbaOdds';
import {decimal,isDate,type Leg,type Operator,type QuoteInfo} from './model';

type Row=Record<string,unknown>;
function scopeOf(row:Row){const values=[row.period_scope,row.period,row.scope,row.market_scope].filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(oddsScope);return values.length?values.every(v=>v!==null&&v===values[0])?values[0]:null:'FULL';}
function iso(value:unknown){if(value===null||value===undefined||String(value).trim()==='')return null;const d=value instanceof Date?value:new Date(String(value));return Number.isNaN(d.getTime())?null:d.toISOString();}
function dateOf(row:Row){const date=row.event_date??row.game_date;if(date instanceof Date)return date.toISOString().slice(0,10);const raw=String(date??'');if(isDate(raw.slice(0,10)))return raw.slice(0,10);const time=iso(row.start_time??row.start_utc);if(!time)return null;const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');}
// All supported markets count integer events. Preserve pushes: over 20 is NOT 20+.
export function settlementKey(line:number,operator:Operator){
 if(!Number.isFinite(line)||line<0)return null;const push=Number.isInteger(line)&&(operator==='over'||operator==='under')?line:null;
 if(operator==='over')return `gte:${Math.floor(line)+1}|push:${push}`;
 if(operator==='at_least')return `gte:${Math.ceil(line)}|push:null`;
 if(operator==='under')return `lte:${Math.ceil(line)-1}|push:${push}`;
 return `lte:${Math.floor(line)}|push:null`;
}
export function selectQuote(rows:Row[],leg:Leg,now=new Date()):QuoteInfo{
 if(leg.book==='unknown')return {status:'not_found',message:'Elegí la casa para buscar la cuota individual.'};
 const event=[...leg.teams].sort().join('-'),wanted=leg.line!==null&&leg.operator?settlementKey(leg.line,leg.operator):null;
 const matches=rows.filter(r=>{
  if(r.league!=null&&String(r.league).toUpperCase()!=='NBA')return false;
  const side=String(r.side??'').toLowerCase();if(!['over','under','at_least','at_most'].includes(side))return false;
  const line=decimal(r.model_line??r.threshold);
  return oddsBook(r.book)===leg.book&&matchesOddsPlayer(r.jugador,r.player_norm,leg.playerName)&&canonicalOddsPlayerName(leg.playerName)!==''&&dateOf(r)===leg.eventDate&&normalizedEvent(r.game_norm||r.partido)===event&&scopeOf(r)===leg.scope&&oddsMarket(r.stat_key)===oddsMarket(leg.market)&&line!==null&&settlementKey(line,side as Operator)===wanted;
 }).map(row=>({row,time:iso(row.scraped_at_utc??row.updated_at)})).filter(x=>x.time!==null&&Date.parse(x.time)<=now.getTime()+300000).sort((a,b)=>b.time!.localeCompare(a.time!));
 if(!matches.length)return {status:'not_found',message:'No hay cuota individual publicada para esta casa, fecha, partido, mercado, período y línea.'};
 const latest=matches[0],same=matches.filter(x=>x.time===latest.time);
 if(same.some(x=>{const price=decimal(x.row.odds_decimal);return x.row.valid===false||x.row.active===false||x.row.bookmaker_is_active===false||price===null||price<=1;}))return {status:'inactive',message:'La última cotización coincide, pero está retirada o no tiene un precio válido.'};
 const prices=new Set(same.map(x=>decimal(x.row.odds_decimal)));
 if(prices.size!==1)return {status:'conflict',message:'Hay precios contradictorios con la misma fecha de captura. No se eligió una cuota.'};
 const price=decimal(latest.row.odds_decimal)!;
 return {status:'matched',price,book:leg.book,capturedAt:latest.time!,eventDate:leg.eventDate,line:decimal(latest.row.model_line??latest.row.threshold)!,side:String(latest.row.side),message:'Cuota individual consultada en las cuotas publicadas.'};
}
