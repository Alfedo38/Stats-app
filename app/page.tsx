import Link from 'next/link';
import { Brain, Flame, Users, ChevronRight, Activity } from 'lucide-react';
import { getRedditTrends, getTodayScoreboard } from '@/lib/api';

// Importamos los componentes "vivos" (Client Components)
import SearchBar from '@/components/SearchBar';
import GameCarousel from '@/components/GameCarousel';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Traemos los datos de la DB y de la API de ESPN en paralelo
  const [trends, games] = await Promise.all([
    getRedditTrends(),
    getTodayScoreboard()
  ]);
  
  const topTrend = trends.length > 0 ? trends[0] : null;

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header con Buscador Real */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">
              Centro de <span className="text-[#10b981]">Comando</span>
            </h1>
            <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">
              MoskProps Analytics • {new Date().toLocaleDateString('es-AR')}
            </p>
          </div>
          
          {/* El buscador con "cerebro" que busca en tu DB */}
          <div className="w-full md:w-auto">
            <SearchBar />
          </div>
        </header>

        {/* Carrusel de Partidos (Ahora con Hora ARG y Scroll funcional) */}
        <GameCarousel games={games} />

        {/* Grid de Accesos Directos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Tarjeta Cerebro EV+ */}
          <Link href="/ev-plays" className="group block bg-[var(--surface)] border border-[var(--border)] p-6 rounded-3xl hover:border-[#10b981]/50 transition-all relative overflow-hidden">
            <div className="bg-[#10b981]/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
              <Brain className="text-[#10b981]" size={24} />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Cerebro EV+</h2>
            <p className="text-[var(--text-muted)] text-[10px] mb-6 h-8 font-medium">Algoritmo matemático para encontrar valor (Edge) en las líneas de hoy.</p>
            <div className="flex items-center text-[#10b981] text-[10px] font-black uppercase tracking-widest">
              Abrir Escáner <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Tarjeta Radar Social */}
          <Link href="/reddit-hype" className="group block bg-[var(--surface)] border border-[var(--border)] p-6 rounded-3xl hover:border-orange-500/50 transition-all relative overflow-hidden">
            <div className="bg-orange-500/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
              <Flame className="text-orange-500" size={24} />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Radar Social</h2>
            <p className="text-[var(--text-muted)] text-[10px] mb-6 h-8 font-medium">Termómetro de Reddit. Descubre dónde está el volumen de las apuestas.</p>
            <div className="flex items-center text-orange-500 text-[10px] font-black uppercase tracking-widest">
              Ver Tendencias <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Tarjeta Equipos */}
          <Link href="/teams" className="group block bg-[var(--surface)] border border-[var(--border)] p-6 rounded-3xl hover:border-blue-500/50 transition-all relative overflow-hidden">
            <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
              <Users className="text-blue-500" size={24} />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Equipos</h2>
            <p className="text-[var(--text-muted)] text-[10px] mb-6 h-8 font-medium">Base de datos de rosters, estadísticas y métricas de las 30 franquicias.</p>
            <div className="flex items-center text-blue-500 text-[10px] font-black uppercase tracking-widest">
              Explorar NBA <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
          
        </div>

        {/* Widget del Jugador Líder (Dato de tu DB) */}
        {topTrend && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 relative overflow-hidden group hover:border-[var(--border)] transition-all">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#10b981] opacity-5 blur-[100px] rounded-full pointer-events-none" />
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
                <Activity size={16} className="text-[#10b981]" />
                Tendencia Máxima Detectada
              </h3>
              <div className="flex items-center gap-2 bg-[#10b981]/10 px-3 py-1 rounded-full">
                <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" />
                <span className="text-[#10b981] text-[9px] font-black uppercase tracking-widest">Live Sync</span>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
              <div className="flex items-center gap-6">
                 <div className="w-20 h-20 rounded-full border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center shrink-0">
                    <span className="font-black text-4xl text-[#10b981]">
                      {topTrend.player_name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-[var(--text)] group-hover:text-[#10b981] transition-colors">
                      {topTrend.player_name}
                    </h2>
                    <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">
                      {topTrend.team_abbr} • {topTrend.sentiment}
                    </p>
                  </div>
              </div>
              
              <div className="flex gap-12 text-left md:text-right border-t border-[var(--border)] md:border-0 pt-6 md:pt-0 w-full md:w-auto">
                <div>
                  <p className="text-4xl font-black text-[var(--text)]">{topTrend.mentions}</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">Menciones</p>
                </div>
                <div>
                  <p className="text-4xl font-black text-[#10b981]">{topTrend.hype_score}</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">Hype Index</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
      </div>
    </main>
  );
}