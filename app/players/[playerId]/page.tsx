import PlayerChartContainer from '@/components/PlayerChartContainer';
import { getPlayerData } from '@/lib/api';
import { ArrowLeft, Zap, Target, MousePointer2, GitMerge } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const NAV_STATS = [
  { id: 'pts', label: 'PTS' }, { id: 'ast', label: 'AST' }, { id: 'reb', label: 'REB' },
  { id: 'pts+ast', label: 'PTS+AST' }, { id: 'pts+reb', label: 'PTS+REB' },
  { id: 'reb+ast', label: 'REB+AST' }, { id: 'pts+reb+ast', label: 'P+R+A' },
  { id: 'fgm', label: 'FGM' }, { id: 'fga', label: 'FGA' }, { id: 'fg3m', label: '3PTM' },
  { id: 'fg3a', label: '3PTA' }, { id: 'blk', label: 'BLK' }, { id: 'stl', label: 'STL' },
  { id: 'stl+blk', label: 'STL+BLK' }, { id: 'tov', label: 'TO' }, { id: 'pf', label: 'PF' },
  { id: 'usage_pct', label: 'USG%' }, 
  { id: 'potential_ast', label: 'POT AST' }, 
  { id: 'rebound_chances', label: 'REB CH' },
  { id: 'touches', label: 'TOUCHES' }
];

export default async function PlayerPage(props: any) {
  try {
    const params = await Promise.resolve(props.params);
    const playerId = params?.playerId;
    const data = await getPlayerData(playerId);
    if (!data || !data.player) return null;

    const { player, stats } = data;

    const cleanStats = Array.isArray(stats) ? stats.map(s => {
        // 🐛 FIX FECHAS: Aislamos la fecha y forzamos el mediodía para matar el bug del Timezone
        let fixedDate = s.game_date ? String(s.game_date) : null;
        if (fixedDate && fixedDate.includes('T')) {
            fixedDate = fixedDate.split('T')[0] + 'T12:00:00';
        } else if (fixedDate) {
            fixedDate = fixedDate + 'T12:00:00';
        }

        return {
            ...s,
            game_date: fixedDate,
            usage_pct: Number(s.usage_pct) || 0,
            // Agregamos un salvavidas por si en Supabase la columna se llama pot_ast
            potential_ast: Number(s.potential_ast || s.pot_ast) || 0,
            rebound_chances: Number(s.rebound_chances) || 0,
            touches: Number(s.touches) || 0,
        };
    }).sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()) : [];

    // Cálculos para la barra horizontal (Last 5)
    const last5 = cleanStats.slice(0, 5);
    
    // 🐛 FIX CEROS: Controlamos si la estadística está vacía en la base de datos
    const calcAvg = (key: string) => {
        if (!last5.length) return "0.0";
        const sum = last5.reduce((acc, curr) => acc + (curr[key] || 0), 0);
        // Si la suma da cero absoluto en stats avanzadas, es porque la DB no tiene los datos de ese jugador
        if (sum === 0 && (key === 'potential_ast' || key === 'rebound_chances' || key === 'touches')) {
            return "S/D";
        }
        return (sum / last5.length).toFixed(1);
    };

    return (
      <main className="min-h-screen bg-black text-white font-sans pb-20">
        <nav className="border-b border-[#111] bg-black/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
            <Link href="/" className="text-[#444] hover:text-white transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <ArrowLeft size={14} /> Back to Dashboard
            </Link>
        </nav>

        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
          
          {/* HEADER COMPACTO (Modo Quant) */}
          <div className="relative bg-[#0a0a0a] border border-[#171717] rounded-[2.5rem] p-8 md:p-12 overflow-hidden flex flex-col justify-center h-[220px] md:h-[300px] group hover:border-[#222] transition-colors">
            
            {/* Brillo de fondo sutil */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#10b981] opacity-[0.03] blur-[120px] rounded-full pointer-events-none" />
            
            <div className="relative z-20 flex items-center justify-between">
              <div>
                <p className="text-[#10b981] text-[10px] font-black uppercase tracking-[0.4em] mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></span>
                  MoskProps Player Analytics
                </p>
                <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter leading-[0.85] uppercase">
                  {player.first_name}<br/>
                  <span className="text-[#10b981]">{player.last_name}</span>
                </h1>
              </div>
              
              {/* Escudo CSS con Iniciales del Jugador (Reemplaza a la foto) */}
              <div className="hidden md:flex w-32 h-32 rounded-full border border-[#222] bg-black items-center justify-center shrink-0 shadow-2xl">
                 <span className="font-black text-6xl tracking-tighter text-[#222] group-hover:text-[#444] transition-colors">
                   {player.first_name?.charAt(0)}{player.last_name?.charAt(0)}
                 </span>
              </div>
            </div>
          </div>

          {/* 🔥 BARRA DE ANÁLISIS SHARP */}
          <div className="bg-[#0a0a0a] border border-[#171717] rounded-2xl p-4 flex flex-wrap items-center justify-around gap-6 shadow-xl">
            <div className="flex items-center gap-3">
              <Zap size={18} className="text-[#10b981]" />
              <div>
                <p className="text-[8px] font-black text-[#444] uppercase tracking-widest">Usage Rate</p>
                <p className="text-xl font-black italic">
                  {calcAvg('usage_pct') !== "S/D" ? `${(Number(calcAvg('usage_pct')) * 100).toFixed(1)}%` : "S/D"}
                </p>
              </div>
            </div>
            <div className="w-[1px] h-8 bg-[#1a1a1a] hidden md:block" />
            <div className="flex items-center gap-3">
              <GitMerge size={18} className="text-blue-500" />
              <div>
                <p className="text-[8px] font-black text-[#444] uppercase tracking-widest">Pot. Assists</p>
                <p className="text-xl font-black italic">{calcAvg('potential_ast')}</p>
              </div>
            </div>
            <div className="w-[1px] h-8 bg-[#1a1a1a] hidden md:block" />
            <div className="flex items-center gap-3">
              <Target size={18} className="text-red-500" />
              <div>
                <p className="text-[8px] font-black text-[#444] uppercase tracking-widest">Reb. Chances</p>
                <p className="text-xl font-black italic">{calcAvg('rebound_chances')}</p>
              </div>
            </div>
            <div className="w-[1px] h-8 bg-[#1a1a1a] hidden md:block" />
            <div className="flex items-center gap-3">
              <MousePointer2 size={18} className="text-orange-500" />
              <div>
                <p className="text-[8px] font-black text-[#444] uppercase tracking-widest">Ball Touches</p>
                <p className="text-xl font-black italic">{calcAvg('touches')}</p>
              </div>
            </div>
          </div>

          <PlayerChartContainer stats={cleanStats} navStats={NAV_STATS} />
          
        </div>
      </main>
    );
  } catch (error: any) {
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