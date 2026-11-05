'use client';

import {useState} from 'react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {reportDateLabel} from '@/lib/injuryReport';
import {rotationGameId,rotationMinutes,rotationPeriodMs,type RotationGame} from '@/lib/nbaRotations';

type Coverage={requested:number;covered:number;starts:number;minutes:number|null;q1Minutes:number|null};
type Pilot={ok:true;available:boolean;source:'archive'|'local'|'none';games:RotationGame[];coverage:Coverage};
const fmt=(n:number|null)=>n===null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:1});
const clock=(ms:number)=>{const seconds=Math.round(ms/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
const label=(p:number)=>p<=4?'Q'+p:'PR '+(p-4);

export default function RotationPilot({playerId,gameIds,open}:{playerId:string;gameIds:unknown[];open:boolean}){
 const ids=[...new Set(gameIds.map(rotationGameId).filter((x):x is string=>x!==null))].slice(0,30);
 const [chosen,setChosen]=useState(''),[retry,setRetry]=useState(0);
 const q=useAnalysisQuery<Pilot>(open&&ids.length&&/^[1-9]\d{0,9}$/.test(playerId)?'/api/nba-rotations?retry='+retry:null,{playerId,gameIds:ids});
 const d=q.data;
 const game=d?.games.find(g=>g.gameId===chosen)??d?.games[0];
 if(!open)return null;
 return <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
  <p className="text-[var(--text-muted)]">Piloto BOS y LAL · Hasta 30 partidos de esta muestra. Los minutos reconstruidos se contrastan con el box score.</p>
  {!ids.length&&<p>No hay partidos NBA elegibles con estos filtros.</p>}
  {q.loading&&<p role="status">Buscando rotaciones conciliadas…</p>}
  {q.error&&<p role="alert">{q.error} <button type="button" onClick={()=>setRetry(n=>n+1)} className="underline">Reintentar</button></p>}
  {d&&<p role="status" className="text-[var(--text-muted)]"><strong className="text-[var(--text)]">{d.coverage.covered}/{d.coverage.requested} partidos verificados</strong>{d.source==='local'?' · vista previa local':''}{!d.available?' · todavía no hay rotaciones publicadas para este jugador.':!d.coverage.covered?' · no hay cruces con el piloto en esta muestra.':''}</p>}
  {d&&game&&<>
   <dl className="grid grid-cols-3 gap-3"><div><dt className="text-[var(--text-muted)]">Titular</dt><dd className="text-base font-bold">{d.coverage.starts}/{d.coverage.covered}</dd></div><div><dt className="text-[var(--text-muted)]">Min. promedio</dt><dd className="text-base font-bold">{fmt(d.coverage.minutes)}</dd></div><div><dt className="text-[var(--text-muted)]">Min. 1.º cuarto</dt><dd className="text-base font-bold">{fmt(d.coverage.q1Minutes)}</dd></div></dl>
   <label className="flex flex-wrap items-center gap-2">Partido <select value={game.gameId} onChange={e=>setChosen(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">{d.games.map(g=><option key={g.gameId} value={g.gameId}>{reportDateLabel(g.date)} · {g.team}</option>)}</select></label>
   <p><strong>{game.starter?'Titular':'Suplente'}</strong> · {clock(game.playedMs)} reconstruidos · {clock(game.boxMs)} box score</p>
   <ul className="space-y-2" aria-label="Minutos en cancha por período">
    {Array.from({length:game.periods},(_,i)=>i+1).map(p=>{
     const spans=game.spans.filter(([period])=>period===p),max=rotationPeriodMs(p);
     return <li key={p}><div className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-2"><strong>{label(p)}</strong><div aria-hidden="true" className="relative h-2 rounded-full bg-[var(--surface-soft)]">{spans.map(([,a,b])=><span className="absolute top-0 h-full rounded-full bg-emerald-400" key={a} style={{left:(100*a/max)+'%',width:(100*(b-a)/max)+'%'}}/>)}</div><span className="text-right tabular-nums">{clock(rotationMinutes(game,p)*60000)}</span></div>
     {spans.length>0&&<p className="ml-14 text-[11px] text-[var(--text-muted)]">{spans.map(([,a,b])=>clock(max-a)+' → '+clock(max-b)).join(' · ')}</p>}</li>;
    })}
   </ul>
   <p className="text-[var(--text-muted)]">La barra muestra cuándo estuvo en cancha. Los horarios debajo usan el reloj descendente del período. La muestra no proyecta el próximo partido.</p>
  </>}
 </div>;
}
