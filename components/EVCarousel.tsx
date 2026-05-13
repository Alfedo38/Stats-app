"use client";
import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';

export default function EVCarousel({ evPlays }: { evPlays: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 260;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // ✅ Protección: si no hay plays, no renderizamos nada
  if (!evPlays || evPlays.length === 0) return null;

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-3 pb-6 px-1 scroll-smooth snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {evPlays.map((play, idx) => {
          // ✅ FIX: Protección contra valores undefined o NaN en el cálculo del edge
          const avgLast10 = Number(play.avg_last_10) || 0;
          const line = Number(play.line) || 0;
          const edgeValue = avgLast10 - line;
          const isTopPlay = edgeValue >= 3.0;

          return (
            <Link
              href={`/players/${play.player_id}`}
              key={`ev-${idx}`}
              className="block no-underline shrink-0 snap-start"
            >
              <div className={`
                bg-[var(--surface)] rounded-[1rem] p-4 transition-all flex flex-col justify-between relative overflow-hidden shadow-2xl w-[240px] h-[150px]
                border ${isTopPlay ? 'border-[#10b981]/50' : 'border-[var(--border)]'}
                hover:border-[#10b981] group/card
              `}>

                {/* Indicador Top Play */}
                {isTopPlay && (
                  <div className="absolute top-0 right-0 p-2">
                    <Zap size={12} className="text-[#10b981] fill-[#10b981] animate-pulse" />
                  </div>
                )}

                {/* Cabecera */}
                <div className="z-10 relative">
                  <div className="flex justify-between items-start">
                    <span className="text-[var(--text-muted)] font-bold text-[8px] uppercase tracking-widest truncate max-w-[140px]">
                      {play.team} • {play.matchup}
                    </span>
                  </div>
                  <h3 className="font-black text-[var(--text)] text-[13px] uppercase mt-1 tracking-tight">
                    {play.player_name}
                  </h3>
                </div>

                {/* Valor Central */}
                <div className="flex items-center justify-between bg-[var(--surface-soft)] rounded-xl p-2 border border-[var(--border)]">
                  <div className="flex flex-col">
                    <span className="text-[7px] text-[var(--text-muted)] font-bold uppercase">Line</span>
                    <span className="text-[var(--text)] font-black text-sm">
                      {line} <span className="text-[9px] text-[#10b981]">PTS</span>
                    </span>
                  </div>
                  <div className="h-6 w-[1px] bg-white/10" />
                  <div className="flex flex-col items-end">
                    <span className="text-[7px] text-[var(--text-muted)] font-bold uppercase">Edge</span>
                    {/* ✅ FIX: Solo mostramos el edge si es positivo */}
                    <span className={`font-black text-sm ${edgeValue > 0 ? 'text-[#10b981]' : 'text-red-500'}`}>
                      {edgeValue > 0 ? '+' : ''}{edgeValue.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-[7px] text-[var(--text-muted)] font-bold uppercase">L10 Average</span>
                    <span className="text-[var(--text-muted)] font-bold text-xs tabular-nums">{avgLast10.toFixed(1)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[7px] text-[var(--text-muted)] font-bold uppercase">Hit Rate</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[var(--text)] font-black text-lg leading-none">{play.over_hits}</span>
                      <span className="text-[var(--text-muted)] font-bold text-[9px]">/10</span>
                    </div>
                  </div>
                </div>

              </div>
            </Link>
          );
        })}
      </div>

      {/* Flechas */}
      <button
        onClick={() => scroll('left')}
        className="absolute -left-2 top-1/2 -translate-y-1/2 bg-[var(--bg)]/60 backdrop-blur-md border border-[var(--border)] p-2 rounded-full text-[var(--text)] opacity-0 group-hover:opacity-100 transition-all z-30 hidden md:flex"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={() => scroll('right')}
        className="absolute -right-2 top-1/2 -translate-y-1/2 bg-[var(--bg)]/60 backdrop-blur-md border border-[var(--border)] p-2 rounded-full text-[var(--text)] opacity-0 group-hover:opacity-100 transition-all z-30 hidden md:flex"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}