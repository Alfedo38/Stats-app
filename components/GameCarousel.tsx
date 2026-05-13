"use client";
import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Tv } from 'lucide-react';

// ✅ FIX: Movemos formatArgTime fuera del componente — es una función pura.
// Además, la usamos con suppressHydrationWarning en vez del truco isMounted,
// que causaba que los horarios mostraran "--:--" hasta que el cliente montaba.
function formatArgTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires'
  });
}

export default function GameCarousel({ games }: { games: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left'
        ? scrollLeft - clientWidth
        : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <section className="space-y-4 relative group">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
          <Tv size={14} className="text-red-500" />
          Cartelera en Vivo (Hora ARG)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 bg-[var(--surface-soft)] hover:bg-[var(--surface-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1.5 bg-[var(--surface-soft)] hover:bg-[var(--surface-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory"
      >
        {games.length > 0 ? games.map((game: any) => {
          const home = game.competitions[0].competitors.find((c: any) => c.homeAway === 'home');
          const away = game.competitions[0].competitors.find((c: any) => c.homeAway === 'away');
          const isLive = game.status.type.state === 'in';
          const status = game.status.type.shortDetail;

          return (
            <div
              key={game.id}
              className="min-w-[280px] snap-center bg-[var(--surface)] border border-[var(--border)] p-5 rounded-3xl flex flex-col justify-between gap-4 hover:border-[var(--border-strong)] transition-colors shadow-xl"
            >
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {game.status.type.description}
                </span>

                {/* ✅ FIX: suppressHydrationWarning evita el error de hidratación
                    sin necesitar el truco isMounted que causaba el "--:--".
                    El servidor renderiza la hora en UTC, el cliente la corrige
                    a ARG — React acepta esa diferencia sin quejarse. */}
                <span
                  suppressHydrationWarning
                  className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                    isLive
                      ? "bg-red-500/10 text-red-500 animate-pulse"
                      : "bg-[var(--surface-soft)] text-[var(--text-muted)]"
                  }`}
                >
                  {isLive ? status : formatArgTime(game.date)}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <img src={away.team.logo} className="w-6 h-6 object-contain" alt="" />
                    <span className="text-sm font-black uppercase tracking-tighter">
                      {away.team.abbreviation}
                    </span>
                  </div>
                  <span className={`text-lg font-black ${isLive ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                    {away.score}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <img src={home.team.logo} className="w-6 h-6 object-contain" alt="" />
                    <span className="text-sm font-black uppercase tracking-tighter">
                      {home.team.abbreviation}
                    </span>
                  </div>
                  <span className={`text-lg font-black ${isLive ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                    {home.score}
                  </span>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="w-full bg-[var(--surface)] border border-dashed border-[var(--border)] p-8 rounded-3xl text-center">
            <p className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest">
              No hay partidos en el radar
            </p>
          </div>
        )}
      </div>
    </section>
  );
}