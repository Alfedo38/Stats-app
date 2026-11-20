'use client';
import {useState} from 'react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {h2hDateLabel,type PlayerH2HResult} from '@/lib/nbaPlayerH2H';

const num=(v:number|null)=>v===null?'—':v.toLocaleString('es-AR',{maximumFractionDigits:1});
const shots=(made:number|null,attempts:number|null)=>`${num(made)}/${num(attempts)}`;
type Props={attacker:number;defender:number;attackerName:string;defenderName:string;before:string};
type Result=PlayerH2HResult&{missing:string[];hasBothFacts:boolean};
export default function PlayerH2H({attacker,defender,attackerName,defenderName,before}:Props){
 const [open,setOpen]=useState(false),[retry,setRetry]=useState(0);
 const {data,loading,error}=useAnalysisQuery<Result>(open?`/api/nba-player-h2h?${new URLSearchParams({attacker:String(attacker),defender:String(defender),before,retry:String(retry)})}`:null,undefined,25_000);
 return <details onToggle={e=>setOpen(e.currentTarget.open)} className="my-2 min-w-0 rounded-lg border border-[var(--border)] p-3 text-xs">
  <summary className="cursor-pointer font-bold text-emerald-400">Cara a cara · {defenderName}</summary>
  {loading&&<p className="mt-2" role="status">Consultando los cruces…</p>}
  {error&&<p className="mt-2" role="alert">{error} <button type="button" className="underline" onClick={()=>setRetry(n=>n+1)}>Reintentar</button></p>}
  {data&&<div className="mt-3 space-y-3">
   <div><h4 className="font-bold">Partidos en equipos rivales · {data.gamesTotal} PJ</h4><p className="my-1 text-[var(--text-muted)]">Estadísticas de partido completo. Ambos jugaron. Mostramos hasta los diez más recientes.</p>
    {data.games.length?<div className="overflow-x-auto"><table className="w-full min-w-[24rem] text-left"><thead><tr><th>Fecha</th><th>{attackerName} · P/R/A</th><th>{defenderName} · P/R/A</th></tr></thead>
     <tbody>{data.games.map(g=><tr key={g.gameId} className="border-t border-[var(--border)]"><td className="py-1.5 pr-2">{h2hDateLabel(g.date)} · {g.attacker.team}–{g.defender.team}</td>{[g.attacker,g.defender].map(p=><td key={p.team} className="pr-2">{[p.pts,p.reb,p.ast].map(num).join(' / ')} · {num(p.minutes)} min</td>)}</tr>)}</tbody></table></div>:<p>{data.hasBothFacts?'No encontramos partidos en los que ambos hayan jugado como rivales.':'Falta el historial de al menos uno de los jugadores.'}</p>}
   </div>
   <div><h4 className="font-bold">Marca directa · {data.marksTotal} PJ</h4><p className="my-1 text-[var(--text-muted)]">Cuando {defenderName} defendió a {attackerName}. Tiros anotados/intentos y posesiones parciales de la asignación NBA.</p>
    {data.marks.length?<div className="overflow-x-auto"><table className="w-full min-w-[29rem] text-left"><thead><tr>{['Fecha','MIN','Pos.','PTS','TC','2P','3P'].map(h=><th key={h}>{h}</th>)}</tr></thead>
     <tbody>{data.marks.map(m=><tr className="border-t border-[var(--border)]" key={m.gameId}>{[h2hDateLabel(m.date),num(m.minutes),num(m.possessions),num(m.pts),shots(m.fgm,m.fga),shots(m.twoM,m.twoA),shots(m.threeM,m.threeA)].map((v,i)=><td key={i} className="py-1.5 pr-2">{v}</td>)}</tr>)}</tbody></table></div>:<p>No hay una marca directa confirmada en el archivo disponible.</p>}
   </div>
   <p className="text-[var(--text-muted)]">{data.coverage.map(s=>`${s.season}: ${s.gamesWithAssignments}/${s.games} cruces con asignaciones del atacante`).join(' · ')}{data.missing.length?` · Sin archivo de marcas del atacante: ${data.missing.join(', ')}.`:'.'}</p>
  </div>}
 </details>;
}
