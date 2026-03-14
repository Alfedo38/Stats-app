import PlayerChartContainer from '@/components/PlayerChartContainer';
import { getPlayerData } from '@/lib/api';
import { ArrowLeft, Target, Sparkles, Activity } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const NAV_STATS = [
  { id: 'pts', label: 'PTS' }, { id: 'ast', label: 'AST' }, { id: 'reb', label: 'REB' },
  { id: 'pts+ast', label: 'PTS+AST' }, { id: 'pts+reb', label: 'PTS+REB' },
  { id: 'reb+ast', label: 'REB+AST' }, { id: 'pts+reb+ast', label: 'P+R+A' },
  { id: 'fgm', label: 'FGM' }, { id: 'fga', label: 'FGA' }, { id: 'fg3m', label: '3PTM' },
  { id: 'fg3a', label: '3PTA' }, { id: 'blk', label: 'BLK' }, { id: 'stl', label: 'STL' },
  { id: 'stl+blk', label: 'STL+BLK' }, { id: 'tov', label: 'TO' }, { id: 'pf', label: 'PF' },
];

export default async function PlayerPage({ params }: { params: { playerId: string } }) {
  const data = await getPlayerData(params.playerId);

  if (!data || !data.player) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-[#10b981] font-black uppercase tracking-[0.3em] text-xs">Jugador no encontrado</div>;
  }

  const { player, stats } = data;

  return (
    <main className="min-h-screen bg-black text-white font-sans pb-20 selection:bg-[#10b981]/30">
      <nav className="border-b border-[#111] bg-black/90 backdrop-blur-md sticky top-0 z-50 overflow-hidden">
        <div className="px-6 py-4 flex items-center border-b border-[#111]">
          <Link href="/" className="text-[#666] hover:text-white transition-colors flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em]">
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
        </div>
      </nav>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8">
        <div className="relative bg-[#0a0a0a] border border-[#171717] rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden flex justify-between items-end h-[200px] md:h-[280px]">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#10b981] opacity-[0.03] blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-20 flex flex-col justify-end h-full">
            <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter leading-[0.85] uppercase drop-shadow-xl">
              {player.first_name} <br/>
              <span className="text-[#10b981]">{player.last_name}</span>
            </h1>
          </div>
          <div className="absolute -right-4 md:right-10 bottom-0 w-[240px] md:w-[380px] pointer-events-none z-10">
            <img 
              src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.id}.png`} 
              alt={player.full_name}
              className="w-full h-auto object-cover object-bottom drop-shadow-[0_0_25px_rgba(0,0,0,1)]"
            />
          </div>
        </div>

        {/* Pasamos los stats serializados al componente de la gráfica que SI es client-side */}
        <PlayerChartContainer stats={stats} navStats={NAV_STATS} />
      </div>
    </main>
  );
}