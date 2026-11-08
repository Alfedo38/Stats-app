"use client";

import {useMemo,useState} from 'react';
import PlayerChart from './PlayerChart';
import {evidenceMetricIds,type EvidenceRow} from '@/lib/marketEvidence';
import {secondaryOptions,secondaryValue,selectedSecondary,type SecondaryChoice} from '@/lib/playerRecentChange';
import {selectionSummary} from '@/lib/selectionStats';
import styles from './PlayerStatistics.module.css';

const number=(value:number|null)=>value===null?'S/D':value.toLocaleString('es-AR',{maximumFractionDigits:1});

export default function PlayerSupportingStats({market,rows,choice,onChange}:{market:string;rows:EvidenceRow[];choice:SecondaryChoice;onChange:(choice:SecondaryChoice)=>void}){
 const [aggregation,setAggregation]=useState<'average'|'median'>('average');
 const series=useMemo(()=>{
  const suggested=selectedSecondary(market,'auto')?.id;
  const related=evidenceMetricIds(market);
  const options=secondaryOptions(market);
  const order=[suggested,'minutes',...related,...options.map(m=>m.id)];
  return [...new Set(order)].flatMap(id=>{
   const metric=options.find(m=>m.id===id);
   if(!metric)return [];
   const data=rows.map(row=>({...row,comparison:secondaryValue(row,metric.id)}));
   const summary=selectionSummary(data.map(row=>row.comparison),NaN,'over');
   return [{metric,data,summary}];
  });
 },[market,rows]);
 const available=series.filter(item=>item.summary.valid>0);
 const explicit=series.find(item=>item.metric.id===choice);
 const selected=choice==='none'?null:explicit??available[0]??null;
 const featured=available.slice(0,3);
 if(explicit&&!featured.includes(explicit)){if(featured.length===3)featured.pop();featured.push(explicit);}
 const remaining=available.filter(item=>!featured.includes(item));
 if(!rows.length)return null;
 return <section className={styles.support} aria-label="Estadísticas de apoyo">
  <header className={styles.supportHeader}>
   <div><h3>Estadísticas de apoyo</h3><p>Mismos {rows.length} partidos del gráfico · escala propia</p></div>
   {featured.length>0&&<div className={styles.mode} role="group" aria-label="Resumen de apoyo">
    <button type="button" aria-pressed={aggregation==='average'} onClick={()=>setAggregation('average')}>Promedio</button>
    <button type="button" aria-pressed={aggregation==='median'} onClick={()=>setAggregation('median')}>Mediana</button>
   </div>}
  </header>
  {featured.length>0?<>
   <div className={styles.metrics} role="group" aria-label="Elegir estadística de apoyo">
    {featured.map(item=><button key={item.metric.id} type="button" className={styles.metric} aria-pressed={selected?.metric.id===item.metric.id} onClick={()=>onChange(item.metric.id as SecondaryChoice)}>
     <span>{item.metric.label}</span><strong>{number(item.summary[aggregation])}</strong><small>{item.summary.valid}/{rows.length} con dato</small>
    </button>)}
   </div>
   {remaining.length>0&&<label className={styles.extra}>Más métricas<select aria-label="Más estadísticas de apoyo" value="" onChange={event=>onChange(event.target.value as SecondaryChoice)}>
    <option value="" disabled>Elegí otra</option>{remaining.map(item=><option key={item.metric.id} value={item.metric.id}>{item.metric.label}</option>)}
   </select></label>}
   {selected?.summary.valid?<>
    <PlayerChart clean comparisonOnly data={selected.data} statKey="comparison" lineValue={0} height={222} showSeasonBreaks/>
    {selected.summary.missing>0&&<p className={styles.supportNote}>{selected.summary.missing} sin dato o en revisión. Los huecos conservan su lugar en la muestra.</p>}
   </>:<p className={styles.supportNote}>{selected?'Sin dato verificable para esta métrica.':'Elegí una estadística para ver su gráfico.'}</p>}
  </>:<p className={styles.supportNote}>Sin estadísticas de apoyo verificables en esta muestra.</p>}
 </section>;
}
