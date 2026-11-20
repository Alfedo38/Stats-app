import {selectionSummary,type SelectionSide} from '@/lib/selectionStats';
import type {SeasonWindow} from '@/lib/seasonWindows';
const average=(n:number)=>n.toLocaleString('es-AR',{maximumFractionDigits:1});
export function SeasonWindows({seasons,line,side}:{seasons:SeasonWindow[];line:number;side:SelectionSide}){
 return <details className="mosk-season-windows text-xs">
  <summary className="cursor-pointer font-bold">L5 y L10 por temporada</summary>
  <div className="mt-2 overflow-x-auto"><table className="w-full text-left">
   <thead><tr><th scope="col">Temporada</th><th scope="col">Últimos 5</th><th scope="col">Últimos 10</th></tr></thead>
   <tbody>{seasons.map(({season,values})=><tr key={season} className="border-t border-[var(--border)]"><th scope="row" className="py-2 pr-3">{season}</th>{[5,10].map(n=>{
    const s=selectionSummary(values.slice(0,n),line,side);
    return <td key={n} className="py-2 pr-3"><strong>{s.rate===null?'—':`${s.hits}/${s.decided} ${side==='under'?'por debajo':'por encima'}`}</strong><small className="block text-[var(--text-muted)]">{s.average===null?'Sin datos':`Prom. ${average(s.average)}`} · {s.valid}/{n} PJ con dato{s.pushes?` · ${s.pushes} en la línea`:''}</small></td>;
   })}</tr>)}</tbody></table></div>
  <p className="mt-2 text-[var(--text-muted)]">Cada temporada conserva su propia muestra con los filtros activos.</p>
 </details>;
}
