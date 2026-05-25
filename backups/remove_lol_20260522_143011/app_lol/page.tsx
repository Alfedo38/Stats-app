import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Globe, Swords, CalendarClock, Trophy, Activity, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export default async function LolDashboard() {
  // Calculamos el inicio del día para no perdernos partidos que empezaron hace un rato
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // 1. EL FIX DE LOS PARTIDOS EN VIVO Y PRÓXIMOS
  const upcomingRaw = await prisma.upcoming_matches_lol.findMany({
    where: { 
      status: { notIn: ['finished', 'canceled'] }, // No terminados ni cancelados
      OR: [
        { status: 'running' }, // ESTO SALVA LOS PARTIDOS EN VIVO
        { scheduled_at: { gte: startOfDay } } // O que sean de hoy en adelante
      ]
    },
    orderBy: { scheduled_at: 'asc' },
    take: 30 
  });

  // AGRUPAMOS LOS PRÓXIMOS POR LIGA
  const upcomingByLeague: Record<string, typeof upcomingRaw> = {};
  upcomingRaw.forEach(m => {
    if (!upcomingByLeague[m.league]) upcomingByLeague[m.league] = [];
    upcomingByLeague[m.league].push(m);
  });

  // 2. TRAEMOS RESULTADOS TERMINADOS
  const finishedRaw = await prisma.upcoming_matches_lol.findMany({
    where: { status: 'finished' },
    orderBy: { scheduled_at: 'desc' },
    take: 40
  });

  // AGRUPAMOS LOS TERMINADOS POR LIGA (Máximo 4 por liga)
  const finishedByLeague: Record<string, typeof finishedRaw> = {};
  finishedRaw.forEach(m => {
    if (!finishedByLeague[m.league]) finishedByLeague[m.league] = [];
    if (finishedByLeague[m.league].length < 4) {
      finishedByLeague[m.league].push(m);
    }
  });

  const quickLeagues = [
    { name: 'LCK', color: 'border-l-blue-500', text: 'text-blue-500', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.1)]' },
    { name: 'LPL', color: 'border-l-red-500', text: 'text-red-500', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.1)]' },
    { name: 'LEC', color: 'border-l-orange-500', text: 'text-orange-500', glow: 'shadow-[0_0_15px_rgba(249,115,22,0.1)]' },
    { name: 'LCS', color: 'border-l-indigo-500', text: 'text-indigo-500', glow: 'shadow-[0_0_15px_rgba(99,102,241,0.1)]' },
  ];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-[#10b981] opacity-5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-blue-600 opacity-5 blur-[120px] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto space-y-10 relative z-10">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#1a1a1a] pb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333] shadow-[0_0_30px_rgba(16,185,129,0.1)]">
              <Globe className="text-[#10b981]" size={32} />
            </div>
            <div>
              <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tighter">Global <span className="text-[#10b981]">Hub</span></h1>
              <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1 flex items-center gap-2">
                <Activity size={12} className="text-[#10b981]" /> Sincronizado con PandaScore
              </p>
            </div>
          </div>
        </div>

        {/* LIGAS DE ACCESO RÁPIDO */}
        <section className="space-y-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#666] flex items-center gap-2">
              <Trophy size={16} className="text-yellow-500" /> Explorar Ligas
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {quickLeagues.map((league) => (
                <Link key={league.name} href={`/lol/${league.name.toLowerCase()}`} className={`bg-[#0a0a0a] border border-[#1a1a1a] border-l-4 ${league.color} p-4 rounded-2xl hover:bg-[#111] transition-all flex justify-between items-center ${league.glow}`}>
                    <span className={`font-black italic ${league.text}`}>{league.name}</span>
                    <ChevronRight size={14} className="text-[#333]" />
                </Link>
              ))}
            </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          
          {/* COLUMNA IZQUIERDA: PRÓXIMOS PARTIDOS POR LIGA */}
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-4">
              <h2 className="text-[14px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-2">
                <CalendarClock size={20} className="text-indigo-500" /> Agenda (En Vivo y Próximos)
              </h2>
            </div>
            
            {Object.keys(upcomingByLeague).length === 0 ? (
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-8 text-center border-dashed flex flex-col items-center gap-3">
                <CalendarClock size={32} className="text-[#333]" />
                <p className="text-[#666] font-bold uppercase tracking-widest text-xs">Off-Season / Descanso</p>
                <p className="text-[#444] text-[10px] uppercase">No hay partidos oficiales programados para hoy.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(upcomingByLeague).map(([league, matches]) => (
                  <div key={league} className="space-y-3">
                    <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest border-l-2 border-indigo-500 pl-2 ml-1">
                      {league}
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {matches.map(m => {
                        const isLive = m.status === 'running';
                        
                        return (
                          <Link key={m.id} href={`/lol/draft?teamA=${encodeURIComponent(m.team_a)}&teamB=${encodeURIComponent(m.team_b)}`} className={`bg-[#0a0a0a] border ${isLive ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-[#1a1a1a] hover:border-indigo-500/50'} p-4 rounded-2xl transition-all flex justify-between items-center group relative overflow-hidden`}>
                            
                            {/* Brillo de fondo si está en vivo */}
                            {isLive && <div className="absolute top-0 right-0 w-32 h-32 bg-red-500 opacity-5 blur-2xl pointer-events-none" />}

                            <div className={`flex-1 font-black italic text-lg uppercase tracking-tighter text-right pr-4 transition-colors ${isLive ? 'text-white' : 'text-gray-300 group-hover:text-indigo-400'}`}>
                              {m.team_a}
                            </div>
                            
                            {/* CAJA CENTRAL (VIVO O HORA) */}
                            <div className={`px-3 py-2 rounded-xl border flex flex-col items-center min-w-[80px] z-10 ${isLive ? 'bg-red-500/10 border-red-500/30' : 'bg-[#111] border-[#222]'}`}>
                              {isLive ? (
                                <span className="text-xs font-black text-red-500 uppercase tracking-widest animate-pulse flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span> VIVO
                                </span>
                              ) : (
                                <>
                                  <span className="text-[9px] font-bold text-[#666] uppercase">{new Date(m.scheduled_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                                  <span className="text-sm font-black text-white">{new Date(m.scheduled_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}</span>
                                </>
                              )}
                            </div>

                            <div className={`flex-1 font-black italic text-lg uppercase tracking-tighter text-left pl-4 transition-colors ${isLive ? 'text-white' : 'text-gray-300 group-hover:text-indigo-400'}`}>
                              {m.team_b}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA: RESULTADOS POR LIGA */}
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-4">
              <h2 className="text-[14px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-2">
                <Swords size={20} className="text-red-500" /> Resultados Recientes
              </h2>
            </div>
            
            {Object.keys(finishedByLeague).length === 0 ? (
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-8 text-center border-dashed">
                <p className="text-[#666] font-bold uppercase tracking-widest text-xs">Aún no hay resultados sincronizados.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(finishedByLeague).map(([league, matches]) => (
                  <div key={league} className="space-y-3">
                    <h3 className="text-xs font-black text-red-500 uppercase tracking-widest border-l-2 border-red-500 pl-2 ml-1">
                      {league}
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {matches.map(m => (
                        <div key={m.id} className="bg-[#0a0a0a] border border-[#1a1a1a] p-4 rounded-2xl flex justify-between items-center hover:border-[#333] transition-all">
                          <div className={`flex-1 font-black italic text-lg uppercase tracking-tighter text-right pr-4 ${m.score_a! > m.score_b! ? 'text-white' : 'text-[#444]'}`}>
                            {m.team_a}
                          </div>
                          <div className="bg-[#111] px-4 py-2 rounded-xl border border-[#222] flex items-center gap-1 min-w-[70px] justify-center">
                            <span className={m.score_a! > m.score_b! ? 'text-[#10b981] font-black text-xl' : 'text-white font-black text-xl'}>{m.score_a ?? 0}</span>
                            <span className="mx-1 text-[#444]">-</span>
                            <span className={m.score_b! > m.score_a! ? 'text-[#10b981] font-black text-xl' : 'text-white font-black text-xl'}>{m.score_b ?? 0}</span>
                          </div>
                          <div className={`flex-1 font-black italic text-lg uppercase tracking-tighter text-left pl-4 ${m.score_b! > m.score_a! ? 'text-white' : 'text-[#444]'}`}>
                            {m.team_b}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}