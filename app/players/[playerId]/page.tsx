import PlayerChartContainer from '@/components/PlayerChartContainer';
import { getPlayerData } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';
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

export default async function PlayerPage(props: any) {
  try {
    // 1. Resolvemos params de la forma más segura
    const params = await Promise.resolve(props.params);
    
    // 2. Extraemos el ID y aseguramos que sea un string limpio
    let rawId = params?.playerId;
    if (Array.isArray(rawId)) rawId = rawId[0];
    const playerId = typeof rawId === 'string' ? rawId.trim() : "";

    if (!playerId) {
      throw new Error("El ID del jugador es nulo o inválido.");
    }

    // 3. Buscamos la data
    const data = await getPlayerData(playerId);

    if (!data || !data.player) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
          <div className="text-[#10b981] font-black uppercase tracking-[0.3em] text-xs animate-pulse">
            Jugador no encontrado ({playerId})
          </div>
          <Link href="/" className="text-[#444] hover:text-white text-[10px] font-black uppercase tracking-widest border border-[#222] px-4 py-2 rounded-lg transition-all">
            Volver al Inicio
          </Link>
        </div>
      );
    }

    const { player, stats } = data;

    // 4. Limpieza Extrema de Estadísticas para evitar crashes de hidratación
    // A veces Prisma devuelve valores raros que rompen React.
    const cleanStats = Array.isArray(stats) ? stats.map(s => {
      return {
        ...s,
        // Forzamos a que sean strings o null para no romper el cliente
        game_date: s.game_date ? String(s.game_date) : null,
        // Convertimos valores que podrían ser null a 0
        pts: Number(s.pts) || 0,
        ast: Number(s.ast) || 0,
        reb: Number(s.reb) || 0,
      }
    }) : [];

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
                {player.first_name || 'Nombre'} <br/>
                <span className="text-[#10b981]">{player.last_name || 'Desconocido'}</span>
              </h1>
            </div>

            <div className="absolute -right-4 md:right-10 bottom-0 w-[240px] md:w-[380px] pointer-events-none z-10">
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent z-20"></div>
              <img 
                src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.id}.png`} 
                alt={player.full_name || 'Jugador'}
                className="w-full h-auto object-cover object-bottom drop-shadow-[0_0_25px_rgba(0,0,0,1)]"
                onError={(e) => { e.currentTarget.style.opacity = '0'; }}
              />
            </div>
          </div>

          {/* Pasamos los stats 100% limpios */}
          <PlayerChartContainer stats={cleanStats} navStats={NAV_STATS} />
          
        </div>
      </main>
    );
  } catch (error: any) {
    // ⚠️ EL DETECTOR DE MENTIRAS ⚠️
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 text-center">
        <h1 className="text-red-500 font-black text-3xl mb-4 uppercase tracking-tighter">Error en Jugador</h1>
        <p className="text-[#888] mb-4 text-xs font-bold uppercase tracking-widest">Detalle del servidor:</p>
        <pre className="bg-[#111] border border-[#333] p-6 rounded-xl text-xs text-left overflow-auto max-w-2xl text-red-400 whitespace-pre-wrap">
          {error?.message || error?.toString() || "Error desconocido. Revisa los logs de Vercel."}
        </pre>
        <Link href="/" className="mt-8 border border-[#333] px-6 py-3 rounded-xl uppercase text-xs font-black tracking-widest hover:bg-[#222] hover:text-[#10b981] transition-all">
          Volver al Inicio
        </Link>
      </div>
    );
  }
}