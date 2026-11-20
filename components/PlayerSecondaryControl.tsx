import {EVIDENCE_METRICS,evidenceReading,type EvidenceRow} from '@/lib/marketEvidence';
import {opportunityFor,pairedOpportunity} from '@/lib/nbaVisuals';
import styles from './PlayerStatistics.module.css';

export default function PlayerOpportunityLegend({market,scope='FULL',rows}:{market:string;scope?:string;rows:EvidenceRow[]}){
 const metric=opportunityFor(market,scope);
 if(!metric||!rows.length)return null;
 const tracking=EVIDENCE_METRICS[metric];
 const coverage=rows.reduce((total,row)=>total+Number(evidenceReading(row,tracking).value!==null),0);
 const {conversion,count}=pairedOpportunity(rows,row=>evidenceReading(row,EVIDENCE_METRICS[market]).value,row=>evidenceReading(row,tracking).value);
 return <div className={styles.opportunityLegend} aria-label="Referencias del gráfico">
  <span><i data-series="result" />{market==='ast'?'Asistencias':'Rebotes'}</span>
  <span><i data-series="tracking" />{metric==='potential_ast'?'Asistencias potenciales':'Chances de rebote'}</span>
  <span className={styles.opportunityCoverage} title={conversion!==null?`Conversión sobre ${count} partidos: ${conversion.toLocaleString('es-AR',{maximumFractionDigits:1})}%`:undefined}>{coverage}/{rows.length} con dato</span>
 </div>;
}
