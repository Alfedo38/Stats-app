'use client';
import {IMPACT_UNITS,ROLE_STATS,impactDelta,impactDirection,type RoleStats,type AutoImpactItem,type AutoImpactPlayer} from '@/lib/jornadaAbsenceImpact';
import type {JornadaMarket} from '@/lib/nbaJornada';
import {cleanAbsences} from '@/lib/nbaGameFilters';
import styles from './JornadaAbsenceImpact.module.css';
const number=(n:number|null)=>n===null?'S/D':n.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
function RoleGrid({role}:{role:RoleStats[]}){
 return <div className="grid grid-cols-3 gap-2 py-2" aria-label="Cambio por partido">
 {role.map(r=><div key={r.metric}><small className="block">{ROLE_STATS[r.metric]}</small>
  <strong className={r.delta===null?'text-[var(--text-muted)]':r.delta>0?'text-emerald-400':r.delta<0?'text-rose-400':''}>{r.delta===null?'S/D':impactDelta(r.delta)}</strong>
  <small className="block text-[var(--text-muted)]">{r.withCount} con · {r.withoutCount} sin</small></div>)}
 </div>;
}
function Impact({item,market,onApplyAbsences}:{item:AutoImpactItem;market:JornadaMarket;onApplyAbsences?:(names:string[])=>void}){
 const direction=impactDirection(item),unit=IMPACT_UNITS[market];
 return <details className={styles.item} key={item.teammateId}>
  <summary><span>Sin {item.name}</span><strong data-direction={direction}>{direction==='missing'?'Muestra insuficiente':`${direction==='up'?'↑':direction==='down'?'↓':'→'} ${impactDelta(item.difference!)} ${unit}`}</strong><small>{item.withoutCount} PJ</small></summary>
  <div className={styles.detail}>
   <div><span>Con {item.name}</span><strong>{number(item.withAverage)} {unit}</strong><small>{item.withCount} partidos con dato</small></div>
   <div><span>Sin {item.name}</span><strong>{number(item.withoutAverage)} {unit}</strong><small>{item.withoutCount} partidos con dato</small></div>
   <p>Promedio por partido · temporada actual y anterior · mismo equipo. {direction==='missing'?'Se necesitan 5 partidos con dato en cada grupo.':'Diferencia: sin − con; no es una predicción.'}{item.unknown>0?` ${item.unknown} PJ sin presencia/ausencia confirmada, excluidos.`:''}{item.conflicts>0?` ${item.conflicts} PJ contradictorios, excluidos.`:''}</p>
  </div>
  {item.role&&<RoleGrid role={item.role}/>}
  {onApplyAbsences&&item.withoutCount>0&&<button type="button" className="mt-1 text-xs font-bold text-emerald-400" onClick={()=>onApplyAbsences([item.name])}>Ver partidos sin {item.name} en el gráfico →</button>}
  {item.minutes?.without.filter(s=>s.count>0).map(s=><p className="mt-1 text-[var(--text-muted)]" key={s.season}>
   {s.season} · Minutos sin: <strong>{number(s.average)}</strong> ({s.count} PJ){s.typical?` · usual ${number(s.typical[0])}–${number(s.typical[1])}`:' · muestra chica'}
  </p>)}
 </details>;
}
export default function JornadaAbsenceImpact({data,market,onApplyAbsences}:{data:AutoImpactPlayer|null;market:JornadaMarket;onApplyAbsences?:(names:string[])=>void}){
 if(!data||data.status==='none'||data.status==='unavailable')return null;
 if(data.status==='player_out')return <span className={styles.out}>Fuera para este partido</span>;
 if(!data.items.length)return null;
 return <div className={styles.impact} aria-label="Impacto de bajas confirmadas">
  {data.items.slice(0,2).map(item=><Impact key={item.teammateId} item={item} market={market} onApplyAbsences={onApplyAbsences}/>)}
  {data.joint&&<details className={styles.more}><summary>Sin estos compañeros a la vez</summary>
   <p>{data.joint.names.join(' · ')}</p><RoleGrid role={data.joint.role}/>
   {onApplyAbsences&&cleanAbsences(data.joint.names).length===data.joint.names.length&&data.joint.role[0]?.withoutCount>0&&<button type="button" className="text-xs font-bold text-emerald-400" onClick={()=>onApplyAbsences(data.joint!.names)}>Ver los partidos en el gráfico →</button>}
  </details>}
  {data.items.length>1&&!data.joint&&<small className="text-[var(--text-muted)]">Cada comparación es individual. Las bajas simultáneas pueden cambiar el rol.</small>}
  {data.items.length>2&&<details className={styles.more}><summary>{data.items.length-2} {data.items.length===3?'baja más':'bajas más'}</summary>{data.items.slice(2).map(item=><Impact key={item.teammateId} item={item} market={market} onApplyAbsences={onApplyAbsences}/>)}</details>}
 </div>;
}
