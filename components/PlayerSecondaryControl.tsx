import {selectedSecondary,secondaryOptions,secondaryAxis,type SecondaryChoice} from '@/lib/playerRecentChange';
import type {EvidenceRow} from '@/lib/marketEvidence';
import {secondaryValue} from '@/lib/playerRecentChange';

export default function PlayerSecondaryControl({market,marketLabel,choice,onChange,rows,disabled=false}:{market:string;marketLabel:string;choice:SecondaryChoice;onChange:(value:SecondaryChoice)=>void;rows:EvidenceRow[];disabled?:boolean}){
 const selected=selectedSecondary(market,choice),axis=secondaryAxis(market,selected?.id),valid=selected?rows.filter(row=>secondaryValue(row,selected.id)!==null).length:0;
 return <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-[var(--text-muted)]">Comparar en el gráfico<select aria-label="Segunda estadística del gráfico" value={choice} disabled={disabled} onChange={e=>onChange(e.target.value as SecondaryChoice)} className="max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs font-bold text-[var(--text)]"><option value="auto">Automático</option><option value="none">Sin segunda estadística</option>{secondaryOptions(market).map(m=><option value={m.id} key={m.id}>{m.label}</option>)}</select></label>{selected&&<span className="text-[10px] font-bold text-cyan-300">{valid}/{rows.length} PJ con {selected.label.toLowerCase()}</span>}</div>
  {selected&&<p className="mt-2 text-[10px] leading-4 text-[var(--text-muted)]">Barras: {marketLabel} · eje izquierdo. Línea punteada: {selected.label.toLowerCase()} · {axis==='left'?'misma escala que las barras.':'eje derecho, en otra unidad. Compará sus números, no las alturas.'} {valid===0?'No hay datos de esta métrica en la muestra.':valid<rows.length?'Los datos ausentes dejan huecos en la línea.':''}</p>}
 </div>;
}
