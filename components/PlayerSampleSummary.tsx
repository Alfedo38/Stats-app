import {selectionSummary} from '@/lib/selectionStats';
import styles from './PlayerPresentation.module.css';
export default function PlayerSampleSummary({values,line,side,loading=false,error=null,lastN}:{values:unknown[];line:number;side:'over'|'under';loading?:boolean;error?:string|null;lastN:number}){
 const summary=selectionSummary(loading||error?[]:values,line,side);
 const fmt=(n:number|null)=>loading?'…':n===null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:1});
 return <section className={styles.sampleSummary} aria-label="Resultados de la muestra" aria-busy={loading}>
  <div><span>Últimos {lastN} · {side==='under'?'Menos de':'Más de'} {line.toLocaleString('es-AR')}</span><strong className={styles.accent}>{loading?'…':summary.rate===null?'S/D':`${summary.hits} de ${summary.decided} ${side==="under"?"por debajo":"por encima"}`}<small>{summary.rate!==null?` · ${fmt(summary.rate)} % histórico`:''}</small></strong></div>
  <div><span>Promedio</span><strong>{fmt(summary.average)}</strong></div>
  <div><span>Mediana</span><strong>{fmt(summary.median)}</strong></div>
  <div><span>Partidos con dato</span><strong>{loading?'…':`${summary.valid}/${summary.total}`}</strong></div>
  <p>{loading?'Actualizando la muestra…':error?'La muestra no está disponible.':summary.valid===0?'Sin muestra para evaluar.':`${summary.pushes?`${summary.pushes} empate(s) · `:''}${summary.missing?`${summary.missing} sin dato · `:''}Antecedentes de la línea.`}</p>
 </section>;
}
