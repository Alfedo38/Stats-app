"use client";
import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import PickHorizontal from './PickHorizontal';

export default function EVDashboard({ plays }: { plays: any[] }) {
  const [activeTab, setActiveTab] = useState<'HOY' | 'FUTUROS'>('HOY');
  const filteredPlays = plays?.filter(p => activeTab === 'HOY' ? p.is_today : !p.is_today) || [];
  
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);
  
  // 🟢 NUEVO ESTADO: Controla qué ticket (X2, X5, etc.) estamos viendo adentro del partido
  const [activeTicketIdx, setActiveTicketIdx] = useState<number>(0);

  // Auto-seleccionar el primer partido al cambiar de pestaña
  useEffect(() => {
    if (filteredPlays.length > 0) {
      setSelectedBlock(filteredPlays[0]);
    } else {
      setSelectedBlock(null);
    }
  }, [activeTab, plays]);

  // 🟢 MAGIA: Si el usuario cambia de partido, reseteamos el menú interno al primer ticket (X2)
  useEffect(() => {
    setActiveTicketIdx(0);
  }, [selectedBlock]);

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
      
      {/* TABS PRINCIPALES */}
      <div className="flex gap-4 border-b border-[#222] pb-0">
        <button 
          onClick={() => setActiveTab('HOY')}
          className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'HOY' ? 'text-[#10b981] border-b-2 border-[#10b981]' : 'text-[#666] hover:text-[#aaa]'
          }`}
        >
          Cartelera de Hoy
        </button>
        <button 
          onClick={() => setActiveTab('FUTUROS')}
          className={`pb-3 px-2 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'FUTUROS' ? 'text-purple-500 border-b-2 border-purple-500' : 'text-[#666] hover:text-[#aaa]'
          }`}
        >
          Líneas Tempranas (Mañana)
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* MENÚ IZQUIERDO: Partidos */}
        <div className="w-full lg:w-1/4 flex flex-col gap-3 max-h-[75vh] overflow-y-auto pr-2">
          {filteredPlays.length === 0 ? (
             <div className="p-6 text-center border border-dashed border-[#333] rounded-2xl bg-[#0a0a0a]">
               <p className="text-[#666] text-xs font-bold uppercase tracking-widest">No hay líneas.</p>
             </div>
          ) : (
            filteredPlays.map((bloque, idx) => {
              const isSelected = selectedBlock?.matchup === bloque.matchup && selectedBlock?.guion === bloque.guion;
              const isOver = bloque.guion === 'OVER';
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedBlock(bloque)}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex flex-col gap-2 ${
                    isSelected 
                      ? isOver 
                        ? 'bg-[#111] border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]' 
                        : 'bg-[#111] border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                      : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#333] hover:bg-[#111]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{isOver ? '🔥' : '🧊'}</span>
                    <div>
                      <h3 className="text-xs font-black uppercase text-white leading-tight">
                        {bloque.matchup.split(' (')[0]}
                      </h3>
                      <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${isOver ? 'text-orange-500' : 'text-cyan-500'}`}>
                        GUION {isOver ? 'OFENSIVO' : 'DEFENSIVO'}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* PANEL DERECHO: Tickets */}
        <div className="w-full lg:w-3/4 sticky top-8">
          {selectedBlock && (
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-6 shadow-xl">
              
              <div className="mb-6 border-b border-[#222] pb-4">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">
                  {selectedBlock.matchup.split(' (')[0]}
                </h2>
                <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${selectedBlock.guion === 'OVER' ? 'text-orange-500' : 'text-cyan-500'}`}>
                  SAME GAME PARLAYS • SOLO {selectedBlock.guion}S
                </p>
              </div>

              {/* 🟢 SUB-MENÚ INTERNO (Botonera para elegir el ticket X2, X5, etc.) */}
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedBlock.tickets.map((ticket: any, idx: number) => {
                  const isActive = activeTicketIdx === idx;
                  const isHuge = ticket.name.includes('X10') || ticket.name.includes('X5');
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveTicketIdx(idx)}
                      className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                        isActive 
                          ? 'bg-[#10b981] text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                          : 'bg-[#111] text-[#888] border border-[#222] hover:bg-[#1a1a1a] hover:text-white'
                      }`}
                    >
                      {isHuge ? '🚀' : '💎'} {ticket.name}
                    </button>
                  );
                })}
              </div>

              {/* 🟢 RENDERIZAMOS SOLO EL TICKET SELECCIONADO */}
              {selectedBlock.tickets[activeTicketIdx] && (
                <div className="bg-transparent flex flex-col gap-4 animate-in fade-in duration-300">
                  
                  <div className="flex justify-between items-end border-b border-[#333] pb-2">
                    <h3 className="font-black text-white text-xl uppercase tracking-tight">
                      {selectedBlock.tickets[activeTicketIdx].name}
                    </h3>
                    <div className="text-right">
                       <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Cuota Total</p>
                       <span className="bg-[#10b981] text-black text-sm px-3 py-1 rounded-md font-black uppercase tracking-widest">
                         {selectedBlock.tickets[activeTicketIdx].total_odds?.toFixed(2)}
                       </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {selectedBlock.tickets[activeTicketIdx].plays.map((play: any, pIdx: number) => (
                      <PickHorizontal key={pIdx} play={play} />
                    ))}
                  </div>
                  
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}