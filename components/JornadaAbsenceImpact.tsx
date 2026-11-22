'use client';
import {useState} from 'react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import type {quarterRole} from '@/lib/nbaSubstitutions';
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
type QuarterPayload={quarters:ReturnType<typeof quarterRole>};
function QuarterImpact({samples,playerId}:{samples:NonNullable<AutoImpactItem['quarterSamples']>;playerId:number}){
 const [open,setOpen]=useState(false);
 const yes=useAnalysisQuery<QuarterPayload>(open&&samples.with.length?'/api/nba-rotaciones':null,{playerId,gameIds:samples.with},15000);
 const no=useAnalysisQuery<QuarterPayload>(open&&samples.without.length?'/api/nba-rotaciones':null,{playerId,gameIds:samples.without},15000);
 const rows=yes.data?.quarters,other=no.data?.quarters;
 return <details className={styles.more} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Comparar minutos por cuarto</summary>
  {open&&(yes.loading||no.loading?<p>Verificando rotaciones de los dos grupos…</p>:yes.error||no.error?<p>La comparación no está disponible ahora.</p>:!rows?.[0]?.games||!other?.[0]?.games?<p>Faltan rotaciones conciliadas para uno de los grupos.</p>:<>
   <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">{rows.map((q,i)=>{const a=other[i],valid=q.games>=5&&a.games>=5&&q.minutes!==null&&a.minutes!==null;
    return <div key={q.quarter}><dt>Q{q.quarter}</dt><dd>{number(q.minutes)} con · {number(a.minutes)} sin</dd><dd><small>{q.games} / {a.games} PJ</small>{valid&&<strong> · {impactDelta(a.minutes!-q.minutes!)} min</strong>}</dd></div>;
   })}</dl><small>Mediana con y sin el compañero. Se muestra diferencia desde 5 PJ conciliados en cada grupo.</small>
  </>)}
 </details>;
}
function Impact({item,market,onApplyAbsences,playerId}:{item:AutoImpactItem;market:JornadaMarket;playerId?:number;onApplyAbsences?:(names:string[])=>void}){
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
  {item.minutesGuide&&<div className="my-2 grid grid-cols-2 gap-2" aria-label="Minutos con y sin el compañero">
   {(['with','without'] as const).map(k=>{const g=item.minutesGuide![k];return <div key={k}><b>{k==='with'?'Con':'Sin'} · {g.estimate===null?'referencia':'estimación probada'}</b><p>{number(g.estimate??g.history.median)} min · {g.history.count} PJ</p>{g.history.typical&&<small>Mitad central: {number(g.history.typical[0])}–{number(g.history.typical[1])} min</small>}</div>;})}
  </div>}
  {playerId&&item.quarterSamples&&item.quarterSamples.with.length>0&&item.quarterSamples.without.length>0&&<QuarterImpact playerId={playerId} samples={item.quarterSamples}/>}

 </details>;
}
export default function JornadaAbsenceImpact({data,market,onApplyAbsences}:{data:AutoImpactPlayer|null;market:JornadaMarket;onApplyAbsences?:(names:string[])=>void}){
 if(!data||data.status==='none'||data.status==='unavailable')return null;
 if(data.status==='player_out')return <span className={styles.out}>Fuera para este partido</span>;
 if(!data.items.length)return null;
 return <div className={styles.impact} aria-label="Impacto de bajas confirmadas">
  {data.items.slice(0,2).map(item=><Impact key={item.teammateId} item={item} market={market} onApplyAbsences={onApplyAbsences} playerId={onApplyAbsences?data.playerId:undefined}/>)}
  {data.joint&&<details className={styles.more}><summary>Sin estos compañeros a la vez</summary>
   <p>{data.joint.names.join(' · ')}</p><RoleGrid role={data.joint.role}/>
   {onApplyAbsences&&cleanAbsences(data.joint.names).length===data.joint.names.length&&data.joint.role[0]?.withoutCount>0&&<button type="button" className="text-xs font-bold text-emerald-400" onClick={()=>onApplyAbsences(data.joint!.names)}>Ver los partidos en el gráfico →</button>}
  </details>}
  {data.items.length>1&&!data.joint&&<small className="text-[var(--text-muted)]">Cada comparación es individual. Las bajas simultáneas pueden cambiar el rol.</small>}
  {data.items.length>2&&<details className={styles.more}><summary>{data.items.length-2} {data.items.length===3?'baja más':'bajas más'}</summary>{data.items.slice(2).map(item=><Impact key={item.teammateId} item={item} market={market} onApplyAbsences={onApplyAbsences} playerId={onApplyAbsences?data.playerId:undefined}/>)}</details>}
 </div>;
}
