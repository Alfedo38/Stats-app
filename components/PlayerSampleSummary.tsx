import {selectionSummary} from '@/lib/selectionStats';
import styles from './PlayerStatistics.module.css';

export default function PlayerSampleSummary({values,line,side,loading=false,error=null,lastN}:{values:unknown[];line:number;side:'over'|'under';loading?:boolean;error?:string|null;lastN:number}){
 const summary=selectionSummary(loading||error?[]:values,line,side);
 const fmt=(n:number|null)=>loading?'…':n===null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:1});
 const lineLabel=Number.isFinite(line)?line.toLocaleString('es-AR'):'S/D';
 return <section className={styles.summary} aria-label="Resultados de la muestra" aria-busy={loading}>
  <div className={styles.result}>
   <strong data-ready={summary.rate!==null}>{fmt(summary.rate)}{summary.rate!==null?' %':''}</strong>
   <span>Acierto histórico · L{lastN}</span>
   <small>{summary.rate===null?'':`${summary.hits} de ${summary.decided} · `}{side==='under'?'Menos de':'Más de'} {lineLabel}</small>
  </div>
  <div><span>Promedio</span><strong>{fmt(summary.average)}</strong></div>
  <div><span>Mediana</span><strong>{fmt(summary.median)}</strong></div>
  <div><span>Con dato</span><strong>{loading?'…':error?'S/D':`${summary.valid}/${summary.total}`}</strong></div>
  <p>{loading?'Actualizando la muestra…':error?'La muestra no está disponible.':summary.valid===0?'Sin muestra para evaluar.':`${summary.pushes?`${summary.pushes} empate(s) · `:''}${summary.missing?`${summary.missing} sin dato · `:''}Partidos de la muestra seleccionada.`}</p>
 </section>;
}
