"use client";
import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Tv } from 'lucide-react';

export default function GameCarousel({ games }: { games: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  // 1. Esperamos a que el componente se monte en el cliente
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  const formatArgTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires'
    });
  };

  return (
    <section className="space-y-4 relative group">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2">
           <Tv size={14} className="text-red-500" />
           Cartelera en Vivo (Hora ARG)
        </h3>
        <div className="flex gap-2">
            <button onClick={() => scroll('left')} className="p-1.5 bg-[#111] hover:bg-[#222] rounded-lg text-[#444] hover:text-white transition-all">
                <ChevronLeft size={16} />
            </button>
            <button onClick={() => scroll('right')} className="p-1.5 bg-[#111] hover:bg-[#222] rounded-lg text-[#444] hover:text-white transition-all">
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
          const status = game.status.type.shortDetail;
          const isLive = game.status.type.state === 'in';
          
          // 2. Si no está montado, mostramos un placeholder para evitar el error de hidratación
          const displayTime = !isMounted 
            ? "--:--" 
            : (isLive ? status : formatArgTime(game.date));

          return (
            <div key={game.id} className="min-w-[280px] snap-center bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-3xl flex flex-col justify-between gap-4 hover:border-[#333] transition-colors shadow-xl">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#444]">
                    {game.status.type.description}
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isLive ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-[#111] text-[#666]"}`}>
                    {displayTime}
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <img src={away.team.logo} className="w-6 h-6 object-contain" alt="" />
                    <span className="text-sm font-black uppercase tracking-tighter">{away.team.abbreviation}</span>
                  </div>
                  <span className={`text-lg font-black ${isLive ? "text-white" : "text-[#444]"}`}>{away.score}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <img src={home.team.logo} className="w-6 h-6 object-contain" alt="" />
                    <span className="text-sm font-black uppercase tracking-tighter">{home.team.abbreviation}</span>
                  </div>
                  <span className={`text-lg font-black ${isLive ? "text-white" : "text-[#444]"}`}>{home.score}</span>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="w-full bg-[#0a0a0a] border border-dashed border-[#1a1a1a] p-8 rounded-3xl text-center">
             <p className="text-[#444] text-[10px] font-black uppercase tracking-widest">No hay partidos en el radar</p>
          </div>
        )}
      </div>
    </section>
  );
}