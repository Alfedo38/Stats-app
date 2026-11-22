'use client';

import {useMemo,useState} from 'react';
import {Clock3} from 'lucide-react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {firstQuarterSample,type PeriodGame} from '@/lib/nbaPeriodSample';
import type {RotationGame} from '@/lib/nbaRotations';
import styles from './NbaFirstQuarterCard.module.css';

const label={pts:'Puntos',reb:'Rebotes',ast:'Asistencias'};
const decimal=new Intl.NumberFormat('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
const format=(n:number|null)=>n===null?'S/D':decimal.format(n);
const clock=(ms:number)=>{const seconds=Math.round(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const gamesLabel=(n:number)=>n===1?'1 partido':`${n} partidos`;

export function FirstQuarterReadout({sample}:{sample:ReturnType<typeof firstQuarterSample>}){
 const {rows,minutes,stats,played,skipped,starts,benchEntries,medianEntry}=sample;
 if(!rows.length)return <p className={styles.hint}>Todavía no hay partidos anteriores para armar la muestra.</p>;
 return <>
  <dl className={styles.tiles}>
   <div className={styles.minutes}><dt>Minutos promedio</dt><dd>{format(minutes.value)}</dd><dd>{minutes.games?gamesLabel(minutes.games)+' con minutos':'Sin minutos verificados'}</dd></div>
   {stats.map(s=><div key={s.key}><dt>{label[s.key]}</dt><dd>{format(s.value)}</dd><dd>{s.games?gamesLabel(s.games)+' con dato':'Sin dato'}</dd></div>)}
  </dl>
  <div className={styles.role}>
   <span><strong>{played}/{rows.length}</strong> jugó el cuarto</span>
   {skipped>0&&<span>Sin entrar: <strong>{gamesLabel(skipped)}</strong></span>}
   {rows.length>played+skipped&&<span><strong>{rows.length-played-skipped}</strong> sin confirmar</span>}
   {starts+benchEntries>0&&<span>Abrió <strong>{starts}/{starts+benchEntries}</strong> con ingreso verificado</span>}
   {medianEntry!==null&&<span>Ingreso desde el banco: <strong>{clock(medianEntry)}</strong> restantes · {gamesLabel(benchEntries)}</span>}
  </div>
  <details className={styles.details}>
   <summary>Partido por partido</summary>
   <div className={styles.scroll} tabIndex={0} role="region" aria-label="Resultados por partido en primer cuarto">
    <table>
     <thead><tr><th scope="col">Fecha · Equipo</th><th scope="col">Ingreso</th><th scope="col">Min</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.gameId}>
      <th scope="row">{r.date.slice(8,10)}/{r.date.slice(5,7)} · {r.team}</th>
      <td>{r.conflict?'Sin conciliar':r.played===false?'No jugó':r.role==='starter'?'Titular':r.role==='bench'&&r.entryMs!==null?clock(r.entryMs)+' restantes':'S/D'}</td>
      <td>{r.minutes===null?'S/D':clock(r.minutes*60000)}</td>
      {stats.map(({key})=><td key={key}>{r.values[key]??'S/D'}</td>)}
     </tr>)}</tbody>
    </table>
   </div>
   <p className={styles.hint}>Los minutos incluyen 0:00 si se confirmó que no entró al cuarto. Puntos, rebotes y asistencias promedian los partidos en los que jugó el cuarto y tienen dato.</p>
  </details>
 </>;
}

export default function NbaFirstQuarterCard({playerId,games,splits,splitsLoading,splitsError}:{playerId:number;games:PeriodGame[];splits:Record<string,unknown>[];splitsLoading:boolean;splitsError:string|null}){
 const [retry,setRetry]=useState(0);
 const q=useAnalysisQuery<{games:RotationGame[]}>(games.length?'/api/nba-rotaciones?retry='+retry:null,{playerId,gameIds:games.map(game=>game.gameId)},15000);
 const sample=useMemo(()=>firstQuarterSample(games,splits,q.data?.games??[]),[games,splits,q.data]);
 const busy=q.loading||splitsLoading;
 return <section className={styles.card} aria-label="Primer cuarto" aria-busy={busy}>
  <header className={styles.header}>
   <span className={styles.icon}><Clock3 size={18} aria-hidden="true"/></span>
   <div><h3>Primer cuarto</h3>{games.length>0&&<p>{games.length===1?'Último partido jugado':'Últimos '+gamesLabel(games.length)+' jugados'}</p>}</div>
   <span className={styles.badge}>1C</span>
  </header>
  {busy&&<p className={styles.hint} role="status">Consultando parciales y rotaciones…</p>}
  {q.error&&<p className={styles.hint} role="status">No pudimos verificar las rotaciones. <button type="button" onClick={()=>setRetry(n=>n+1)}>Reintentar</button></p>}
  {splitsError&&<p className={styles.hint} role="status">No pudimos consultar las estadísticas del cuarto.</p>}
  <FirstQuarterReadout sample={sample}/>
 </section>;
}
