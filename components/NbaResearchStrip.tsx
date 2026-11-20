'use client';

import {selectionSummary,type SelectionSide} from '@/lib/selectionStats';
import type {SeasonWindow} from '@/lib/seasonWindows';
import type {RivalSelection} from '@/lib/rivalSelection';
import styles from './NbaLeagueResearch.module.css';

export default function NbaResearchStrip({seasons,rival,rivalHistory,line,side,onFilterRival}:{seasons:SeasonWindow[];rival?:string|null;rivalHistory?:RivalSelection|null;line:number;side:SelectionSide;onFilterRival?:()=>void}){
 if(!seasons.length||!Number.isFinite(line))return null;
 const [current,previous]=seasons;
 const a=selectionSummary(current.values.slice(0,10),line,side),b=selectionSummary(current.seasonValues??current.values,line,side);
 const p=previous?selectionSummary(previous.values.slice(0,10),line,side):null;
 const f=(s:{hits:number;decided:number})=>s.decided?`${s.hits}/${s.decided}`:'S/D';
 const med=a.median?.toLocaleString('es-AR',{maximumFractionDigits:1})??'S/D';
 return <div className={styles.strip} aria-label="Aciertos históricos por muestra">
  <div><small>L10 · {current.season}</small><b>{f(a)}</b><small>Mediana {med}</small></div>
  <div><small>Temporada · {current.season}</small><b>{f(b)}</b><small>{b.valid} PJ con datos</small></div>
  {previous&&p&&<div><small>L10 · {previous.season}</small><b>{f(p)}</b></div>}
  {rival&&<button type="button" onClick={onFilterRival} disabled={!onFilterRival}><small>Últimos 5 vs. {rival}</small><b>{rivalHistory?f(rivalHistory):'S/D'}</b>{onFilterRival&&<small>Ver en el gráfico</small>}</button>}
 </div>;
}
