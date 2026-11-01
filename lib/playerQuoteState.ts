import {decimalPrice,quoteMatches,priceAt,type PriceQuote,type OddsScope} from './nbaOdds';
export function playerQuoteState({rows,eventRows,line,side,market,scope,eventReady=true,loading=false,error=false}:{rows:PriceQuote[];eventRows:PriceQuote[];line:number;side:'over'|'under';market:string;scope:OddsScope;eventReady?:boolean;loading?:boolean;error?:boolean}){
 const prices=rows.filter(q=>decimalPrice(side==='over'?q.over_price:q.under_price)!==null);
 const lines=[...new Set(prices.map(q=>q.line).filter((n):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=300))].sort((a,b)=>Math.abs(a-line)-Math.abs(b-line)||a-b).slice(0,6).sort((a,b)=>a-b);
 if(loading)return {status:'loading',message:'Consultando cuotas…',lines:[]};
 if(error)return {status:'unavailable',message:'No pudimos consultar las cuotas. Reintentá.',lines:[]};
 if(!eventReady)return {status:'event_required',message:'Elegí un partido para consultar sus cuotas.',lines:[]};
 if(['stake','bet365','betano'].some(book=>priceAt(rows,book,line,side)))return {status:'ready',message:'',lines:[]};
 if(lines.length)return {status:'line_missing',message:`Sin precio para ${side==='over'?'Over':'Under'} ${line.toLocaleString('es-AR')}. Hay otras líneas disponibles.`,lines};
 if(rows.length)return {status:'side_missing',message:`No hay precio ${side==='over'?'Over':'Under'} disponible en este mercado.`,lines:[]};
 if(eventRows.some(q=>quoteMatches(q,market,'FULL')||quoteMatches(q,market,'Q1')||quoteMatches(q,market,'H1')||quoteMatches(q,market,'H2_REG')))return {status:'other_period',message:'Hay cuotas de este mercado en otro período.',lines:[]};
 return {status:'no_quotes',message:eventRows.length?'Este mercado todavía no tiene cuotas verificadas en el partido.':'Todavía no hay cuotas verificadas para este jugador y partido.',lines:[]};
}
