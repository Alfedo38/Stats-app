"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
// Asegúrate de tener esta función en tu lib/api.ts que busque los jugadores de un equipo
import { getTeamPlayers } from '@/lib/api'; 

export default function TeamRosterPage() {
  const params = useParams();
  const teamId = params.teamId as string; 
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Llamamos a tu base de datos
    getTeamPlayers(teamId).then((data) => {
      setPlayers(data);
      setLoading(false);
    });
  }, [teamId]);

  return (
    <main className="min-h-screen bg-black text-white font-sans pb-20">
      
      {/* NAVBAR PREMIUM */}
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
        
        {/* HEADER DEL EQUIPO */}
        <div className="flex items-center gap-6 bg-[#111] border border-[#222] rounded-3xl p-6 shadow-xl relative overflow-hidden">
          {/* Brillo de fondo sutil */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#10b981] opacity-5 blur-[100px] rounded-full pointer-events-none" />
          
          <img 
            src={`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${teamId.toLowerCase()}.png`} 
            alt={teamId} 
            className="w-24 h-24 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] z-10"
          />
          <div className="z-10">
            <p className="text-[#10b981] font-bold text-[10px] uppercase tracking-[0.3em]">Official Roster</p>
            <h1 className="text-5xl font-black uppercase tracking-tighter">{teamId}</h1>
          </div>
        </div>

        {/* LISTA DE JUGADORES */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Users size={14} className="text-[#666]" />
            <h2 className="text-[#666] font-bold text-[10px] uppercase tracking-[0.3em]">
              Active Players ({players.length})
            </h2>
          </div>

          {loading ? (
            <div className="text-[#888] text-sm font-bold animate-pulse uppercase tracking-widest px-2">Loading roster...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {players.map((player: any) => (
                <Link href={`/players/${player.id}`} key={player.id} className="block no-underline">
                  <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 hover:bg-[#111] hover:border-[#10b981] hover:-translate-y-1 transition-all group flex flex-col items-center gap-4 relative overflow-hidden">
                    
                    {/* FOTO DEL JUGADOR (Truco CDN NBA) */}
                    <div className="w-full h-[120px] bg-[#151515] rounded-xl flex items-end justify-center overflow-hidden border border-[#222] group-hover:border-[#10b981]/30 transition-colors">
                      <img 
                        // Intenta cargar la foto oficial, si falla, se queda el fondo gris oscuro
                        src={`https://cdn.nba.com/headshots/nba/latest/260x190/${player.id}.png`} 
                        alt={player.first_name}
                        className="h-[110%] object-cover object-bottom drop-shadow-xl group-hover:scale-110 transition-transform duration-500"
                        onError={(e) => {
                          // Si no hay foto, oculta la imagen rota
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>

                    <div className="text-center w-full">
                      <h3 className="font-black text-sm text-white uppercase tracking-tight truncate w-full">
                        {player.first_name} <br/> <span className="text-[#10b981]">{player.last_name}</span>
                      </h3>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}