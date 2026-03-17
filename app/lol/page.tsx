import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Globe, Activity, Swords, Flame, CalendarClock, Trophy } from 'lucide-react';

const prisma = new PrismaClient();

export default async function LolDashboard() {
  // 1. Buscamos los últimos partidos para mostrar resultados reales
  const recentRaw = await prisma.matches_lol.findMany({
    orderBy: { date: 'desc' },
    take: 20, 
  });

  // Agrupamos por game_id para tener los dos equipos del mismo match
  const matchesMap: Record<string, any[]> = {};
  recentRaw.forEach(m => {
    if (!matchesMap[m.game_id]) matchesMap[m.game_id] = [];
    matchesMap[m.game_id].push(m);
  });

  const recentMatches = Object.values(matchesMap)
    .filter(pair => pair.length === 2)
    .slice(0, 4); 

  // 2. Calculamos el "Meta" (campeones más usados)
  const topPicks = await prisma.player_stats_lol.groupBy({
    by: ['champion'],
    _count: { champion: true },
    orderBy: { _count: { champion: 'desc' } },
    take: 5,
  });

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* HEADER CON ESTÉTICA MOSKPROPS */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#1a1a1a] pb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333] shadow-[0_0_30px_rgba(59,130,246,0.1)]">
              <Globe className="text-blue-500" size={32} />
            </div>
            <div>
              <h1 className="text-5xl font-black italic uppercase tracking-tighter">Global <span className="text-[#10b981]">Hub</span></h1>
              <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">
                Estadísticas en tiempo real • Temporada 2026
              </p>
            </div>
          </div>
          <div className="bg-[#111] border border-[#222] rounded-xl px-4 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
            <span className="text-xs font-black tracking-widest text-[#10b981] uppercase">Base de datos Activa</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* LADO IZQUIERDO: AGENDA Y RESULTADOS */}
          <div className="xl:col-span-8 space-y-6">
            
            {/* AGENDA (PRÓXIMOS PARTIDOS) */}
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500 opacity-5 blur-3xl rounded-full" />
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-6">
                <CalendarClock size={16} className="text-indigo-500" /> Agenda de Hoy (ARG)
              </h2>
              <div className="py-12 flex flex-col items-center justify-center border border-dashed border-[#222] rounded-2xl bg-[#111]/30">
                <CalendarClock size={32} className="text-[#333] mb-4" />
                <p className="text-sm font-bold text-[#666] uppercase tracking-widest">Sincronizando Fixture...</p>
                <p className="text-[10px] text-[#444] mt-2">Los próximos partidos aparecerán automáticamente.</p>
              </div>
            </div>

            {/* ÚLTIMOS RESULTADOS REALES */}
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6">
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-6">
                <Swords size={16} className="text-red-500" /> Resultados de ayer
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentMatches.map((pair: any, idx) => {
                  const win = pair.find((p: any) => p.win);
                  const loss = pair.find((p: any) => !p.win);
                  return (
                    <div key={idx} className="bg-[#111] border border-[#222] rounded-2xl p-4 hover:border-[#333] transition-all">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">{win.league}</span>
                        <span className="text-[10px] font-bold text-[#444]">{win.date.toLocaleDateString('es-AR')}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-black italic uppercase">{win.team_name}</span>
                          <span className="text-[#10b981] font-black">W</span>
                        </div>
                        <div className="flex justify-between items-center opacity-40">
                          <span className="text-lg font-black italic uppercase">{loss.team_name}</span>
                          <span className="text-red-500 font-black">L</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* LADO DERECHO: META Y LIGAS */}
          <div className="xl:col-span-4 space-y-6">
            
            {/* TERMÓMETRO DEL META */}
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6">
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-6">
                <Flame size={16} className="text-orange-500" /> El Meta del Parche
              </h2>
              <div className="space-y-4">
                {topPicks.map((pick, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[#111] border border-[#222] rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-[#444]">#{i+1}</span>
                      <span className="text-sm font-black text-gray-200 uppercase">{pick.champion}</span>
                    </div>
                    <span className="text-xs font-black text-orange-500">{pick._count.champion} <span className="text-[9px] text-[#444]">GAMES</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* ACCESO RÁPIDO A LIGAS */}
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6">
              <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#666] flex items-center gap-2 mb-6">
                <Trophy size={16} className="text-yellow-500" /> Torneos Activos
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {['FST', 'LCK', 'LPL', 'LEC'].map(league => (
                  <Link href="/lol/teams" key={league} className="p-3 bg-[#111] border border-[#222] rounded-xl text-center hover:border-yellow-500/50 transition-all">
                    <span className="text-sm font-black italic uppercase text-gray-400">{league}</span>
                  </Link>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}