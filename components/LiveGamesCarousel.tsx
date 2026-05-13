"use client";
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function LiveGamesCarousel({ liveGames }: { liveGames: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300; 
      if (direction === 'left') {
        scrollRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  if (liveGames.length === 0) {
    return <p className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest px-2">No games today.</p>;
  }

  return (
    <div className="relative group">
      {/* EL TRUCO ESTÁ AQUÍ: Agregamos las clases arbitrarias para ocultar el scrollbar en todos los navegadores */}
      <div 
        ref={scrollRef}
        className="flex overflow-x-auto gap-4 pb-4 pt-1 snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {liveGames.map((game: any) => (
          <div key={game.id} className="snap-center md:snap-start shrink-0 w-[220px] bg-[var(--surface)] border border-[var(--border)] rounded-[1.5rem] p-4 flex flex-col gap-4 shadow-lg hover:border-[var(--border-strong)] transition-colors relative">
            
            {/* CABECERA: Estado del partido y Canal de TV */}
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
              <span className={`text-[9px] font-black uppercase tracking-widest ${game.status === 'in' ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                {game.detail}
                {/* Si hay TV, la mostramos sutilmente al lado */}
                {game.tv && <span className="text-[var(--text-muted)] ml-1 opacity-80"> • {game.tv}</span>}
              </span>
              {game.status === 'in' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
            </div>

            {/* EQUIPOS Y RESULTADOS */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <img src={game.away.logo || `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${game.away.abbr.toLowerCase()}.png`} alt={game.away.abbr} className="w-6 h-6 object-contain drop-shadow-md" />
                  <div className="flex flex-col">
                    <span className="font-black text-xs text-[var(--text)] leading-none">{game.away.abbr}</span>
                    {/* Récord del equipo abajo del nombre (Ej: 35-20) */}
                    {game.away.record && <span className="text-[7px] text-[var(--text-muted)] font-black mt-0.5">{game.away.record}</span>}
                  </div>
                </div>
                <span className={`font-black text-lg tabular-nums ${game.away.score > game.home.score ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                  {game.away.score || '-'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <img src={game.home.logo || `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${game.home.abbr.toLowerCase()}.png`} alt={game.home.abbr} className="w-6 h-6 object-contain drop-shadow-md" />
                  <div className="flex flex-col">
                    <span className="font-black text-xs text-[var(--text)] leading-none">{game.home.abbr}</span>
                    {/* Récord del equipo */}
                    {game.home.record && <span className="text-[7px] text-[var(--text-muted)] font-black mt-0.5">{game.home.record}</span>}
                  </div>
                </div>
                <span className={`font-black text-lg tabular-nums ${game.home.score > game.away.score ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                  {game.home.score || '-'}
                </span>
              </div>
            </div>

            {/* ZONA DE APUESTAS (Odds) - Aparece al fondo si existe */}
            {game.odds && game.odds.trim() !== "" && (
              <div className="mt-1 pt-2 border-t border-[var(--border)] text-center">
                <span className="text-[8px] font-black text-[#10b981] uppercase tracking-widest">{game.odds}</span>
              </div>
            )}

          </div>
        ))}
      </div>

      <div className="absolute -top-10 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button 
          onClick={() => scroll('left')}
          className="bg-[var(--surface-soft)] hover:bg-orange-500/20 text-[var(--text-muted)] hover:text-orange-500 border border-[var(--border)] hover:border-orange-500 p-2 rounded-xl transition-all shadow-lg"
        >
          <ChevronLeft size={16} />
        </button>
        <button 
          onClick={() => scroll('right')}
          className="bg-[var(--surface-soft)] hover:bg-orange-500/20 text-[var(--text-muted)] hover:text-orange-500 border border-[var(--border)] hover:border-orange-500 p-2 rounded-xl transition-all shadow-lg"
        >
          <ChevronRight size={16} />
        </button>
      </div>

    </div>
  );
}