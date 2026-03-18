import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Globe, Swords, Flame, CalendarClock, Trophy, Activity, ChevronRight } from 'lucide-react';

const prisma = new PrismaClient();

export default async function LolDashboard() {
  const allPanda = await prisma.upcoming_matches_lol.findMany({ orderBy: { scheduled_at: 'desc' }, take: 25 });
  const upcoming = allPanda.filter(m => m.status !== 'finished').reverse().slice(0, 4);
  const finished = allPanda.filter(m => m.status === 'finished').slice(0, 4);
  const topPicks = await prisma.player_stats_lol.groupBy({ by: ['champion'], _count: { champion: true }, orderBy: { _count: { champion: 'desc' } }, take: 5 });

  // Curaduría rápida de Ligas para el look de "Ligas Principales"
  const quickLeagues = [
    { name: 'LCK', color: 'border-l-blue-500', text: 'text-blue-500', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.1)]' },
    { name: 'LPL', color: 'border-l-red-500', text: 'text-red-500', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.1)]' },
    { name: 'LEC', color: 'border-l-orange-500', text: 'text-orange-500', glow: 'shadow-[0_0_15px_rgba(249,115,22,0.1)]' },
    { name: 'LCS', color: 'border-l-indigo-500', text: 'text-indigo-500', glow: 'shadow-[0_0_15px_rgba(99,102,241,0.1)]' },
  ];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 relative overflow-hidden">
      {/* Luces de ambiente de fondo */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-[#10b981] opacity-5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-blue-600 opacity-5 blur-[120px] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto space-y-10 relative z-10">
        
        {/* HEADER PRO */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#1a1a1a] pb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333] shadow-[0_0_30px_rgba(16,185,129,0.1)]">
              <Globe className="text-[#10b981]" size={32} />
            </div>
            <div>
              <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tighter">Global <span className="text-[#10b981]">Hub</span></h1>
              <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1 flex items-center gap-2">
                <Activity size={12} className="text-[#10b981]" /> Sincronizado con PandaScore • Temporada 2026
              </p>
            </div>
          </div>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl px-6 py-3 flex items-center gap-4 shadow-xl">
             <div className="text-right border-r border-[#222] pr-4">
                <p className="text-[10px] font-black text-[#444] uppercase">Estado API</p>
                <p className="text-xs font-bold text-[#10b981]">CONECTADO</p>
             </div>
             <Trophy className="text-yellow-500" size={24} />
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL EN GRILLA */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          <div className="xl:col-span-8 space-y-10">
            
            {/* SECCIÓN: AGENDA CON GLOW INDIGO */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#666] flex items-center gap-2">
                  <CalendarClock size={16} className="text-indigo-500" /> Agenda Próximos Partidos
                </h2>
                <span className="text-[10px] font-bold text-[#333] uppercase">Clic para analizar Draft</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcoming.map(m => (
                  <Link 
                    key={m.id} 
                    href={`/lol/draft?teamA=${encodeURIComponent(m.team_a)}&teamB=${encodeURIComponent(m.team_b)}`} 
                    className="bg-[#0a0a0a] border border-[#1a1a1a] p-6 rounded-3xl hover:border-indigo-500/50 transition-all group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500 opacity-5 blur-2xl group-hover:opacity-10 transition-opacity" />
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">{m.league}</span>
                      <div className="text-right">
                        <p className="text-xs font-black text-white">{new Date(m.scheduled_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}</p>
                        <p className="text-[9px] font-bold text-[#444] uppercase tracking-tighter">Hoy, Hora ARG</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center font-black italic text-xl uppercase tracking-tighter">
                      <span className="group-hover:text-indigo-400 transition-colors">{m.team_a}</span>
                      <span className="text-[#222] text-xs font-bold not-italic mx-2">VS</span>
                      <span className="group-hover:text-indigo-400 transition-colors">{m.team_b}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* SECCIÓN: RESULTADOS DE SERIES (EL 2-0 / 3-1) */}
            <section className="space-y-6">
              <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#666] flex items-center gap-2">
                <Swords size={16} className="text-red-500" /> Resultados de Series Recientes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {finished.map(m => (
                  <div key={m.id} className="bg-[#0a0a0a] border border-[#1a1a1a] p-6 rounded-3xl flex justify-between items-center border-l-4 border-l-[#222] hover:border-l-red-500 transition-all shadow-xl">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2">{m.league}</p>
                      <p className={`font-black italic text-lg uppercase ${m.score_a! > m.score_b! ? 'text-white' : 'text-[#333]'}`}>{m.team_a}</p>
                      <p className={`font-black italic text-lg uppercase ${m.score_b! > m.score_a! ? 'text-white' : 'text-[#333]'}`}>{m.team_b}</p>
                    </div>
                    <div className="bg-[#111] px-4 py-3 rounded-2xl border border-[#222] flex flex-col items-center gap-1 shadow-inner min-w-[70px]">
                      <span className="text-xs font-black text-[#444] uppercase mb-1">SCORE</span>
                      <div className="text-2xl font-black italic tracking-tighter">
                        <span className={m.score_a! > m.score_b! ? 'text-[#10b981]' : 'text-white'}>{m.score_a}</span>
                        <span className="mx-1 text-[#222]">-</span>
                        <span className={m.score_b! > m.score_a! ? 'text-[#10b981]' : 'text-white'}>{m.score_b}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* SECCIÓN: ACCESO RÁPIDO LIGAS (PARA QUE NO QUEDE VACÍO) */}
            <section className="space-y-4">
               <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#666] flex items-center gap-2">
                  <Trophy size={16} className="text-yellow-500" /> Ligas Principales
               </h2>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {quickLeagues.map((league) => (
                    <Link key={league.name} href="/lol/teams" className={`bg-[#0a0a0a] border border-[#1a1a1a] border-l-4 ${league.color} p-4 rounded-2xl hover:bg-[#111] transition-all flex justify-between items-center ${league.glow}`}>
                       <span className={`font-black italic ${league.text}`}>{league.name}</span>
                       <ChevronRight size={14} className="text-[#333]" />
                    </Link>
                  ))}
               </div>
            </section>
          </div>

          {/* COLUMNA DERECHA: META Y RANKING */}
          <div className="xl:col-span-4 space-y-8">
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[40px] p-8 sticky top-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2">
                  <Flame size={18} className="text-orange-500" /> Meta Global
                </h2>
                <div className="w-8 h-8 bg-orange-500/10 rounded-full flex items-center justify-center border border-orange-500/20">
                  <span className="text-orange-500 text-[10px] font-black">2026</span>
                </div>
              </div>
              
              <div className="space-y-4">
                {topPicks.map((p, i) => (
                  <div key={i} className="group flex justify-between items-center p-4 bg-[#111] rounded-2xl border border-transparent hover:border-orange-500/30 transition-all">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-black text-[#333] group-hover:text-orange-500 transition-colors">0{i+1}</span>
                      <span className="text-sm font-black uppercase tracking-tight text-gray-300 group-hover:text-white">{p.champion}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-orange-500">{p._count.champion}</p>
                      <p className="text-[9px] font-bold text-[#444] uppercase tracking-widest">Partidas</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-6 bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 rounded-3xl">
                <p className="text-xs font-black uppercase text-indigo-400 mb-2">Consejo MoskProps</p>
                <p className="text-[10px] font-bold text-gray-500 leading-relaxed uppercase">
                  Los datos del meta se basan en los últimos 200 partidos procesados. El winrate se actualiza automáticamente con cada carga.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}