import { getTeamPlayers } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function TeamRosterPage(props: any) {
  try {
    const params = await Promise.resolve(props.params);
    
    let rawId = params?.teamId;
    if (Array.isArray(rawId)) rawId = rawId[0];
    const teamId = typeof rawId === 'string' ? rawId.trim() : "";

    const displayId = teamId ? teamId.toUpperCase() : "---";
    const logoId = teamId ? teamId.toLowerCase() : "";

    let players: any[] = [];
    if (teamId) {
        const res = await getTeamPlayers(teamId);
        players = Array.isArray(res) ? res : [];
    }

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
            
            {/* onError BORRADO */}
            {logoId && (
              <img 
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
                Active Players ({players.length})
              </h2>
            </div>

            {players.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {players.map((player: any) => (
                  <Link href={`/players/${player.id || ''}`} key={player.id || Math.random()} className="block no-underline">
                    <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 hover:bg-[#111] hover:border-[#10b981] transition-all group flex flex-col items-center gap-4">
                      <div className="w-full h-[120px] bg-[#151515] rounded-xl flex items-end justify-center overflow-hidden border border-[#222]">
                        {/* onError BORRADO */}
                        <img 
                          src={`https://cdn.nba.com/headshots/nba/latest/260x190/${player.id}.png`} 
                          alt={player.full_name}
                          className="h-[110%] object-cover object-bottom"
                        />
                      </div>
                      <div className="text-center w-full">
                        <h3 className="font-black text-sm text-white uppercase tracking-tight">{player.full_name || 'Desconocido'}</h3>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[#444] text-xs font-black uppercase tracking-widest text-center py-10">
                No se encontraron jugadores para "{displayId}".
              </p>
            )}
          </section>
        </div>
      </main>
    );
  } catch (error: any) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 text-center">
        <h1 className="text-red-500 font-black text-3xl mb-4 uppercase tracking-tighter">Crash Detectado</h1>
        <p className="text-[#888] mb-4 text-xs font-bold uppercase tracking-widest">El servidor encontró un problema:</p>
        <pre className="bg-[#111] border border-[#333] p-6 rounded-xl text-xs text-left overflow-auto max-w-2xl text-red-400">
          {error?.message || "Error desconocido. Revisa los logs de Vercel."}
        </pre>
        <Link href="/" className="mt-8 border border-[#333] px-6 py-3 rounded-xl uppercase text-xs font-black tracking-widest hover:bg-[#222] hover:text-[#10b981] transition-all">
          Volver al Dashboard
        </Link>
      </div>
    );
  }
}