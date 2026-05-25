"use client";

import { useState } from 'react';
import { Trophy, ChevronDown, ChevronUp, Users, Activity, ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Componente principal de UI
export default function LeaguesClient({ initialData }: { initialData: Record<string, string[]> }) {
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null);

  // Aseguramos que data no sea null y ordenamos
  const safeData = initialData || {};
  const sortedLeagues = Object.keys(safeData).sort((a, b) => {
    const tiers = ['LCK', 'LPL', 'LEC', 'LCS'];
    const aIndex = tiers.indexOf(a);
    const bIndex = tiers.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20">
      <div className="max-w-[1200px] mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex items-center gap-4 border-b border-[#1a1a1a] pb-8">
          <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333] shadow-[0_0_20px_rgba(16,185,129,0.05)]">
            <Trophy className="text-[#10b981]" size={32} />
          </div>
          <div>
            <h1 className="text-5xl font-black italic uppercase tracking-tighter">Directorio de <span className="text-[#10b981]">Ligas</span></h1>
            <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em] mt-1">Explorador de Regiones y Rosters Activos</p>
          </div>
        </div>

        {/* ACORDEÓN DE LIGAS */}
        <div className="space-y-4">
          {sortedLeagues.map((league) => (
            <div key={league} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-[2rem] overflow-hidden transition-all shadow-lg">
              
              {/* Botón Principal de la Liga */}
              <button 
                onClick={() => setExpandedLeague(expandedLeague === league ? null : league)}
                className={`w-full flex items-center justify-between p-6 hover:bg-[#111] transition-colors ${expandedLeague === league ? 'bg-[#111]' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <Trophy size={20} className={['LCK', 'LPL', 'LEC', 'LCS'].includes(league) ? 'text-yellow-500' : 'text-blue-500'} />
                  <span className="text-2xl font-black italic uppercase tracking-tighter">{league}</span>
                  <span className="text-[10px] font-bold text-[#444] bg-black px-2 py-1 rounded-md border border-[#222]">
                    {safeData[league].length} EQUIPOS
                  </span>
                </div>
                {expandedLeague === league ? <ChevronUp size={24} className="text-[#444]" /> : <ChevronDown size={24} className="text-[#444]" />}
              </button>

              {/* Contenido Desplegable (Equipos de la liga) */}
              {expandedLeague === league && (
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/50 border-t border-[#1a1a1a]">
                  {safeData[league].map((team: string) => (
                    <TeamCard key={team} teamName={team} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// --- SUB-COMPONENTE: TARJETA DE EQUIPO (Muestra Jugadores) ---
function TeamCard({ teamName }: { teamName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [roster, setRoster] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchRoster = async () => {
    if (!isOpen && !roster) {
      setLoading(true);
      try {
        const res = await fetch(`/api/draft?action=roster&team=${encodeURIComponent(teamName)}`);
        const data = await res.json();
        setRoster(data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className={`border ${isOpen ? 'border-[#10b981]/30 bg-[#0d0d0d]' : 'border-[#1a1a1a] bg-[#0a0a0a]'} rounded-3xl p-5 transition-all`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#111] rounded-xl flex items-center justify-center border border-[#222]">
            <Activity size={18} className="text-[#10b981]" />
          </div>
          <h3 className="font-black italic uppercase text-lg hover:text-[#10b981] transition-colors">{teamName}</h3>
        </div>
        
        <button 
          onClick={fetchRoster}
          className="bg-[#111] hover:bg-[#222] p-2 rounded-xl border border-[#333] transition-colors flex items-center gap-2"
        >
          {loading ? (
            <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest px-1 animate-pulse">Cargando...</span>
          ) : isOpen ? (
            <span className="text-[10px] font-black text-red-500 uppercase px-1 tracking-widest">Cerrar</span>
          ) : (
            <>
              <Users size={16} className="text-[#666]" />
              <span className="text-[9px] font-black text-[#666] uppercase tracking-widest pr-1">Roster</span>
            </>
          )}
        </button>
      </div>

      {isOpen && roster && (
        <div className="mt-5 pt-5 border-t border-[#1a1a1a] space-y-2 animate-in fade-in slide-in-from-top-2">
          {!roster.error ? (
            Object.entries(roster).map(([pos, player]: any) => (
              <Link 
                href={`/lol/players/${encodeURIComponent(player || 'none')}`} 
                key={pos} 
                className="flex items-center justify-between p-3 bg-[#111] rounded-xl hover:border-[#10b981]/50 border border-transparent transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-[#444] w-7 text-center group-hover:text-[#10b981] transition-colors">{pos}</span>
                  <span className="text-sm font-bold uppercase tracking-tight text-gray-200 group-hover:text-white transition-colors">
                    {player || <span className="text-[#444] italic">Vacante</span>}
                  </span>
                </div>
                <ChevronRight size={14} className="text-[#333] group-hover:text-[#10b981] transition-colors" />
              </Link>
            ))
          ) : (
            <p className="text-[10px] font-bold text-[#444] uppercase text-center py-4">{roster.error || 'Sin datos recientes'}</p>
          )}
        </div>
      )}
    </div>
  );
}