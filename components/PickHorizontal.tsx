"use client";

export default function PickHorizontal({ play }: { play: any }) {
  return (
    <div className="flex flex-col xl:flex-row bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[#444] transition-colors">
      
      {/* 🟢 LADO IZQUIERDO: Info y Stats (40% del ancho en pantallas grandes) */}
      <div className="w-full xl:w-[40%] p-4 border-b xl:border-b-0 xl:border-r border-[var(--border)] flex flex-col justify-between gap-4">
        
        {/* Fila 1: Jugador y Cuota */}
        <div className="flex justify-between items-start">
          <div>
            <h4 className="text-[var(--text)] font-bold text-lg leading-tight">
              {play.player} <span className="text-gray-500 text-xs font-normal ml-1">{play.team}</span>
            </h4>
            <p className={`font-black text-sm uppercase mt-0.5 ${play.type === 'OVER' ? 'text-orange-500' : 'text-cyan-500'}`}>
              {play.type} {play.line} {play.prop}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Cuota</p>
            <p className="text-[var(--text)] font-mono font-bold text-base">{play.odds?.toFixed(2)}</p>
          </div>
        </div>

        {/* Fila 2: Stats Rápidas */}
        <div className="grid grid-cols-3 divide-x divide-[#333] border-t border-[var(--border-strong)] pt-3">
          <div className="text-center">
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Proy IA</p>
            <p className="text-[var(--text)] font-bold text-sm">{play.proj}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Edge</p>
            <p className={`font-bold text-sm ${Number(play.edge) > 20 ? 'text-[#10b981]' : 'text-yellow-500'}`}>
              +{Number(play.edge).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Acierto L5</p>
            <p className="text-[var(--text)] font-bold text-sm">{play.hit_rate ? play.hit_rate.split(' ')[0] : '0/5'}</p>
          </div>
        </div>
      </div>

      {/* 🟢 LADO DERECHO: Descripción de la IA siempre visible (60% del ancho) */}
      <div className="w-full xl:w-[60%] p-4 flex flex-col justify-center bg-[var(--surface-soft)]">
        
        {/* Lesiones / Alertas (Si hay) */}
        {play.injuries && (
          <div className="mb-3 inline-flex items-center gap-1.5 bg-red-500/10 px-2 py-1 rounded border border-red-500/20 w-fit">
            <span className="text-red-500 text-xs">⚠️</span>
            <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{play.injuries}</p>
          </div>
        )}

        <div className="flex items-center gap-2 mb-2">
           <span className="text-[#10b981] text-sm">🤖</span>
           <h5 className="text-[10px] font-black text-[#10b981] uppercase tracking-widest">Scouting AI</h5>
        </div>
        
        <p className="text-[#aaa] text-xs leading-relaxed font-mono">
          {play.analysis || `Proyección quant de ${play.proj} ${play.prop}. Evaluado con algoritmos de Ludogallina.`}
        </p>
        
        {/* Opción Segura */}
        {play.safe_line && play.safe_odds !== 99 && (
          <div className="mt-4 inline-flex items-center gap-3 bg-[#10b981]/10 border border-[#10b981]/20 px-3 py-1.5 rounded-lg w-fit">
             <span className="text-xs">🛡️</span>
             <p className="text-[11px] text-[var(--text)] font-bold uppercase">
               Seguro: <span className="text-[#10b981]">{play.type} {play.safe_line} {play.prop}</span>
             </p>
             <span className="text-[11px] text-gray-400 font-mono border-l border-[#10b981]/30 pl-3">Cuota {play.safe_odds?.toFixed(2)}</span>
          </div>
        )}
      </div>

    </div>
  );
}