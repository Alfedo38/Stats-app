'use client';
import {IMPACT_UNITS,impactDelta,impactDirection,type AutoImpactItem,type AutoImpactPlayer} from '@/lib/jornadaAbsenceImpact';
import type {JornadaMarket} from '@/lib/nbaJornada';
import styles from './JornadaAbsenceImpact.module.css';
const number=(n:number|null)=>n===null?'S/D':n.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
function Impact({item,market}:{item:AutoImpactItem;market:JornadaMarket}){
 const direction=impactDirection(item),unit=IMPACT_UNITS[market];
 return <details className={styles.item} key={item.teammateId}>
  <summary><span>Sin {item.name}</span><strong data-direction={direction}>{direction==='missing'?'Muestra insuficiente':`${direction==='up'?'↑':direction==='down'?'↓':'→'} ${impactDelta(item.difference!)} ${unit}`}</strong><small>{item.withoutCount} PJ</small></summary>
  <div className={styles.detail}>
   <div><span>Con {item.name}</span><strong>{number(item.withAverage)} {unit}</strong><small>{item.withCount} partidos con dato</small></div>
   <div><span>Sin {item.name}</span><strong>{number(item.withoutAverage)} {unit}</strong><small>{item.withoutCount} partidos con dato</small></div>
   <p>Promedio por partido · temporada actual y anterior · mismo equipo. {direction==='missing'?'Se necesitan 5 partidos con dato en cada grupo.':'Diferencia: sin − con; no es una predicción.'}{item.unknown>0?` ${item.unknown} PJ sin presencia/ausencia confirmada, excluidos.`:''}{item.conflicts>0?` ${item.conflicts} PJ contradictorios, excluidos.`:''}</p>
  </div>
 </details>;
}
export default function JornadaAbsenceImpact({data,market}:{data:AutoImpactPlayer|null;market:JornadaMarket}){
 if(!data||data.status==='none'||data.status==='unavailable')return null;
 if(data.status==='player_out')return <span className={styles.out}>Fuera para este partido</span>;
 if(!data.items.length)return null;
 return <div className={styles.impact} aria-label="Impacto de bajas confirmadas">
  {data.items.slice(0,2).map(item=><Impact key={item.teammateId} item={item} market={market}/>)}
  {data.items.length>2&&<details className={styles.more}><summary>{data.items.length-2} {data.items.length===3?'baja más':'bajas más'}</summary>{data.items.slice(2).map(item=><Impact key={item.teammateId} item={item} market={market}/>)}</details>}
 </div>;
}
