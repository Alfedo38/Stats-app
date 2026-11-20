'use client';

import {useState} from 'react';
import Link from 'next/link';
import {ArrowDownLeft,ArrowUpRight,Target} from 'lucide-react';
import {PlayerPortrait} from './NbaMedia';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {ASSIST_GAME_LIMIT,ASSIST_ZONES,assistGameIds,type AssistSummary} from '@/lib/nbaAssistConnections';
import type {GameContext} from '@/lib/playerNavigation';
import styles from './NbaLeagueResearch.module.css';

type Data=AssistSummary & {source:'local'|'archive'|'none';defense:{team:string;covered:number;requested:number;zones:number[];league:number[]|null}|null};
const fmt=(v:number,d=1)=>v.toLocaleString('es-AR',{maximumFractionDigits:d});
const percent=(share:number)=>fmt(share*100,0)+'%';

function ConnectionsList({title,rows,context,incoming=false}:{title:string;rows:Data['given'];context:GameContext|null;incoming?:boolean}){
 const [more,setMore]=useState(false);
 const Icon=incoming?ArrowDownLeft:ArrowUpRight;
 const total=rows.reduce((sum,r)=>sum+r.total,0);
 return <section className={styles.panel}>
  <h3 className={styles.panelTitle}><Icon size={16} aria-hidden="true"/>{title}<strong>{total} AST</strong></h3>
  {!rows.length?<p className={styles.note}>0 en los partidos verificados.</p>:
   <ol className={styles.connections}>
    {rows.slice(0,more?undefined:5).map(row=>{
     const params=new URLSearchParams({stat:'ast'});
     if(context){params.set('date',context.date);params.set('game',context.away+'-'+context.home);}
     return <li key={row.id}>
      <Link href={`/players/${row.id}?${params}`} prefetch={false}><PlayerPortrait id={row.id} name={row.name}/><span><b>{row.name}</b>
       <small>{row.together?fmt(row.total/row.together)+' por partido · '+row.together+' PJ juntos':'Sin muestra en común'}</small></span></Link>
      <strong>{row.total}<small>{percent(row.share)}</small></strong>
      <span className={styles.track} aria-hidden="true"><span style={{width:percent(row.share)}}/></span>
      {row.zones.some(Boolean)&&<span className={styles.zoneTags}>{row.zones.flatMap((n,i)=>n?[<small key={i}>{ASSIST_ZONES[i]} {n}</small>]:[])}</span>}
     </li>;
    })}
   </ol>}
   {rows.length>5&&<button type="button" className={styles.textButton} aria-expanded={more} onClick={()=>setMore(!more)}>{more?'Ver menos':`Ver los ${rows.length} compañeros`}</button>}
 </section>;
}

function ZoneMatchup({data,rival}:{data:Data;rival?:string|null}){
 const defense=data.defense,total=data.givenZones.reduce((a,b)=>a+b,0);
 const focal=data.givenZones.slice(0,-1).reduce((best,n,i)=>n>data.givenZones[best]?i:best,0);
 const allowed=defense?.covered?defense.zones[focal]/defense.covered:null,league=defense?.league?.[focal]??null;
 const gap=allowed!==null&&league!==null&&league>0&&defense!.covered>=5&&defense!.covered/defense!.requested>=.7
  ?Math.round(100*(allowed/league-1)):null;
 if(!data.covered&&!defense?.covered)return null;
 return <section className={styles.panel}>
  <h3 className={styles.panelTitle}><Target size={16} aria-hidden="true"/> Dónde terminan las asistencias</h3>
  {rival&&data.givenZones[focal]>0&&gap!==null&&gap!==0&&<p className={styles.note}><b>Su zona más frecuente: {ASSIST_ZONES[focal]}.</b> {rival} concede {Math.abs(gap)}% {gap>0?'más':'menos'} que la media ahí.</p>}
  <div className={styles.tableWrap}><table className={styles.table}>
   <thead><tr><th>Zona del tiro</th><th>Jugador</th>{rival&&<th>{rival} concede / PJ</th>}</tr></thead>
   <tbody>{ASSIST_ZONES.map((zone,i)=>i===ASSIST_ZONES.length-1&&!data.givenZones[i]&&!defense?.zones[i]?null:
    <tr key={zone}><th scope="row">{zone}</th><td>{data.covered?<><b>{data.givenZones[i]}</b>{total>0&&<small> · {percent(data.givenZones[i]/total)}</small>}</>:'S/D'}</td>
     {rival&&<td>{defense?.covered?fmt(defense.zones[i]/defense.covered):'S/D'}{defense?.league&&<small> · liga {fmt(defense.league[i])}</small>}</td>}</tr>)}</tbody>
  </table></div>
  {rival&&<p className={styles.note}>{defense?.covered?`${defense.covered}/${defense.requested} partidos del rival con datos · hasta 20 de la temporada`:'Todavía no hay datos del rival para este cruce.'}</p>}
  <p className={styles.note}>La zona es donde se convirtió el tiro. Cuenta asistencias oficiales; las potenciales se ven en el gráfico.</p>
 </section>;
}

export default function AssistConnections({playerId,gameIds,enabled,rival,cutoff,context}:{playerId:string;gameIds:unknown[];enabled:boolean;rival?:string|null;cutoff?:string|null;context:GameContext|null}){
 const [open,setOpen]=useState(false),[retry,setRetry]=useState(0);
 const known=assistGameIds(gameIds),ids=known.slice(-ASSIST_GAME_LIMIT);
 const q=useAnalysisQuery<Data>(enabled&&open&&ids.length?`/api/nba-asistencias-conexiones?retry=${retry}`:null,
  {playerId,gameIds:ids,...(cutoff?{cutoff}:{}),...(rival&&cutoff?{rival}:{})},12000);
 if(!enabled||!known.length)return null;
 const data=q.data;
 return <details className={styles.disclosure} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><ArrowUpRight size={15} aria-hidden="true"/> Conexiones de asistencias</summary>
  {open&&<div className={styles.body}>
   {q.loading&&<p role="status">Buscando asistencias verificadas…</p>}
   {q.error&&<p role="alert">{q.error} <button type="button" className={styles.textButton} onClick={()=>setRetry(n=>n+1)}>Reintentar</button></p>}
   {data&&<>
    <p className={styles.note} role="status"><b>{data.covered} de {data.requested} partidos verificados</b>{known.length>ids.length?' · últimos 30 del gráfico':''}</p>
    {!data.covered&&<p>No hay partidos verificados del jugador con estos filtros.</p>}
    <ZoneMatchup data={data} rival={rival}/>
    {data.covered>0&&<div className={styles.twoCols}><ConnectionsList title="A quién asiste" rows={data.given} context={context}/><ConnectionsList title="Quién lo asiste" rows={data.received} context={context} incoming/></div>}
   </>}
  </div>}
 </details>;
}
