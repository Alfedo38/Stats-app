"use client";
import { useState } from 'react';
import { Target, TrendingUp, AlertCircle } from 'lucide-react';
import PlayerChart from '@/components/PlayerChart'; // 👈 Agrega esta línea

export default function EVDashboard({ plays }: { plays: any[] }) {
  // Guardamos en memoria qué apuesta tiene seleccionada el usuario (por defecto la primera)
  const [selectedPlay, setSelectedPlay] = useState<any | null>(plays.length > 0 ? plays[0] : null);

  if (!plays || plays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl">
        <AlertCircle size={40} className="text-[#444] mb-4" />
        <p className="text-[#666] font-bold uppercase tracking-widest text-sm">No hay apuestas con suficiente Edge para hoy</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      
      {/* COLUMNA IZQUIERDA: La Lista (Scrolleable) */}
      <div className="w-full lg:w-1/2 flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-2">
        {plays.map((play, idx) => {
          // Chequeamos si esta es la tarjeta que está seleccionada ahora mismo
          const isSelected = selectedPlay?.player_name === play.player_name;
          
          return (
            <button
              key={idx}
              onClick={() => setSelectedPlay(play)}
              className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between ${
                isSelected 
                  ? 'bg-[#111] border-[#10b981] shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                  : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#333] hover:bg-[#111]'
              }`}
            >
              {/* Foto y Nombre */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black rounded-full border border-[#222] overflow-hidden flex items-end justify-center shrink-0">
                  <img 
                    src={`https://cdn.nba.com/headshots/nba/latest/260x190/${play.player_id}.png`} 
                    alt={play.player_name}
                    className="w-[120%] h-[120%] object-cover object-bottom"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-[#666] font-black uppercase tracking-widest">{play.team} • {play.matchup}</p>
                  <h3 className="text-sm font-black uppercase text-white">{play.player_name}</h3>
                </div>
              </div>

              {/* Estadísticas de la Tarjeta */}
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-[9px] text-[#666] font-black uppercase tracking-widest">Hit Rate</p>
                  <p className="text-xs font-bold text-white">{play.hit_rate}% <span className="text-[#444]">({play.over_hits}/10)</span></p>
                </div>
                <div className="bg-[#10b981]/10 border border-[#10b981]/30 px-3 py-2 rounded-xl text-center">
                  <p className="text-[9px] text-[#10b981] font-black uppercase tracking-widest mb-0.5">Edge</p>
                  <p className="text-sm font-black text-[#10b981]">+{play.edge}%</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* COLUMNA DERECHA: El Panel Detallado (Fijo en la pantalla) */}
      <div className="w-full lg:w-1/2 sticky top-8">
        {selectedPlay && (
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6 shadow-xl relative overflow-hidden">
            {/* Resplandor verde de fondo */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#10b981] opacity-5 blur-[100px] rounded-full pointer-events-none" />
            
            {/* Cabecera del Jugador */}
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="flex gap-4 items-center">
                <div className="w-20 h-20 bg-[#111] rounded-2xl border border-[#222] overflow-hidden flex items-end justify-center">
                   <img 
                    src={`https://cdn.nba.com/headshots/nba/latest/260x190/${selectedPlay.player_id}.png`} 
                    alt={selectedPlay.player_name}
                    className="w-[120%] h-[120%] object-cover object-bottom"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">{selectedPlay.player_name}</h2>
                  <p className="text-xs text-[#10b981] font-bold uppercase tracking-widest">{selectedPlay.team} • {selectedPlay.matchup}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-[#666] font-black uppercase tracking-widest">Línea Casa</p>
                <p className="text-4xl font-black text-white">{selectedPlay.line}</p>
              </div>
            </div>

            {/* Cajas de Datos Rápidos */}
            <div className="grid grid-cols-2 gap-4 mb-8 relative z-10">
              <div className="bg-[#111] border border-[#222] p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Target size={14} className="text-orange-500" />
                  <p className="text-[10px] text-[#666] font-black uppercase tracking-widest">Promedio L10</p>
                </div>
                <p className="text-2xl font-black text-white">{selectedPlay.avg_last_10}</p>
              </div>
              <div className="bg-[#111] border border-[#222] p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={14} className="text-[#10b981]" />
                  <p className="text-[10px] text-[#666] font-black uppercase tracking-widest">Ventaja Matemática</p>
                </div>
                <p className="text-2xl font-black text-[#10b981]">+{selectedPlay.edge}%</p>
              </div>
            </div>
         {/* Hit Rate Visual (La barrita de progreso) */}
            <div className="space-y-3 relative z-10">
               <div className="flex justify-between items-end">
                 <p className="text-[10px] text-[#666] font-black uppercase tracking-widest">Consistencia (Últimos 10)</p>
                 <p className="text-xs font-bold text-white">{selectedPlay.over_hits} Verdes / {10 - selectedPlay.over_hits} Rojos</p>
               </div>
               
               <div className="w-full h-3 bg-red-500/20 rounded-full overflow-hidden flex">
                 <div 
                   className="h-full bg-[#10b981] transition-all duration-1000" 
                   style={{ width: `${selectedPlay.hit_rate}%` }}
                 />
               </div>
            </div>

            {/* 👇 EL GRÁFICO REAL INYECTADO AQUÍ 👇 */}
            <div className="mt-8 pt-6 border-t border-[#1a1a1a] relative z-10 h-64">
               <PlayerChart 
                 data={selectedPlay.recent_logs} 
                 statKey="value" 
                 lineValue={selectedPlay.line} 
               />
            </div>

          </div>
        )}
      </div>
    </div>
  );
}