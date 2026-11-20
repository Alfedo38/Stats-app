'use client';
import {useState} from 'react';
import {Crosshair} from 'lucide-react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import type {PlaytypeReport} from '@/lib/nbaPlaytypes';
import styles from './NbaLeagueResearch.module.css';

const fmt=(n:number|null)=>n===null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:2});
export default function NbaPlaytypePanel({playerId,cutoff,rival}:{playerId:string;cutoff:string;rival?:string|null}){
 const [open,setOpen]=useState(false);
 const report=useAnalysisQuery<PlaytypeReport>(open?'/api/nba-perfil-ofensivo?'+new URLSearchParams({player:playerId,before:cutoff,...(rival?{rival}:{})}):null);
 return <details className={styles.disclosure} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><Crosshair size={15} aria-hidden="true"/> Perfil por tipo de jugada</summary>
  {open&&<div className={styles.body}>{report.loading?<p role="status">Buscando datos por jugada…</p>:report.error?<p role="alert">{report.error}</p>:report.data?.available?
   <><div className={styles.tableWrap}><table className={styles.table}>
    <thead><tr><th>Jugada</th><th>PTS / PJ</th><th>PTS / posesión</th>{rival&&<th>{rival} concede / posesión</th>}</tr></thead>
    <tbody>{report.data.rows.map(r=><tr key={r.name}><th scope="row">{r.name}</th><td>{fmt(r.points)}</td><td>{fmt(r.ppp)} <small>({r.plays} pos.)</small></td>
     {rival&&<td>{fmt(r.rivalPpp)}{r.rivalPlays&&<small> ({r.rivalPlays} pos.)</small>}{r.leaguePpp!==null&&<small> · liga {fmt(r.leaguePpp)}</small>}</td>}</tr>)}</tbody></table></div>
    <p className={styles.note}>NBA Stats / Synergy · temporada regular · snapshot del {report.data.capturedOn?.split('-').reverse().join('/')}. Incluye tipos con muestra; no suma toda su anotación.</p></>:<p>No hay un perfil verificado anterior a este partido.</p>}</div>}
 </details>;
}
