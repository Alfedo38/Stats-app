"use client";

import { useState, useEffect } from 'react';
import PlayerChart from '@/components/PlayerChart';
import { Target, Sparkles } from 'lucide-react';

interface PlayerChartContainerProps {
  stats: any[];
  navStats: { id: string, label: string }[];
}

export default function PlayerChartContainer({ stats, navStats }: PlayerChartContainerProps) {
  const [activeStat, setActiveStat] = useState('pts');
  const [lastN, setLastN] = useState(10);
  const [lineValue, setLineValue] = useState(18.5);

  // 1. FILTRO ANTI-DUPLICADOS
  const uniqueStats = Array.from(
    new Map(
      (stats || []).map((s: any) => {
        const fechaUnica = s.game_date ? String(s.game_date).split('T')[0] : (s.date || s.id);
        return [fechaUnica, s];
      })
    ).values()
  );

  // 2. Cálculo de la línea sugerida (Fijando el .5)
  useEffect(() => {
    if (uniqueStats.length > 0) {
      const recent = uniqueStats.slice(0, 10);
      let total = 0;
      recent.forEach((s: any) => {
        if (activeStat.includes('+')) {
          const parts = activeStat.split('+');
          total += parts.reduce((acc, part) => acc + (Number(s[part]) || 0), 0);
        } else {
          let val = Number(s[activeStat]) || 0;
          if (activeStat === 'usage_pct') val = val * 100;
          total += val;
        }
      });
      const avg = total / (recent.length || 1);
      
      if (['usage_pct', 'potential_ast', 'rebound_chances'].includes(activeStat)) {
        setLineValue(Number(avg.toFixed(1)));
      } else {
        // Clavamos la línea sugerida inicial siempre en .5
        setLineValue(Math.floor(avg) + 0.5);
      }
    }
  }, [activeStat, stats]);

  // 3. Procesamos los datos según la stat activa
  const processedStats = uniqueStats.map((s: any) => {
    let val = 0;
    if (activeStat.includes('+')) {
      const parts = activeStat.split('+');
      val = parts.reduce((acc, part) => acc + (Number(s[part]) || 0), 0);
    } else {
      let rawVal = Number(s[activeStat]) || 0;
      val = activeStat === 'usage_pct' ? rawVal * 100 : rawVal;
    }
    
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

      {/* CONTROLES (L5, L10, LINEA) */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-[#0a0a0a] border border-[#171717] rounded-2xl p-4 gap-6 shadow-xl">
        <div className="flex bg-black p-1 rounded-xl border border-[#222] w-full md:w-auto">
          {[20, 10, 5].map((n) => (
            <button key={n} onClick={() => setLastN(n)}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black transition-all ${lastN === n ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]' : 'text-[#666] hover:text-white border border-transparent'}`}>
              L{n}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-6 md:gap-8 w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[8px] text-[#666] font-black uppercase tracking-[0.2em] flex items-center gap-1 mb-1">
              <Sparkles size={10} className="text-[#10b981]"/> Custom Line
            </span>
            
            {/* 🔥 NUEVO COMPONENTE DE LÍNEA CUSTOM (+ / -) */}
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
                // Clases especiales de Tailwind para ocultar las flechitas nativas del navegador
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
        <div className="h-[350px] w-full">
          <PlayerChart data={visibleStats} statKey="value" lineValue={lineValue} />
        </div>
      </div>
    </div>
  );
}