import { getTeamPlayers } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function TeamRosterPage({ params }: { params: { teamId: string } }) {
  // Limpiamos el teamId por si viene con espacios o caracteres raros
  const rawTeamId = params?.teamId || "";
  const teamId = rawTeamId.trim();
  
  const displayId = teamId ? teamId.toUpperCase() : "---";
  const logoId = teamId ? teamId.toLowerCase() : "";

  // Llamamos a la API con el ID limpio
  const players = await getTeamPlayers(teamId);

  return (
    <main className="min-h-screen bg-black text-white font-sans pb-20">
      <nav className="border-b border-[#222] bg-black sticky top-0 z-50">
        <div className="px-6 py-4 max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/" className="text-[#888] hover:text-[#10b981] transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">
            Mosk<span className="text-[#10b981]">Props</span>
          </h1>
        </div>
      </nav>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-6 bg-[#111] border border-[#222] rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#10b981] opacity-5 blur-[100px] rounded-full pointer-events-none" />
          
          {logoId && (
            <img 
              // CORREGIDO: "scoreboard" en lugar de "coreboard"
              src={`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${logoId}.png`} 
              alt={displayId} 
              className="w-24 h-24 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] z-10"
            />
          )}
          
          <div className="z-10">
            <p className="text-[#10b981] font-bold text-[10px] uppercase tracking-[0.3em]">Official Roster</p>
            <h1 className="text-5xl font-black uppercase tracking-tighter">{displayId}</h1>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Users size={14} className="text-[#666]" />
            <h2 className="text-[#666] font-bold text-[10px] uppercase tracking-[0.3em]">
              Active Players ({players?.length || 0})
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {players && players.map((player: any) => (
              <Link href={`/players/${player.id}`} key={player.id} className="block no-underline">
                <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 hover:bg-[#111] hover:border-[#10b981] hover:-translate-y-1 transition-all group flex flex-col items-center gap-4 relative overflow-hidden">
                  <div className="w-full h-[120px] bg-[#151515] rounded-xl flex items-end justify-center overflow-hidden border border-[#222] group-hover:border-[#10b981]/30 transition-colors">
                    <img 
                      src={`https://cdn.nba.com/headshots/nba/latest/260x190/${player.id}.png`} 
                      alt={player.full_name}
                      className="h-[110%] object-cover object-bottom drop-shadow-xl group-hover:scale-110 transition-transform duration-500"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                  <div className="text-center w-full">
                    <h3 className="font-black text-sm text-white uppercase tracking-tight truncate w-full">
                      {player.full_name}
                    </h3>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          
          {(!players || players.length === 0) && (
             <p className="text-[#444] text-xs font-black uppercase tracking-widest text-center py-10">No se encontraron jugadores. Revisa la abreviación en la base de datos.</p>
          )}
        </section>
      </div>
    </main>
  );
}