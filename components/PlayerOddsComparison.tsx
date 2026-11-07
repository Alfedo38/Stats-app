"use client";

import NBAOddsMovement from './NBAOddsMovement';
import QuotePriceCards from './QuotePriceCards';
import {playerQuoteState} from '@/lib/playerQuoteState';
import { PRICE_BOOKS, priceAt, type PriceQuote } from '@/lib/nbaOdds';

type Props = {
  rows: PriceQuote[];
  movement?:{player:string;date:string;away:string;home:string};
  line: number;
  side: 'over' | 'under';
  loading: boolean;
  error: string | null;
  selectedBook?:string|null;
  onSelectBook?:(book:string|null)=>void;
  eventReady?:boolean;eventRows?:PriceQuote[];market?:string;scope?:'FULL'|'Q1'|'H1'|'H2_REG';onSelectLine?:(line:number)=>void;onRetry?:()=>void;
};

export default function PlayerOddsComparison({ rows, line, side, loading, error, selectedBook, onSelectBook,eventReady=true,eventRows=rows,market='pts',scope='FULL',onSelectLine,onRetry,movement }: Props) {
  const label = side === 'over' ? 'Over' : 'Under';
  const state=playerQuoteState({rows,eventRows,line,side,market,scope,eventReady,loading,error:!!error});

  return (
    <div className="min-w-0" aria-busy={loading}>
      <QuotePriceCards label={`Cuotas ${label} ${line.toLocaleString('es-AR')}`} loading={loading}
        cards={PRICE_BOOKS.map(book=>({key:book.key,label:book.label,price:priceAt(rows,book.key,line,side)?.price??null}))}
        selectedBook={selectedBook} onSelectBook={onSelectBook}/>
      {loading && <span className="sr-only" role="status">Actualizando cuotas…</span>}
      {state.message&&<p className="mt-1 max-w-64 text-[10px] leading-4 text-[var(--text-muted)]" role="status">{state.message}{onRetry&&!loading&&eventReady&&state.status!=='ready'&&<button type="button" onClick={onRetry} className="ml-1 font-bold text-[#10b981]">{state.status==='unavailable'?'Reintentar':'Actualizar'}</button>}</p>}
      {!!state.lines.length&&onSelectLine&&<details className="mt-1 max-w-64 text-[10px] text-[var(--text-muted)]"><summary className="cursor-pointer">Ver líneas disponibles</summary><div className="mt-1 flex flex-wrap gap-1">{state.lines.map(value=><button type="button" key={value} onClick={()=>onSelectLine(value)} className="rounded border border-[var(--border)] px-2 py-1 font-bold text-[#10b981]">{label} {value.toLocaleString('es-AR')}</button>)}</div></details>}
      {movement&&Number.isFinite(line)&&line>=0&&<NBAOddsMovement {...movement} line={line} side={side} market={market} scope={scope} selectedBook={selectedBook}/>}
    </div>
  );
}
