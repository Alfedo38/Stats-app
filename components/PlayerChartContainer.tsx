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

  // Cada vez que cambie la estadística (ej: pasar de PTS a AST), recalculamos una línea sugerida
  useEffect(() => {
    if (stats && stats.length > 0) {
      const recent = stats.slice(0, 10);
      let total = 0;
      recent.forEach((s: any) => {
        if (activeStat.includes('+')) {
          const parts = activeStat.split('+');
          total += parts.reduce((acc, part) => acc + (Number(s[part]) || 0), 0);
        } else {
          total += (Number(s[activeStat]) || 0);
        }
      });
      const avg = total / (recent.length || 1);
      setLineValue(Math.floor(avg) + 0.5);
    }
  }, [activeStat, stats]);

  // Procesamos los datos para la gráfica según la stat activa
  const processedStats = stats.map((s: any) => {
    let val = 0;
    if (activeStat.includes('+')) {
      const parts = activeStat.split('+');
      val = parts.reduce((acc, part) => acc + (Number(s[part]) || 0), 0);
    } else {
      val = Number(s[activeStat]) || 0;
    }
    return { ...s, value: val };
  });

  // Filtramos por los últimos N partidos y revertimos para que la gráfica vaya de viejo a nuevo
  const visibleStats = processedStats.slice(0, lastN).reverse();

  // Cálculos de la tarjeta de resumen
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
              ${activeStat === stat.id ? 'border-[#10b981] text-[#10b981]' : 'border-transparent text-[#666] hover:text-[#aaa]'}`}
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
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black transition-all ${lastN === n ? 'bg-[#1a1a1a] text-white' : 'text-[#666] hover:text-white'}`}>
              L{n}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-8 w-full md:w-auto justify-between">
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-[#666] font-black uppercase tracking-widest flex items-center gap-1 mb-1">
              <Sparkles size={10} className="text-[#10b981]"/> Custom Line
            </span>
            <div className="flex items-center gap-2 bg-black px-3 py-1 rounded-lg border border-[#222]">
              <Target size={14} className="text-red-500" />
              <input 
                type="number" step="0.5" 
                value={lineValue} 
                onChange={(e) => setLineValue(parseFloat(e.target.value) || 0)}
                className="bg-transparent border-none text-2xl font-black w-16 text-right focus:outline-none text-white tabular-nums" 
              />
            </div>
          </div>
          
          <div className="flex flex-col items-end min-w-[80px]">
            <span className="text-[8px] text-[#888] font-black uppercase tracking-widest mb-1">AVG: {avgValue}</span>
            <span className={`text-3xl font-black ${Number(hitRate) >= 50 ? 'text-[#10b981]' : 'text-red-500'}`}>
              {hitRate}%
            </span>
          </div>
        </div>
      </div>

      {/* GRÁFICA */}
      <div className="bg-[#0a0a0a] p-6 rounded-[2rem] border border-[#171717] shadow-2xl">
        <div className="h-[350px] w-full">
          <PlayerChart data={visibleStats} statKey="value" lineValue={lineValue} />
        </div>
      </div>
    </div>
  );
}