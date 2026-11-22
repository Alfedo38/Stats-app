import {canonicalOddsPlayerName,matchesOddsPlayer} from '../oddsPlayerNames';
import {oddsBook,oddsMarket,publishedQuoteDate,publishedQuoteScope,publishedQuoteEvent,publishedQuoteEnabled,publishedQuoteCapture} from '../nbaOdds';
import {decimal,type Leg,type Operator,type QuoteInfo} from './model';

type Row=Record<string,unknown>;
// All supported markets count integer events. Preserve pushes: over 20 is NOT 20+.
export function settlementKey(line:number,operator:Operator){
 if(!Number.isFinite(line)||line<0)return null;const push=Number.isInteger(line)&&(operator==='over'||operator==='under')?line:null;
 if(operator==='over')return `gte:${Math.floor(line)+1}|push:${push}`;
 if(operator==='at_least')return `gte:${Math.ceil(line)}|push:null`;
 if(operator==='under')return `lte:${Math.ceil(line)-1}|push:${push}`;
 return `lte:${Math.floor(line)}|push:null`;
}
export function selectQuote(rows:Row[],leg:Leg,now=new Date()):QuoteInfo{
 if(leg.book==='unknown')return {status:'not_found',message:'Elegí la casa para buscar la cuota individual.',diagnostic:{reason:'BOOK_REQUIRED'}};
 const market=oddsMarket(leg.market);
 if(!market)return {status:'not_found',message:'El mercado no tiene una correspondencia válida para buscar cuotas.',diagnostic:{reason:'INVALID_MARKET'}};
 const event=[...leg.teams].sort().join('-'),wanted=leg.line!==null&&leg.operator?settlementKey(leg.line,leg.operator):null;
 let candidates=rows.filter(r=>(r.league==null||String(r.league).trim().toUpperCase()==='NBA')&&oddsBook(r.book)===leg.book&&canonicalOddsPlayerName(leg.playerName)!==''&&matchesOddsPlayer(r.jugador,r.player_norm,leg.playerName));
 const counts={player:candidates.length,date:0,event:0,market:0,scope:0,line:0,timed:0};
 const missing=(reason:string,message:string):QuoteInfo=>({status:'not_found',message,diagnostic:{reason,counts}});
 if(!candidates.length)return missing('PLAYER_NOT_FOUND','No encontramos cuotas publicadas para este jugador en la casa elegida.');
 candidates=candidates.filter(r=>publishedQuoteDate(r)===leg.eventDate);counts.date=candidates.length;
 if(!candidates.length)return missing('DATE_MISMATCH','Hay cuotas del jugador, pero no corresponden a la fecha del ticket.');
 candidates=candidates.filter(r=>publishedQuoteEvent(r)===event);counts.event=candidates.length;
 if(!candidates.length)return missing('EVENT_MISMATCH','Hay cuotas para esta fecha, pero el partido no coincide con el ticket.');
 candidates=candidates.filter(r=>oddsMarket(r.stat_key)===market);counts.market=candidates.length;
 if(!candidates.length)return missing('MARKET_MISMATCH','Hay cuotas para este partido, pero no para el mercado elegido. Los intentos y anotados se buscan por separado.');
 candidates=candidates.filter(r=>publishedQuoteScope(r)===leg.scope);counts.scope=candidates.length;
 if(!candidates.length)return missing('SCOPE_MISMATCH','Las cuotas publicadas no corresponden al período elegido.');
 candidates=candidates.filter(r=>{const side=String(r.side??'').toLowerCase(),line=decimal(r.model_line??r.threshold);return ['over','under','at_least','at_most'].includes(side)&&line!==null&&settlementKey(line,side as Operator)===wanted;});counts.line=candidates.length;
 if(!candidates.length)return missing('LINE_MISMATCH','No hay una cuota individual publicada para esta línea y condición, ni una línea exactamente equivalente.');
 const matches=candidates.map(row=>({row,time:publishedQuoteCapture(row,now)})).filter(x=>x.time!==null).sort((a,b)=>b.time!.localeCompare(a.time!));counts.timed=matches.length;
 if(!matches.length)return missing('CAPTURE_TIME_INVALID','La cotización no tiene un momento de captura válido. No se usa para comparar precios.');
 const latest=matches[0],same=matches.filter(x=>x.time===latest.time);
 if(same.some(x=>{const price=decimal(x.row.odds_decimal);return !publishedQuoteEnabled(x.row)||price===null||price<=1;}))return {status:'inactive',message:'La última cotización coincide, pero está retirada o no tiene un precio válido.',diagnostic:{reason:'INACTIVE',counts}};
 const prices=new Set(same.map(x=>decimal(x.row.odds_decimal)));
 if(prices.size!==1)return {status:'conflict',message:'Hay precios contradictorios con la misma fecha de captura. No se eligió una cuota.',diagnostic:{reason:'CONFLICT',counts}};
 const price=decimal(latest.row.odds_decimal)!;
 return {status:'matched',price,book:leg.book,capturedAt:latest.time!,eventDate:leg.eventDate,line:decimal(latest.row.model_line??latest.row.threshold)!,side:String(latest.row.side),message:'Cuota individual consultada en las cuotas publicadas.',diagnostic:{reason:'MATCHED',counts}};
}
