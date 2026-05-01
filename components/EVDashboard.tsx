"use client";
import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function EVDashboard({ plays }: { plays: any[] }) {
  // Estado para la pestaña activa
  const [activeTab, setActiveTab] = useState<'HOY' | 'FUTUROS'>('HOY');
  
  // Filtramos los bloques según la pestaña
  const filteredPlays = plays?.filter(p => activeTab === 'HOY' ? p.is_today : !p.is_today) || [];

  // Seleccionamos por defecto el primer bloque de la lista filtrada
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);

  // Si cambiamos de pestaña, auto-seleccionamos el primer partido de esa pestaña
  useEffect(() => {
    if (filteredPlays.length > 0) {
      setSelectedBlock(filteredPlays[0]);
    } else {
      setSelectedBlock(null);
    }
  }, [activeTab, plays]);

  if (!plays || plays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl">
        <AlertCircle size={40} className="text-[#444] mb-4" />
        <p className="text-[#666] font-bold uppercase tracking-widest text-sm">Los casinos ajustaron. No hay Edge en la pizarra.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      
      {/* 🗂️ SISTEMA DE PESTAÑAS (TABS) */}
      <div className="flex gap-4 border-b border-[#222] pb-0">
        <button 
          onClick={() => setActiveTab('HOY')}
          className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'HOY' 
              ? 'text-[#10b981] border-b-2 border-[#10b981]' 
              : 'text-[#666] hover:text-[#aaa]'
          }`}
        >
          Cartelera de Hoy
        </button>
        <button 
          onClick={() => setActiveTab('FUTUROS')}
          className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'FUTUROS' 
              ? 'text-purple-500 border-b-2 border-purple-500' 
              : 'text-[#666] hover:text-[#aaa]'
          }`}
        >
          Líneas Tempranas (Mañana)
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* COLUMNA IZQUIERDA: Bloques de Partidos */}
        <div className="w-full lg:w-1/3 flex flex-col gap-3 max-h-[75vh] overflow-y-auto pr-2">
          {filteredPlays.length === 0 ? (
             <div className="p-6 text-center border border-dashed border-[#333] rounded-2xl bg-[#0a0a0a]">
               <p className="text-[#666] text-xs font-bold uppercase tracking-widest">No hay líneas disponibles para esta fecha.</p>
             </div>
          ) : (
            filteredPlays.map((bloque, idx) => {
              const isSelected = selectedBlock?.matchup === bloque.matchup && selectedBlock?.guion === bloque.guion;
              const isOver = bloque.guion === 'OVER';
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedBlock(bloque)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-2 ${
                    isSelected 
                      ? isOver 
                        ? 'bg-[#111] border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.1)]' 
                        : 'bg-[#111] border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                      : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#333] hover:bg-[#111]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{isOver ? '🔥' : '🧊'}</span>
                    <div>
                      <h3 className="text-sm font-black uppercase text-white leading-tight">
                        {bloque.matchup.split(' (')[0]}
                      </h3>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${isOver ? 'text-orange-500' : 'text-cyan-500'}`}>
                        GUION {isOver ? 'OFENSIVO' : 'DEFENSIVO'}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* COLUMNA DERECHA: El Panel de Tickets */}
        <div className="w-full lg:w-2/3 sticky top-8">
          {selectedBlock && (
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6 shadow-xl relative overflow-hidden">
              
              <div className="mb-6 relative z-10 border-b border-[#222] pb-4">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">
                  {selectedBlock.matchup.split(' (')[0]}
                </h2>
                <p className={`text-xs font-bold uppercase tracking-widest ${selectedBlock.guion === 'OVER' ? 'text-orange-500' : 'text-cyan-500'}`}>
                  SAME GAME PARLAYS • SOLO {selectedBlock.guion}S
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedBlock.tickets.map((ticket: any, tIdx: number) => (
                  <div key={tIdx} className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden flex flex-col">
                    
                    <div className="p-4 bg-black/50 border-b border-[#222] flex justify-between items-center">
                      <h3 className="font-bold text-white text-sm uppercase">{ticket.name}</h3>
                      <span className="bg-[#10b981]/10 text-[#10b981] text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest">
                        CUOTA {ticket.total_odds.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-4 flex-grow space-y-4">
                      {ticket.plays.map((play: any, pIdx: number) => (
                        <div key={pIdx} className="space-y-2 border-b border-[#222] pb-3 last:border-0 last:pb-0">
                          
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-black text-white text-sm leading-none">
                                {play.player} <span className="text-[10px] text-[#666] ml-1">{play.team}</span>
                              </p>
                              <p className="text-xs font-bold mt-1 uppercase">
                                <span className={play.type === 'OVER' ? 'text-orange-500' : 'text-cyan-500'}>
                                  {play.type}
                                </span>{' '}
                                <span className="text-[#ccc]">{play.line} {play.prop}</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] uppercase tracking-widest text-[#666]">Cuota</p>
                              <p className="font-mono text-white text-sm">{play.odds.toFixed(2)}</p>
                            </div>
                          </div>

                          {/* Datos Sharp (Con decimales arreglados) */}
                          <div className="flex gap-4 items-center bg-black p-2 rounded-xl">
                            <div className="flex-1 text-center border-r border-[#222]">
                               <p className="text-[9px] uppercase tracking-widest text-[#666]">Proy IA</p>
                               <p className="text-xs font-bold text-white">{play.proj}</p>
                             </div>
                             <div className="flex-1 text-center border-r border-[#222]">
                               <p className="text-[9px] uppercase tracking-widest text-[#666]">Edge</p>
                               <p className="text-xs font-bold text-[#10b981]">+{Number(play.edge).toFixed(1)}%</p>
                             </div>
                             <div className="flex-1 text-center">
                               <p className="text-[9px] uppercase tracking-widest text-[#666]">Acierto L5</p>
                               <p className="text-xs font-bold text-white">
  {play.hit_rate ? play.hit_rate.split(' ')[0] : '0/5'}
</p>
                             </div>
                          </div>

                          {play.injuries && (
     <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider mt-2">{play.injuries}</p>
  )}
  
  {/* 🛡️ CAJA DE ALTERNATIVA SEGURA Y EXPLICACIÓN */}
  {(play.safe_line && play.safe_odds !== 99) && (
    <div className="mt-4 bg-[#10b981]/5 border border-[#10b981]/20 rounded-xl p-3 relative overflow-hidden">
      {/* Resplandor de fondo */}
      <div className="absolute -right-4 -top-4 w-12 h-12 bg-[#10b981] opacity-10 blur-xl rounded-full" />
      
      <div className="flex items-center justify-between mb-1.5 relative z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🛡️</span>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#10b981]">Opción Segura</p>
        </div>
        <p className="font-mono text-white text-xs font-bold bg-black/50 px-2 py-0.5 rounded border border-[#333]">
          Cuota {play.safe_odds?.toFixed(2)}
        </p>
      </div>
      
      <p className="text-sm font-black text-white mb-2 relative z-10">
        <span className={play.type === 'OVER' ? 'text-orange-500' : 'text-cyan-500'}>{play.type}</span> {play.safe_line} {play.prop}
      </p>
      
     {/* EL "POR QUÉ" DEL ANALISTA */}
<div className="border-t border-[#10b981]/10 pt-2 relative z-10">
  <p className="text-[10px] text-[#888] leading-relaxed">
    <strong className="text-[#aaa]">Análisis Pro:</strong> {play.analysis || `La IA proyecta ${play.proj} ${play.prop}. Al ajustar la línea a ${play.safe_line}, neutralizamos la varianza.`}
  </p>
</div>
    </div>
  )}

</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}