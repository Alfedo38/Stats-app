'use client';

import Link from 'next/link';
import {useState} from 'react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import type {LastTeamLineup} from '@/lib/nbaRotationData';
import {playerGameHref,type GameContext} from '@/lib/playerNavigation';
import styles from './NbaLeagueResearch.module.css';

export default function NbaLastLineups({context}:{context:GameContext}){
 const [open,setOpen]=useState(false);
 const {away,home,date}=context;
 const request=useAnalysisQuery<{available:boolean;lineups?:LastTeamLineup[]}>(open?
   '/api/nba-matchup-preview?'+new URLSearchParams({away,home,date,lineups:'1'}):null,undefined,12000);
 return <details className={styles.disclosure} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>Último quinteto verificado</summary>
  {open&&<div className={styles.body}>
   {request.loading?<p role="status">Buscando titulares de los últimos partidos…</p>:request.error?<p role="alert">{request.error}</p>:
    request.data?.available?<div className={styles.lineups}>
    {[away,home].map(team=>{const lineup=request.data?.lineups?.find(row=>row.team===team);return <section key={team}>
     <strong>{team}</strong>{lineup?.date?<><small> · {lineup.date.split('-').reverse().join('/')}</small>
       <ul>{lineup.players.map(p=><li key={p.id}><Link href={playerGameHref(p.id,context,team)}>{p.name}</Link></li>)}</ul></>:
       <p>Sin quinteto verificado en los últimos tres partidos.</p>}
    </section>;})}</div>:<p>Falta confirmar el partido en calendario.</p>}
   <p className={styles.note}>Titulares de un partido ya jugado. Para la disponibilidad de hoy, consultá el parte oficial.</p>
  </div>}
 </details>;
}
