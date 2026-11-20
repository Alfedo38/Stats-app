import {MINUTES_MIN_GAMES,type SeasonMinutes} from '@/lib/minutesDistribution';
const fmt=(value:number)=>value.toLocaleString('es-AR',{maximumFractionDigits:1});
export function AbsenceMinutes({withMinutes,withoutMinutes}:{withMinutes:SeasonMinutes[];withoutMinutes:SeasonMinutes[]}){
 if(![...withMinutes,...withoutMinutes].some(s=>s.count>0))return null;
 const seasons=[...new Set([...withMinutes,...withoutMinutes].map(s=>s.season))];
 return <div className="my-2 min-w-0 rounded-lg border border-[var(--border)] px-3 py-2 text-xs">
  <p className="font-bold">Referencia de minutos · partido completo</p>
  <div className="overflow-x-auto"><table className="mt-1 w-full text-left"><thead><tr><th scope="col">Temporada</th><th scope="col">Con</th><th scope="col">Sin</th></tr></thead>
   <tbody>{seasons.map(season=><tr className="border-t border-[var(--border)]" key={season}><th scope="row" className="pr-3">{season}</th>{[withMinutes,withoutMinutes].map((group,i)=>{
    const s=group.find(row=>row.season===season);return <td key={i} className="py-1.5 pr-2">{s?.average!=null?<><strong>{fmt(s.average)} min</strong><small className="block text-[var(--text-muted)]">{s.count} PJ · mediana {fmt(s.median!)}{s.typical?` · usual ${fmt(s.typical[0])}–${fmt(s.typical[1])}`:' · muestra chica'}</small></>:'Sin muestra'}</td>;
   })}</tr>)}</tbody></table></div>
  <p className="mt-1 text-[var(--text-muted)]">El rango contiene la mitad central de la muestra, desde {MINUTES_MIN_GAMES} partidos. Es una referencia histórica de rotación.</p>
 </div>;
}
