"use client";

import { useState } from 'react';
import { Shield, Trophy, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

export default function TeamsClient({ leaguesData }: { leaguesData: any[] }) {
  // Estado para controlar qué ligas están abiertas. 
  // Por defecto, abrimos la primera (generalmente LCK) para que no se vea vacío al entrar.
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>({
    [leaguesData[0]?.name]: true 
  });

  const toggleLeague = (leagueName: string) => {
    setExpandedLeagues(prev => ({
      ...prev,
      [leagueName]: !prev[leagueName]
    }));
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 relative overflow-hidden">
      {/* Luz ambiental azul para la sección de equipos */}
      <div className="absolute top-0 right-0 w-1/2 h-[500px] bg-blue-600/5 blur-[120px] pointer-events-none" />

      <div className="max-w-[1200px] mx-auto space-y-8 relative z-10">
        
        {/* HEADER */}
        <div className="flex items-center gap-4 border-b border-[#1a1a1a] pb-8">
          <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333] shadow-[0_0_30px_rgba(59,130,246,0.1)]">
            <Shield className="text-blue-500" size={32} />
          </div>
          <div>
            <h1 className="text-5xl font-black italic uppercase tracking-tighter">Directorio de <span className="text-blue-500">Equipos</span></h1>
            <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">Seleccioná un equipo para ver su historial completo</p>
          </div>
        </div>

        {/* LISTADO POR LIGAS (ACORDEONES) */}
        <div className="space-y-4">
          {leaguesData.map((league) => {
            const isOpen = expandedLeagues[league.name];

            return (
              <section key={league.name} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2rem] overflow-hidden shadow-lg transition-all">
                
                {/* BOTÓN DEL ACORDEÓN */}
                <button 
                  onClick={() => toggleLeague(league.name)}
                  className={`w-full flex items-center justify-between p-6 hover:bg-[#111] transition-colors ${isOpen ? 'bg-[#111] border-b border-[#1a1a1a]' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <Trophy size={20} className={['LCK', 'LPL', 'LEC', 'LCS'].includes(league.name) ? 'text-yellow-500' : 'text-[#666]'} />
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter">{league.name}</h2>
                    <span className="text-[10px] font-bold text-[#444] bg-black px-3 py-1 rounded-md border border-[#222]">
                      {league.teams.length} Equipos
                    </span>
                  </div>
                  {isOpen ? <ChevronUp size={24} className="text-[#444]" /> : <ChevronDown size={24} className="text-[#444]" />}
                </button>

                {/* TABLA DE EQUIPOS (CONTENIDO DESPLEGABLE) */}
                {isOpen && (
                  <div className="overflow-x-auto bg-[#050505]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#1a1a1a]">
                          <th className="p-5 pl-8 text-[10px] font-black uppercase text-[#444] tracking-widest">Equipo</th>
                          <th className="p-5 text-center text-[10px] font-black uppercase text-[#444] tracking-widest">PJ</th>
                          <th className="p-5 text-center text-[10px] font-black uppercase text-[#10b981] tracking-widest">Win Rate</th>
                          <th className="p-5 text-center text-[10px] font-black uppercase text-blue-500 tracking-widest">KDA</th>
                          <th className="p-5 pr-8 text-right text-[10px] font-black uppercase text-[#444] tracking-widest">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1a1a1a]">
                        {league.teams.map((team) => {
                          const winRateNum = (team.wins / team.pj) * 100;
                          const winRate = winRateNum.toFixed(1);
                          const kda = (team.kills / Math.max(1, team.deaths)).toFixed(2);
                          
                          // Detalle visual: Color de Win Rate según rendimiento
                          const wrColor = winRateNum >= 50 ? 'text-[#10b981]' : 'text-red-500';

                          return (
                            <tr key={team.name} className="hover:bg-[#111] transition-colors group">
                              <td className="p-5 pl-8 font-black italic text-lg uppercase text-gray-200 group-hover:text-blue-400 transition-colors">
                                {team.name}
                              </td>
                              <td className="p-5 text-center font-bold text-gray-500">{team.pj}</td>
                              <td className="p-5 text-center">
                                <span className={`font-black ${wrColor}`}>{winRate}%</span>
                              </td>
                              <td className="p-5 text-center font-bold text-gray-400">{kda}</td>
                              <td className="p-5 pr-8 text-right">
                                <Link 
                                  href={`/lol/teams/${encodeURIComponent(team.name)}`}
                                  className="inline-flex items-center gap-2 bg-[#1a1a1a] hover:bg-blue-600/10 border border-[#222] hover:border-blue-500/30 px-4 py-2 rounded-xl transition-all"
                                >
                                  <span className="text-[9px] font-black uppercase tracking-widest text-[#888] group-hover:text-blue-400">Ver Stats</span>
                                  <ChevronRight size={14} className="text-[#444] group-hover:text-blue-400" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>

      </div>
    </main>
  );
}