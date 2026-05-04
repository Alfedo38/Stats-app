"use client";

import { useState, useEffect } from 'react';
import PlayerChart from '@/components/PlayerChart';
import { Target, Sparkles, Clock } from 'lucide-react';

interface PlayerChartContainerProps {
  stats: any[];
  navStats: { id: string, label: string }[];
}

export default function PlayerChartContainer({ stats, navStats }: PlayerChartContainerProps) {
  const [activeStat, setActiveStat] = useState('pts');
  const [lastN, setLastN] = useState(10);
  const [lineValue, setLineValue] = useState(18.5);
  
  // 🔥 NUEVO ESTADO: Interruptor Q1 vs Partido Completo
  const [isQ1Mode, setIsQ1Mode] = useState(false);

  // 1. FILTRO ANTI-DUPLICADOS (con manejo seguro de datos)
  const uniqueStats = Array.from(
    new Map(
      (stats || []).map((s: any) => {
        const fechaUnica = s.game_date ? String(s.game_date).split('T')[0] : (s.date || s.id);
        return [fechaUnica, s];
      })
    ).values()
  );

  // 🔥 HELPER QUANT: Extrae el valor correcto según estemos en Q1 o Full Game
  const getStatValue = (s: any, statId: string, q1Mode: boolean) => {
    let val = 0;
    
    // Si es una estadística combinada (ej: pts+ast)
    if (statId.includes('+')) {
      const parts = statId.split('+');
      val = parts.reduce((acc, part) => {
        // Busca q1_pts si estamos en modo Q1, sino busca pts
        const key = q1Mode ? `q1_${part}` : part;
        return acc + (Number(s[key]) || 0);
      }, 0);
    } else {
      // Estadística simple
      const key = q1Mode ? `q1_${statId}` : statId;
      let rawVal = Number(s[key]) || 0;
      val = statId === 'usage_pct' ? rawVal * 100 : rawVal;
    }
    return val;
  };

  // 2. Cálculo dinámico de la línea sugerida 
  useEffect(() => {
    if (uniqueStats.length > 0) {
      const recent = uniqueStats.slice(0, 10);
      let total = 0;
      
      recent.forEach((s: any) => {
         total += getStatValue(s, activeStat, isQ1Mode);
      });
      
      const avg = total / (recent.length || 1);
      
      if (['usage_pct', 'potential_ast', 'rebound_chances'].includes(activeStat)) {
        setLineValue(Number(avg.toFixed(1)));
      } else {
        // Clavamos la línea sugerida inicial siempre en .5
        setLineValue(Math.floor(avg) + 0.5);
      }
    }
  }, [activeStat, stats, isQ1Mode]); // <-- Agregamos isQ1Mode a las dependencias

  // 3. Procesamos los datos según la stat activa y el MODO actual
  const processedStats = uniqueStats.map((s: any) => {
    const val = getStatValue(s, activeStat, isQ1Mode);
    
    return { 
      ...s, 
      value: Number(val.toFixed(1)), 
      is_percentage: activeStat === 'usage_pct' 
    };
  });

  const visibleStats = processedStats.slice(0, lastN).reverse();

  const avgValue = visibleStats.length > 0 
    ? (visibleStats.reduce((a, b) => a + b.value, 0) / visibleStats.length).toFixed(1) 
    : "0.0";
  const hits = visibleStats.filter((s) => s.value >= lineValue).length;
  const hitRate = visibleStats.length > 0 
    ? ((hits / visibleStats.length) * 100).toFixed(0) 
    : "0";

  return (
    <div className="space-y-6">
      {/* MENÚ DE ESTADÍSTICAS */}
      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar whitespace-nowrap border-b border-[#111] pb-2">
        {navStats.map((stat) => (
          <button
            key={stat.id}
            onClick={() => setActiveStat(stat.id)}
            className={`py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all 
              ${activeStat === stat.id ? 'border-[#10b981] text-[#10b981] drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'border-transparent text-[#666] hover:text-[#aaa]'}`}
          >
            {stat.label}
          </button>
        ))}
      </div>

      {/* CONTROLES (MODO, L5/L10, LINEA) */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-[#0a0a0a] border border-[#171717] rounded-2xl p-4 gap-6 shadow-xl">
        
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          {/* 🔥 INTERRUPTOR Q1 vs FULL GAME */}
          <div className="flex bg-[#111] p-1 rounded-xl border border-[#222]">
             <button 
              className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black rounded-lg transition-all ${!isQ1Mode ? 'bg-[#10b981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-[#666] hover:text-white'}`}
              onClick={() => setIsQ1Mode(false)}
            >
              <Clock size={12} /> PARTIDO
            </button>
            <button 
              className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black rounded-lg transition-all ${isQ1Mode ? 'bg-[#10b981] text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-[#666] hover:text-white'}`}
              onClick={() => setIsQ1Mode(true)}
            >
              1ER CUARTO
            </button>
          </div>

          <div className="bg-[#222] w-[1px] hidden md:block" />

          {/* RACHAS L5, L10, L20 */}
          <div className="flex bg-black p-1 rounded-xl border border-[#222]">
            {[20, 10, 5].map((n) => (
              <button key={n} onClick={() => setLastN(n)}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black transition-all ${lastN === n ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]' : 'text-[#666] hover:text-white border border-transparent'}`}>
                L{n}
              </button>
            ))}
          </div>
        </div>

        {/* LINEA CUSTOM Y PROMEDIOS */}
        <div className="flex items-center gap-6 md:gap-8 w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[8px] text-[#666] font-black uppercase tracking-[0.2em] flex items-center gap-1 mb-1">
              <Sparkles size={10} className="text-[#10b981]"/> Custom Line
            </span>
            
            <div className="flex items-center bg-black px-2 py-1 rounded-lg border border-[#222]">
              <Target size={14} className="text-red-500 ml-2" />
              
              <button 
                onClick={() => setLineValue(prev => Number((prev - 1).toFixed(1)))}
                className="px-3 text-[#666] hover:text-white font-black text-xl transition-colors select-none"
              >
                -
              </button>

              <input 
                type="number" step="0.5" 
                value={lineValue} 
                onChange={(e) => setLineValue(parseFloat(e.target.value) || 0)}
                className="bg-transparent border-none text-2xl font-black w-14 text-center focus:outline-none text-white p-0 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
              />
              
              <button 
                onClick={() => setLineValue(prev => Number((prev + 1).toFixed(1)))}
                className="px-3 text-[#666] hover:text-white font-black text-xl transition-colors select-none"
              >
                +
              </button>
            </div>

          </div>
          
          <div className="bg-[#222] w-[1px] h-10 hidden md:block" />
          
          <div className="flex flex-col items-end min-w-[70px]">
            <span className="text-[8px] text-[#888] font-black uppercase tracking-[0.2em] mb-1">
              AVG: {avgValue}{activeStat === 'usage_pct' ? '%' : ''}
            </span>
            <span className={`text-3xl font-black tabular-nums leading-none ${Number(hitRate) >= 50 ? 'text-[#10b981]' : 'text-red-500'}`}>
              {hitRate}%
            </span>
          </div>
        </div>
      </div>

      {/* GRÁFICA */}
      <div className="bg-[#0a0a0a] p-4 md:p-6 rounded-[2rem] border border-[#171717] shadow-2xl relative">
        {/* Etiqueta visual sutil cuando estás en modo Q1 */}
        {isQ1Mode && (
          <div className="absolute top-6 right-6 px-3 py-1 bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-[10px] font-black rounded-md tracking-wider z-10">
            DATOS 1ER CUARTO
          </div>
        )}
        <div className="h-[350px] w-full relative">
          <PlayerChart data={visibleStats} statKey="value" lineValue={lineValue} />
        </div>
      </div>
    </div>
  );
}