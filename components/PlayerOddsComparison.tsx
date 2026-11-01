"use client";

import {playerQuoteState} from '@/lib/playerQuoteState';
import { PRICE_BOOKS, priceAt, type PriceQuote } from '@/lib/nbaOdds';

type Props = {
  rows: PriceQuote[];
  line: number;
  side: 'over' | 'under';
  loading: boolean;
  error: string | null;
  selectedBook?:string|null;
  onSelectBook?:(book:string|null)=>void;
  eventReady?:boolean;eventRows?:PriceQuote[];market?:string;scope?:'FULL'|'Q1'|'H1'|'H2_REG';onSelectLine?:(line:number)=>void;onRetry?:()=>void;
};

export default function PlayerOddsComparison({ rows, line, side, loading, error, selectedBook, onSelectBook,eventReady=true,eventRows=rows,market='pts',scope='FULL',onSelectLine,onRetry }: Props) {
  const label = side === 'over' ? 'Over' : 'Under';
  const state=playerQuoteState({rows,eventRows,line,side,market,scope,eventReady,loading,error:!!error});

  return (
    <div className="min-w-0" aria-busy={loading}>
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label={`Cuotas ${label} ${line.toLocaleString('es-AR')}`}
      >
        {PRICE_BOOKS.map(book => {
          const quote = priceAt(rows, book.key, line, side);
          const price = quote?.price.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });

          const Tag=onSelectBook?'button':'div';
          return (
            <Tag
              key={book.key}
              {...(onSelectBook?{type:"button" as const,disabled:!quote||loading,onClick:()=>onSelectBook(selectedBook===book.key?null:book.key),"aria-pressed":selectedBook===book.key&&!!quote,title:"Elegir esta casa para agregar la selección"}:{})}
              style={onSelectBook&&selectedBook===book.key&&quote?{borderColor:"#10b981",boxShadow:"0 0 0 1px #10b981"}:undefined}
              className="flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2"
              aria-label={`${book.label}: ${price ? `cuota ${price}` : 'sin cuota disponible'}`}
            >
              <span className="text-[11px] font-bold leading-none text-[var(--text-muted)]">
                {book.label}
              </span>
              <span className={`text-xl font-black leading-none tabular-nums ${quote ? 'text-[var(--text)]' : 'text-[var(--text-soft)]'}`}>
                {loading?'…':price ?? '—'}
              </span>
            </Tag>
          );
        })}
      </div>
      {loading && <span className="sr-only" role="status">Actualizando cuotas…</span>}
      {state.message&&<p className="mt-1 max-w-64 text-[10px] leading-4 text-[var(--text-muted)]" role="status">{state.message}{onRetry&&!loading&&eventReady&&state.status!=='ready'&&<button type="button" onClick={onRetry} className="ml-1 font-bold text-[#10b981]">{state.status==='unavailable'?'Reintentar':'Actualizar'}</button>}</p>}
      {!!state.lines.length&&onSelectLine&&<details className="mt-1 max-w-64 text-[10px] text-[var(--text-muted)]"><summary className="cursor-pointer">Ver líneas disponibles</summary><div className="mt-1 flex flex-wrap gap-1">{state.lines.map(value=><button type="button" key={value} onClick={()=>onSelectLine(value)} className="rounded border border-[var(--border)] px-2 py-1 font-bold text-[#10b981]">{label} {value.toLocaleString('es-AR')}</button>)}</div></details>}
    </div>
  );
}
