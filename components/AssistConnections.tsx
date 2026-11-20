'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {ASSIST_GAME_LIMIT,ASSIST_ZONES,assistGameIds,type AssistSummary} from '@/lib/nbaAssistConnections';

type Data=AssistSummary & {source:'local'|'archive'|'none'};
const fmtDate=(date:string)=>date.split('-').reverse().join('/');
const fmtZones=(zones:number[])=>zones.map((n,i)=>n?`${ASSIST_ZONES[i]}: ${n}`:'').filter(Boolean).join(' · ');

function ConnectionsList({title,rows}:{title:string;rows:Data['given']}){
 const total=rows.reduce((sum,r)=>sum+r.total,0);
 return <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
  <h3 className="flex items-center justify-between gap-3 text-sm font-bold">{title}<span className="tabular-nums text-emerald-400">{total}</span></h3>
  {!rows.length?<p className="mt-2 text-[var(--text-muted)]">Sin asistencias en los partidos verificados.</p>:
   <ul className="mt-2 divide-y divide-[var(--border)]">
    {rows.map(row=><li key={row.id} className="py-2">
     <div className="flex justify-between gap-2"><Link className="font-semibold hover:underline" href={`/players/${row.id}`} prefetch={false}>{row.name}</Link>
      <span className="shrink-0 tabular-nums" title={`Registradas en ${row.games} ${row.games===1?'partido':'partidos'}`}>{row.total} AST</span></div>
     <p className="mt-0.5 leading-relaxed text-[var(--text-muted)]">{fmtZones(row.zones)}</p>
    </li>)}
   </ul>}
 </div>;
}

export default function AssistConnections({playerId,gameIds,enabled}:{playerId:string;gameIds:unknown[];enabled:boolean}){
 const [open,setOpen]=useState(false),[retry,setRetry]=useState(0);
 const known=assistGameIds(gameIds),ids=known.slice(-ASSIST_GAME_LIMIT);
 const q=useAnalysisQuery<Data>(enabled&&open&&ids.length?`/api/nba-asistencias-conexiones?retry=${retry}`:null,
  {playerId,gameIds:ids},12000);
 if(!enabled||!known.length)return null;
 const d=q.data;
 const first=d?.dates[0],last=d?.dates[d.dates.length-1];
 return <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="cursor-pointer text-sm font-bold">Conexiones de asistencias</summary>
  {open&&<div className="mt-3 space-y-3 text-xs">
   {q.loading&&<p role="status">Buscando asistencias verificadas…</p>}
   {q.error&&<p role="alert">{q.error} <button type="button" className="underline" onClick={()=>setRetry(n=>n+1)}>Reintentar</button></p>}
   {d&&<p role="status" className="text-[var(--text-muted)]">
    <strong className="text-[var(--text)]">{d.covered}/{d.requested} partidos del gráfico verificados</strong>
    {first&&last&&<> · {fmtDate(first)}{first!==last&&` al ${fmtDate(last)}`}</>}
    {known.length>ids.length&&' · Últimos 30 del gráfico'}
    {d.source==='local'&&' · Vista previa local'}
   </p>}
   {d&&!d.covered&&<p>No hay partidos verificados para este jugador con los filtros actuales.</p>}
   {!!d?.covered&&<>
    <div className="grid gap-3 sm:grid-cols-2">
     <ConnectionsList title="A quién asiste" rows={d.given}/>
     <ConnectionsList title="Quién lo asiste" rows={d.received}/>
    </div>
    <p className="text-[var(--text-muted)]">La zona corresponde al tiro convertido. Sólo se cuentan asistencias oficiales.{d.unknownZone>0&&` Sin zona: ${d.unknownZone}.`}</p>
   </>}
  </div>}
 </details>;
}
