"use client";
import { useState } from 'react';
import Link from 'next/link';

// Diccionarios de conferencias
const EAST_TEAMS = ['BOS', 'BKN', 'NYK', 'PHI', 'TOR', 'CHI', 'CLE', 'DET', 'IND', 'MIL', 'ATL', 'CHA', 'MIA', 'ORL', 'WAS'];
const WEST_TEAMS = ['DEN', 'MIN', 'OKC', 'POR', 'UTA', 'GSW', 'LAC', 'LAL', 'PHX', 'SAC', 'DAL', 'HOU', 'MEM', 'NOP', 'SAS'];

export default function TeamGrid({ teams }: { teams: any[] }) {
  const [filter, setFilter] = useState<'ALL' | 'EAST' | 'WEST'>('ALL');

  const safeTeams = teams || [];

  const filteredTeams = safeTeams.filter((team) => {
    const abbr = team.abbreviation?.toUpperCase();
    if (filter === 'EAST') return EAST_TEAMS.includes(abbr);
    if (filter === 'WEST') return WEST_TEAMS.includes(abbr);
    return true;
  });

  return (
    <div className="space-y-6">
      {/* BOTONES DE FILTRO */}
      <div className="flex bg-[#0a0a0a] p-1 rounded-xl border border-[#222] w-full max-w-xs mx-auto md:mx-0">
        {['ALL', 'EAST', 'WEST'].map((f) => (
          <button 
            key={f} 
            onClick={() => setFilter(f as any)}
            className={`flex-1 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              filter === f 
                ? 'bg-[#1a1a1a] text-[#10b981] shadow-md border border-[#333]' 
                : 'text-[#666] hover:text-white border border-transparent'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* GRILLA DE EQUIPOS */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {filteredTeams.map((team: any) => (
          <Link 
            href={`/teams/${team.abbreviation?.toLowerCase()}`} 
            key={team.id} 
            className="block no-underline group"
          >
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[1.2rem] p-3 hover:bg-[#111] hover:border-[#10b981]/50 transition-all flex flex-col items-center gap-2">
              
              {/* Contenedor del Logo con tamaño fijo */}
              <div className="h-[40px] w-full flex items-center justify-center overflow-hidden">
                {team.logo_url ? (
                  <img 
                    src={team.logo_url} /* 👈 ¡MAGIA! Ahora lee directo de tu base de datos */
                    alt={team.name || team.abbreviation} 
                    className="w-10 h-10 min-w-[40px] min-h-[40px] object-contain drop-shadow-md group-hover:scale-110 transition-transform"
                  />
                ) : (
                  <div className="w-10 h-10 bg-[#222] rounded-full animate-pulse" />
                )}
              </div>

              <h3 className="font-black text-[9px] text-[#555] group-hover:text-[#888] uppercase tracking-widest transition-colors">
                {team.abbreviation}
              </h3>
            </div>
          </Link>
        ))}
      </div>

      {/* MENSAJE SI NO HAY EQUIPOS (Debug) */}
      {filteredTeams.length === 0 && (
        <div className="text-center py-10">
          <p className="text-[#444] text-[10px] uppercase font-black tracking-widest">
            No teams found in this conference
          </p>
        </div>
      )}
    </div>
  );
}