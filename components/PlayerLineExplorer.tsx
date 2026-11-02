"use client";
import {ChevronDown,SlidersHorizontal} from 'lucide-react';
import {comparePlayerLines} from '@/lib/playerLineComparison';

type Props={stats:Record<string,any>[];line:number;side:'over'|'under';marketLabel:string;onSelectLine?:(line:number)=>void;formatLine?:(line:number)=>string;loading?:boolean;error?:string|null};
const number=(n:number|null)=>n===null?'S/D':Number.isInteger(n)?String(n):n.toFixed(1);
const percentage=(n:number|null)=>n===null?'S/D':`${Math.round(n)}%`;
export default function PlayerLineExplorer({stats,line,side,marketLabel,onSelectLine,formatLine=number,loading=false,error=null}:Props){
 const report=comparePlayerLines(loading||error?[]:stats,line,side),label=side==='under'?'Under':'Over';
 const unavailable=loading||!!error||report.summary.valid===0||report.lines.length===0;
 return <details className="group border-b border-[var(--border)]" data-testid="player-line-explorer">
  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm font-bold text-[var(--text)] outline-offset-[-3px] focus-visible:outline-2 focus-visible:outline-[#10b981] [&::-webkit-details-marker]:hidden">
   <span className="flex min-w-0 items-center gap-2"><SlidersHorizontal size={16} className="shrink-0 text-[#10b981]"/><span>Comparar líneas <span className="font-normal text-[var(--text-muted)]">· L5 / L10 / L20</span></span></span><ChevronDown size={16} className="shrink-0 text-[var(--text-muted)] transition group-open:rotate-180 motion-reduce:transition-none"/>
  </summary>
  <div className="space-y-4 border-t border-[var(--border)] px-3 py-4 sm:px-5">
   <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]"><span>{label} {formatLine(line)} · {marketLabel}</span><span>{report.summary.total} PJ · mismos filtros del gráfico</span></div>
   <div className="grid grid-cols-3 gap-2" aria-label="Aciertos por ventana dentro de la muestra">
    {report.windows.map(window=><div key={window.requested} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5">
     <p className="text-xs font-bold text-[var(--text-muted)]">L{window.requested}</p>
     <p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">{percentage(window.summary.rate)}</p>
     <p className="text-xs tabular-nums text-[#10b981]">{window.summary.rate===null?'S/D':`${window.summary.hits}/${window.summary.decided}`} aciertos</p>
     <p className="mt-1 text-[11px] text-[var(--text-muted)]">{window.available}/{window.requested} PJ disponibles{window.summary.missing>0?` · ${window.summary.missing} S/D`:''}{window.summary.pushes>0?` · ${window.summary.pushes} empate(s)`:''}</p>
    </div>)}
   </div>
   <div className="grid grid-cols-2 gap-2 text-xs">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><p className="text-[var(--text-muted)]">Mediana de la muestra</p><p className="mt-1 text-base font-black tabular-nums text-[var(--text)]">{number(report.summary.median)}</p></div>
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><p className="text-[var(--text-muted)]">Rango central · P25–P75</p><p className="mt-1 text-base font-black tabular-nums text-[var(--text)]">{report.range.count?`${number(report.range.low)} – ${number(report.range.high)}`:'S/D'}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{report.range.count} PJ con dato{report.range.count>0&&report.range.count<5?' · muestra corta':''}</p></div>
   </div>
   <div>
    <p className="mb-2 text-xs font-bold text-[var(--text)]">Probar otra línea en el gráfico</p>
    <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={`Comparar líneas ${label} de ${marketLabel}`}>
     {report.lines.map(candidate=><button key={candidate.line} type="button" disabled={unavailable||!onSelectLine} aria-pressed={candidate.selected} aria-label={`${label} ${formatLine(candidate.line)} ${marketLabel}: ${candidate.summary.rate===null?'sin datos':`${candidate.summary.hits} de ${candidate.summary.decided} aciertos históricos`}`} onClick={()=>{if(!unavailable&&onSelectLine)onSelectLine(candidate.line);}} className={`min-w-0 rounded-xl border px-1 py-3 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10b981] disabled:cursor-default disabled:opacity-50 ${candidate.selected?'border-[#10b981] bg-[#10b981]/10':'border-[var(--border)] bg-[var(--bg)] hover:border-[#10b981]/50'}`}>
      <span className="block text-sm font-black tabular-nums text-[var(--text)]">{formatLine(candidate.line)}</span>
      <span className="mt-1 block text-xs font-bold tabular-nums text-[#10b981]">{percentage(candidate.summary.rate)}</span>
      <span className="mt-1 block text-[10px] tabular-nums text-[var(--text-muted)]">{candidate.summary.rate===null?'S/D':`${candidate.summary.hits}/${candidate.summary.decided}`}</span>
     </button>)}
    </div>
   </div>
   <p className="text-xs leading-relaxed text-[var(--text-muted)]">{loading?'Actualizando la muestra…':error?'No se pudo cargar esta muestra.':unavailable?'Sin datos válidos para comparar esta línea.':report.summary.decided===0?'Todos los resultados válidos empatan la línea actual. Podés elegir otra línea para comparar.':'Frecuencias históricas de la muestra seleccionada. Los empates y datos ausentes quedan fuera del porcentaje; no es una probabilidad del próximo partido.'}</p>
   {!unavailable&&<p className="text-xs leading-relaxed text-[var(--text-muted)]">Al elegir una línea se actualizan el gráfico y la selección. Su cuota y disponibilidad se consultan en el panel de casas.</p>}
  </div>
 </details>;
}
