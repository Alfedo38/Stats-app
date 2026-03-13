"use client";
import { useState } from 'react';
import Link from 'next/link';

const EAST_TEAMS = ['BOS', 'BKN', 'NYK', 'PHI', 'TOR', 'CHI', 'CLE', 'DET', 'IND', 'MIL', 'ATL', 'CHA', 'MIA', 'ORL', 'WAS'];
const WEST_TEAMS = ['DEN', 'MIN', 'OKC', 'POR', 'UTA', 'GSW', 'LAC', 'LAL', 'PHX', 'SAC', 'DAL', 'HOU', 'MEM', 'NOP', 'SAS'];

export default function TeamGrid({ teams }: { teams: any[] }) {
  const [filter, setFilter] = useState<'ALL' | 'EAST' | 'WEST'>('ALL');

  const filteredTeams = teams.filter((team) => {
    if (filter === 'EAST') return EAST_TEAMS.includes(team.abbreviation);
    if (filter === 'WEST') return WEST_TEAMS.includes(team.abbreviation);
    return true;
  });

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {filteredTeams.map((team: any) => (
          <Link href={`/teams/${team.abbreviation}`} key={team.id} className="block no-underline">
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[1.2rem] p-3 hover:bg-[#111] hover:border-[#10b981]/50 transition-all flex flex-col items-center gap-2 group">
              <div className="h-[40px] w-full flex items-center justify-center overflow-hidden">
                <img 
                  src={`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${team.abbreviation.toLowerCase()}.png`} 
                  alt={team.abbreviation} 
                  className="w-10 h-10 min-w-[40px] min-h-[40px] object-contain drop-shadow-md group-hover:scale-110 transition-transform"
                />
              </div>
              <h3 className="font-black text-[9px] text-[#555] group-hover:text-[#888] uppercase tracking-widest transition-colors">
                {team.abbreviation}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}