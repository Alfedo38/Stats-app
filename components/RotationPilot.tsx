'use client';

import {useState} from 'react';
import Link from 'next/link';
import type {quarterRole} from '@/lib/nbaSubstitutions';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {reportDateLabel} from '@/lib/injuryReport';
import {rotationGameId,rotationMinutes,rotationPeriodMs,type RotationGame} from '@/lib/nbaRotations';

type Coverage={requested:number;covered:number;starts:number;minutes:number|null;q1Minutes:number|null};
type Change={id:number;name:string;count:number};
type Pilot={changes?:{games:number;multiple:number;unverified:number;inForPlayer:Change[];playerInFor:Change[]};quarters?:ReturnType<typeof quarterRole>;ok:true;available:boolean;source:'archive'|'local'|'none';games:RotationGame[];coverage:Coverage};
const fmt=(n:number|null)=>n===null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:1});
const clock=(ms:number)=>{const seconds=Math.round(ms/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
const label=(p:number)=>p<=4?'Q'+p:'PR '+(p-4);

export default function RotationPilot({playerId,gameIds,open}:{playerId:string;gameIds:unknown[];open:boolean}){
 const ids=[...new Set(gameIds.map(rotationGameId).filter((x):x is string=>x!==null))].slice(-30);
 const [view,setView]=useState<"pattern"|"game"|"changes">("pattern");
 const [chosen,setChosen]=useState(''),[retry,setRetry]=useState(0);
 const q=useAnalysisQuery<Pilot>(open&&ids.length&&/^[1-9]\d{0,9}$/.test(playerId)?'/api/nba-rotaciones?retry='+retry:null,{playerId,gameIds:ids});
 const d=q.data;
 const game=d?.games.find(g=>g.gameId===chosen)??d?.games[0];
 if(!open)return null;
 return <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
  <p className="text-[var(--text-muted)]">Hasta 30 partidos de la muestra. Solo se muestran tramos que concilian con el boxscore.</p>
  {!ids.length&&<p>No hay partidos NBA elegibles con estos filtros.</p>}
  {q.loading&&<p role="status">Buscando rotaciones conciliadas…</p>}
  {q.error&&<p role="alert">{q.error} <button type="button" onClick={()=>setRetry(n=>n+1)} className="underline">Reintentar</button></p>}
  {d&&<p role="status" className="text-[var(--text-muted)]"><strong className="text-[var(--text)]">{d.coverage.covered}/{d.coverage.requested} partidos verificados</strong>{d.source==='local'?' · vista previa local':''}{!d.available?' · todavía no hay rotaciones publicadas para este jugador.':!d.coverage.covered?' · no hay rotaciones verificadas en esta muestra.':''}</p>}
  {d&&game&&<>
   <dl className="grid grid-cols-3 gap-3"><div><dt className="text-[var(--text-muted)]">Titular</dt><dd className="text-base font-bold">{d.coverage.starts}/{d.coverage.covered}</dd></div><div><dt className="text-[var(--text-muted)]">Min. promedio</dt><dd className="text-base font-bold">{fmt(d.coverage.minutes)}</dd></div><div><dt className="text-[var(--text-muted)]">Min. 1.º cuarto</dt><dd className="text-base font-bold">{fmt(d.coverage.q1Minutes)}</dd></div></dl>
   <div className="flex flex-wrap gap-2" role="group" aria-label="Vista de rotaciones">
    <button type="button" className="mosk-soft-button" aria-pressed={view==="pattern"} onClick={()=>setView("pattern")}>Patrón reciente</button>
    <button type="button" className="mosk-soft-button" aria-pressed={view==="game"} onClick={()=>setView("game")}>Partido a partido</button>
    <button type="button" className="mosk-soft-button" aria-pressed={view==="changes"} onClick={()=>setView("changes")}>Cambios</button>
   </div>
   {view==="changes"?<div>
    <p>{d.changes?.games?`Cambios verificados en ${d.changes.games} PJ de la muestra.`:'Todavía no hay quintetos verificables para mostrar sustituciones.'}</p>
    {d.changes&&d.changes.games>0&&<>
     <div className="grid gap-3 sm:grid-cols-2 mt-2">{[["Entran cuando sale",d.changes.inForPlayer],["Sale cuando él entra",d.changes.playerInFor]].map(([title,rows])=><div key={String(title)}><strong>{String(title)}</strong><ul>{(rows as Change[]).slice(0,5).map(r=><li key={r.id} className="flex justify-between py-1"><Link className="mosk-text-link" href={`/players/${r.id}`}>{r.name}</Link><span>{r.count} {r.count===1?'cambio':'cambios'}</span></li>)}</ul></div>)}</div>
     {d.changes.multiple>0&&<p className="text-[var(--text-muted)]">{d.changes.multiple} cambios múltiples sin pareja individual verificable.</p>}
    </>}
   </div>:view==="pattern"?<div>
    {!!d.quarters?.length&&<dl className="grid grid-cols-4 gap-2 mb-3" aria-label="Mediana de minutos por cuarto">{d.quarters.map(q=><div key={q.quarter} className="rounded-md border border-[var(--border)] p-1.5"><dt>Q{q.quarter}</dt><dd><b>{fmt(q.minutes)}</b> min</dd><dd className="text-[var(--text-muted)]">{q.played}/{q.games} PJ</dd></div>)}</dl>}
    <p className="mb-2 text-[var(--text-muted)]">Cada bloque indica en cuántos partidos estuvo en cancha al segundo 30 de ese minuto. Usá el reloj de izquierda a derecha: 12:00 → 0:00.</p>
    {Array.from({length:4},(_,i)=>i+1).map(period=><div className="mb-2 flex items-center gap-2" key={period}>
      <strong>Q{period}</strong><div className="grid flex-1 grid-cols-12 gap-1">{Array.from({length:12},(_,i)=>{
       const tick=i*60000+30000,played=d.games.filter(g=>g.spans.some(([p,a,b])=>p===period&&a<=tick&&tick<b)).length;
       return <span key={i} className="rounded border border-[var(--border)] text-center text-[9px] leading-5" title={`Q${period} · ${12-i}:00 → ${11-i}:00 · ${played}/${d.games.length} partidos`}
        style={{background:`color-mix(in srgb, var(--brand, #10b981) ${Math.round(55*played/d.games.length)}%, var(--bg))`}}>{played}</span>;
      })}</div>
    </div>)}
    <p className="text-[var(--text-muted)]">Cerró el primer cuarto en {d.games.filter(g=>g.spans.some(([p,,b])=>p===1&&b===720000)).length}/{d.games.length} partidos verificados.</p>
   </div>:<>
   <label className="flex flex-wrap items-center gap-2">Partido <select value={game.gameId} onChange={e=>setChosen(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">{d.games.map(g=><option key={g.gameId} value={g.gameId}>{reportDateLabel(g.date)} · {g.team}</option>)}</select></label>
   <p><strong>{game.starter?'Titular':'Suplente'}</strong> · {clock(game.playedMs)} reconstruidos · {clock(game.boxMs)} box score</p>
   <ul className="space-y-2" aria-label="Minutos en cancha por período">
    {Array.from({length:game.periods},(_,i)=>i+1).map(p=>{
     const spans=game.spans.filter(([period])=>period===p),max=rotationPeriodMs(p);
     return <li key={p}><div className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-2"><strong>{label(p)}</strong><div aria-hidden="true" className="relative h-2 rounded-full bg-[var(--surface-soft)]">{spans.map(([,a,b])=><span className="absolute top-0 h-full rounded-full bg-emerald-400" key={a} style={{left:(100*a/max)+'%',width:(100*(b-a)/max)+'%'}}/>)}</div><span className="text-right tabular-nums">{clock(rotationMinutes(game,p)*60000)}</span></div>
     {spans.length>0&&<p className="ml-14 text-[11px] text-[var(--text-muted)]">{spans.map(([,a,b])=>clock(max-a)+' → '+clock(max-b)).join(' · ')}</p>}</li>;
    })}
   </ul>
   <p className="text-[var(--text-muted)]">La barra muestra cuándo estuvo en cancha. Los horarios debajo usan el reloj descendente del período. La muestra no proyecta el próximo partido.</p></>}
  </>}
 </div>;
}
