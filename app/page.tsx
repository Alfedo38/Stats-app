import Link from 'next/link';
import { Brain, Flame, Users, Search, ChevronRight, Activity, Tv } from 'lucide-react';
import { getRedditTrends, getTodayScoreboard } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Traemos todo: Radar Social y la Cartelera de ESPN
  const [trends, games] = await Promise.all([
    getRedditTrends(),
    getTodayScoreboard()
  ]);
  
  const topTrend = trends.length > 0 ? trends[0] : null;

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">
              Centro de <span className="text-[#10b981]">Comando</span>
            </h1>
            <p className="text-[#666] text-xs font-bold uppercase tracking-widest mt-1">
              MoskProps Analytics • {new Date().toLocaleDateString('es-AR')}
            </p>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" size={18} />
            <input 
              type="text" 
              placeholder="Buscar jugador o equipo..." 
              className="w-full bg-[#111] border border-[#222] rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#10b981] transition-colors"
            />
          </div>
        </header>

        {/* --- SECCIÓN NUEVA: PARTIDOS DE HOY (ESPN) --- */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2">
               <Tv size={14} className="text-red-500" />
               Cartelera en Vivo
            </h3>
            <span className="text-[9px] font-black uppercase text-[#444]">Desliza para ver más →</span>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {games.length > 0 ? games.map((game: any) => {
              const home = game.competitions[0].competitors.find((c: any) => c.homeAway === 'home');
              const away = game.competitions[0].competitors.find((c: any) => c.homeAway === 'away');
              const status = game.status.type.shortDetail;
              const isLive = game.status.type.state === 'in';

              return (
                <div key={game.id} className="min-w-[280px] bg-[#0a0a0a] border border-[#1a1a1a] p-5 rounded-3xl flex flex-col justify-between gap-4 hover:border-[#333] transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#444]">
                        {game.status.type.description}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isLive ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-[#111] text-[#666]"}`}>
                        {status}
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
                <div className="w-full bg-[#111] border border-dashed border-[#222] p-8 rounded-3xl text-center">
                    <p className="text-[#444] text-[10px] font-black uppercase">No hay partidos programados para ahora</p>
                </div>
            )}
          </div>
        </section>

        {/* Grid de Accesos Directos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/ev-plays" className="group block bg-[#0a0a0a] border border-[#1a1a1a] p-6 rounded-3xl hover:border-[#10b981]/50 transition-all relative overflow-hidden">
            <div className="bg-[#10b981]/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6"><Brain className="text-[#10b981]" size={24} /></div>
            <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Cerebro EV+</h2>
            <div className="flex items-center text-[#10b981] text-xs font-bold uppercase tracking-widest">Abrir Escáner <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
          </Link>

          <Link href="/reddit-hype" className="group block bg-[#0a0a0a] border border-[#1a1a1a] p-6 rounded-3xl hover:border-orange-500/50 transition-all relative overflow-hidden">
            <div className="bg-orange-500/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6"><Flame className="text-orange-500" size={24} /></div>
            <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Radar Social</h2>
            <div className="flex items-center text-orange-500 text-xs font-bold uppercase tracking-widest">Ver Tendencias <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
          </Link>

          <Link href="/teams" className="group block bg-[#0a0a0a] border border-[#1a1a1a] p-6 rounded-3xl hover:border-blue-500/50 transition-all relative overflow-hidden">
            <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6"><Users className="text-blue-500" size={24} /></div>
            <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Equipos</h2>
            <div className="flex items-center text-blue-500 text-xs font-bold uppercase tracking-widest">Explorar Franquicias <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
          </Link>
        </div>

        {/* Widget de la Jugada Más Caliente */}
        {topTrend && (
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2rem] p-8 relative overflow-hidden group hover:border-orange-500/30 transition-all">
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500 opacity-5 blur-[100px] rounded-full pointer-events-none" />
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2">
                <Activity size={16} className="text-orange-500" />
                Tendencia Líder del Radar
              </h3>
              <div className="flex items-center gap-2 bg-orange-500/10 px-3 py-1 rounded-full">
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping" />
                <span className="text-orange-500 text-[9px] font-black uppercase tracking-widest">Calculando Hype</span>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
              <div className="flex items-center gap-6">
                 <div className="w-20 h-20 rounded-full border border-[#222] bg-black flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(249,115,22,0.1)]">
                    <span className="font-black text-4xl text-orange-500">{topTrend.player_name.charAt(0)}</span>
                  </div>
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-white group-hover:text-orange-500 transition-colors">
                      {topTrend.player_name}
                    </h2>
                    <p className="text-sm text-[#10b981] font-black uppercase tracking-widest mt-1">
                      {topTrend.team_abbr} • {topTrend.sentiment === "A GANAR (ML)" ? "GANA DIRECTO (ML)" : topTrend.sentiment}
                    </p>
                  </div>
              </div>
              
              <div className="flex gap-12 text-left md:text-right w-full md:w-auto border-t border-[#111] md:border-0 pt-6 md:pt-0">
                <div>
                  <p className="text-4xl font-black text-white">{topTrend.mentions}</p>
                  <p className="text-[10px] text-[#444] font-black uppercase tracking-widest">Menciones</p>
                </div>
                <div>
                  <p className="text-4xl font-black text-orange-500">{topTrend.hype_score}</p>
                  <p className="text-[10px] text-[#444] font-black uppercase tracking-widest">Hype Score</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
      </div>
    </main>
  );
}