"use client";

import { PRICE_BOOKS, priceAt, type PriceQuote } from '@/lib/nbaOdds';

type Props = {
  rows: PriceQuote[];
  line: number;
  side: 'over' | 'under';
  loading: boolean;
  error: string | null;
};

export default function PlayerOddsComparison({ rows, line, side, loading, error }: Props) {
  const label = side === 'over' ? 'Over' : 'Under';

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

          return (
            <div
              key={book.key}
              className="flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2"
              aria-label={`${book.label}: ${price ? `cuota ${price}` : 'sin cuota disponible'}`}
            >
              <span className="text-[11px] font-bold leading-none text-[var(--text-muted)]">
                {book.label}
              </span>
              <span className={`text-xl font-black leading-none tabular-nums ${quote ? 'text-[var(--text)]' : 'text-[var(--text-soft)]'}`}>
                {price ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
      {loading && <span className="sr-only" role="status">Actualizando cuotas…</span>}
      {error && <p className="mt-1 text-xs text-[var(--warning)]" role="status">{error}</p>}
    </div>
  );
}
