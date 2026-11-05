'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Shield} from 'lucide-react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {SHOT_ZONES,zoneDistance} from '@/lib/nbaComparableProfile';
import {usePlayerDefense} from '@/hooks/usePlayerDefense';
import {DEFENSE_GROUPS,DEFENSE_MARKETS,DEFENSE_BANDS,rankFor,type DefenseReport,type DefenseGroup,type DefenseBand} from '@/lib/nbaDefense';

const fmt=(n:number|null,d=1)=>n===null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:d,minimumFractionDigits:d});
const day=(s:string|null)=>s?s.split('-').reverse().join('/'):'S/D';
type State=ReturnType<typeof usePlayerDefense>;
export function DefenseReadout({data,opponent,position,side}:{data:DefenseReport;opponent:string;position:DefenseGroup;side:'over'|'under'}){
 const row=rankFor(data,opponent,position),delta=row?.diffPct??null;
 if(!opponent){const league=data.rankings[position]?.find(r=>r.leagueAverage!==null)?.leagueAverage??null;return <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Seleccioná el partido arriba para ver la defensa del rival.{league!==null?` Referencia de liga: ${fmt(league)} por partido en este grupo.`:''}</p>;}
 if(!row||row.games===0)return <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{row?.total?`${row.total} partidos de ${opponent}, sin cobertura válida de este mercado y posición.`:`No hay partidos de ${opponent} en esta referencia.`} Podés cambiar temporada o posición en el detalle.</p>;
 return <><div className="mt-2 grid grid-cols-2 gap-2 text-xs">
  <div><span className="text-[var(--text-muted)]">Puesto por lo que concede</span><strong className="mt-1 block text-lg">{row?.rank===null||!row?'Muestra corta':`${row.rank}º / ${row.rankedTeams}`}</strong></div>
  <div><span className="text-[var(--text-muted)]">Permite por partido</span><strong className="mt-1 block text-lg">{fmt(row?.allowed??null)}</strong></div>
 </div><p className="mt-1 text-[11px] text-[var(--text-muted)]">{row?`${row.games}/${row.total} PJ válidos${row.games<5?' · mínimo 5 para ordenar':''}`:'Elegí un rival para ver su referencia.'}{delta!==null?` · ${delta>=0?'+':''}${fmt(delta)}% vs liga`:''}</p>
 {data.settings.previousSeason&&<p className="mt-1 text-xs text-[var(--text-muted)]">{[data.settings.season,data.settings.previousSeason].map(s=>`${s}: ${row.seasonGames?.[s]??0} PJ válidos`).join(' · ')}</p>}
 {delta!==null&&Math.abs(delta)>.05&&<p className="mt-1 text-[11px] text-[var(--text-muted)]">Permite {delta>0?'más':'menos'} que la liga. {row.games<5?'Muestra corta.':`Contexto ${(side==='over')===(delta>0)?'a favor':'en contra'} del ${side==='over'?'Over':'Under'}.`}</p>}
 {row.rank!==null&&<p className="mt-2 text-xs text-[var(--text-muted)]">{row.rankedTeams<30?`Ranking parcial · faltan ${data.rankings[position].filter(r=>r.rank===null).map(r=>r.team).join(', ')}. `:''}1.º es el que más permite.</p>}
 <p className="mt-1 text-xs text-[var(--text-muted)]">{position==='ALL'?'Total de todas las posiciones.':'Total del grupo de posiciones, sumando a sus jugadores por partido.'}</p></>;
}
export default function DefenseContextCard({state,opponent,scope,side,profile}:{profile?:{playerId:number;points:number;minutes:number;sample:number};state:State;opponent:string;scope:string;side:'over'|'under'}){
 const [open,setOpen]=useState(false),{options,report}=state;
 const [showProfiles,setShowProfiles]=useState(false);
 const details=useAnalysisQuery<DefenseReport>(open&&state.url&&opponent?state.url+'&details=1':null);
 const extended=useAnalysisQuery<DefenseReport>(open&&showProfiles&&state.url&&opponent&&profile?.playerId&&state.market==='pts'?state.url+'&details=1&profilePlayer='+profile.playerId:null);
 const profileData=extended.data??details.data;
 const comparable=profile&&state.market==='pts'&&options.position!=='ALL'?(profileData?.recent??[]).flatMap(row=>{
  if(row.playerId===profile.playerId||row.position!==options.position||row.baseline===null||row.value===null)return [];
  const own=profileData?.profiles?.[row.phase??''];
  const verified=!!own&&own.games>=5&&(row.priorGames??0)>=5&&own.points!==null&&own.minutes!==null&&row.priorMinutes!=null;
  const minuteGap=Math.abs((verified?row.priorMinutes!:row.minutes)-(verified?own!.minutes!:profile.minutes));
  const pointsGap=Math.abs(row.baseline-(verified?own!.points!:profile.points));
  if(minuteGap>6||pointsGap>5)return [];
  const usage=verified&&own!.usage!==null&&(row.usageGames??0)>=5&&row.priorUsage!=null?Math.abs(own!.usage-row.priorUsage):null;
  const zones=verified&&own!.shot&&row.priorShot?zoneDistance(own!.shot,row.priorShot):null;
  if(usage!==null&&usage>8||zones!==null&&zones>.25)return [];
  return [{row,minuteGap,pointsGap,usage,zones,verified,own,coverage:Number(usage!==null)+Number(zones!==null)}];
 }).sort((a,b)=>b.coverage-a.coverage||Number(b.verified)-Number(a.verified)||a.minuteGap/6+a.pointsGap/5+(a.usage??0)/8+(a.zones??0)*4-b.minuteGap/6-b.pointsGap/5-(b.usage??0)/8-(b.zones??0)*4).slice(0,5):[];
 const seasons=[...new Set([options.season,...(state.data?.seasons??[])])].sort().reverse();
 return <section className="rounded-2xl border border-emerald-400/20 bg-[var(--bg)] p-3" aria-label="Defensa del rival">
  <header className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400"><Shield size={13}/> Defensa {opponent||'del rival'}</span><span className="text-[10px] text-[var(--text-muted)]">{report?.settings.previousSeason?`${options.season} + ${report.settings.previousSeason}`:options.season}</span></header>
  <p className="mt-1 text-xs font-bold">{state.market?DEFENSE_MARKETS[state.market]:'Mercado sin ranking'} · {DEFENSE_GROUPS[options.position]}</p>
  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">Posición de referencia<select aria-label="Posición defensiva de referencia" value={options.position} onChange={e=>state.select({position:e.target.value as DefenseGroup})} className="min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--text)]">{Object.entries(DEFENSE_GROUPS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  {state.positionUnclear&&options.position==='ALL'&&<p className="mt-1 text-xs text-[var(--text-muted)]">Rol mixto o sin posición específica. Mostramos la defensa general; podés elegir un grupo.</p>}
  {!state.market?<p className="mt-2 text-xs text-[var(--text-muted)]">Este mercado no tiene una referencia defensiva comparable.</p>:state.loading?<p role="status" className="mt-2 text-xs text-[var(--text-muted)]">Cargando defensa…</p>:state.error?<p role="alert" className="mt-2 text-xs text-amber-400">No pudimos leer la defensa verificada.</p>:report?<DefenseReadout data={report} opponent={opponent} position={options.position} side={side}/>:<p role="status" className="mt-2 text-xs text-[var(--text-muted)]">{state.data?.reason??'Resumen defensivo pendiente.'}</p>}
  {report&&opponent&&rankFor(report,opponent,options.position)?.games===0&&options.position!=='ALL'&&<button type="button" className="mt-2 text-[11px] font-bold text-emerald-400" onClick={()=>state.select({position:'ALL'})}>Ver total del equipo · todas las posiciones</button>}
  {scope!=='FULL'&&<p className="mt-2 text-[11px] text-amber-400">Referencia de partido completo. No mide {scope}; el filtro defensivo queda deshabilitado.</p>}
  <details className="mt-2" onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer text-[11px] font-bold text-emerald-400">Detalle y filtros defensivos</summary>
   <div className="mt-3 space-y-3">
    <div className="grid grid-cols-2 gap-2 text-xs">
     <label>Referencia<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" aria-label="Cantidad de temporadas defensivas" value={options.reference} onChange={e=>state.select({reference:e.target.value as 'season'|'two'})}><option value="season">Una temporada</option><option value="two">Elegida + anterior</option></select></label>
     <label>Temporada<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" aria-label="Temporada defensiva" value={options.season} onChange={e=>state.select({season:e.target.value})}>{seasons.map(s=><option key={s}>{s}</option>)}</select></label>
     <label>Localía del rival<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" value={options.venue??'ALL'} onChange={e=>state.select({venue:e.target.value as 'ALL'|'HOME'|'AWAY'})}><option value="ALL">Todas</option><option value="HOME">Defendiendo de local</option><option value="AWAY">Defendiendo de visitante</option></select></label>
     <label>Ventana<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" aria-label="Ventana defensiva" value={options.window} onChange={e=>state.select({window:e.target.value as typeof options.window})}><option value="season">Temporada</option><option value="10">Últimos 10</option><option value="20">Últimos 20</option></select></label>
     <label className="col-span-2">Posición de referencia<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" aria-label="Posición defensiva" value={options.position} onChange={e=>state.select({position:e.target.value as DefenseGroup})}>{Object.entries(DEFENSE_GROUPS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <fieldset><legend className="mb-1 text-[11px] font-bold">Filtrar el gráfico por defensa</legend><div className="grid grid-cols-2 gap-1">{Object.entries(DEFENSE_BANDS).map(([band,label])=><button type="button" key={band} aria-pressed={state.band===band} disabled={band!=='all'&&!state.canFilter} className={`rounded-lg border px-2 py-2 text-[10px] font-bold disabled:opacity-40 ${state.band===band?'border-emerald-400/40 bg-emerald-400/10 text-emerald-400':'border-[var(--border)] text-[var(--text-muted)]'}`} onClick={()=>state.setBand(band as DefenseBand)}>{label}</button>)}</div></fieldset>
    {!state.canFilter&&scope==='FULL'&&<p className="text-[10px] text-[var(--text-muted)]">El filtro requiere 30 equipos con al menos 5 partidos válidos en esta referencia.</p>}
    <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">1º = el que más permite. {report?.settings.phase==='ALL'?'Regular y Playoffs':report?.settings.phase==='Playoffs'?'Playoffs':'Temporada regular'} · {options.window==='season'?'temporada completa':`últimos ${options.window} de cada equipo`} · datos hasta {day(report?.through??null)}. Se incluyen planteles completos presentes en el archivo. El catálogo agrupa posiciones de referencia; no reconstruye el rol histórico.</p>
    {state.band!=='all'&&<p role="status" className="text-[11px] text-amber-400">{DEFENSE_BANDS[state.band]}. Clasifica rivales históricos con el ranking de referencia elegido; no representa su defensa de aquel día. Solo análisis descriptivo.</p>}
    {opponent&&profile&&state.market==='pts'&&<details onToggle={e=>setShowProfiles(e.currentTarget.open)}><summary className="cursor-pointer text-[11px] font-bold">Jugadores comparables contra {opponent}</summary>
      <p className="my-2 text-xs text-[var(--text-muted)]">Misma posición y diferencias de hasta 6 min y 5 pts. Con datos suficientes comparamos promedios previos de la misma fase, uso ofensivo y distribución de tiro; si faltan, indicamos el perfil básico.</p>
      {options.position==='ALL'?<p className="text-xs">Elegí una posición para comparar.</p>:details.loading||extended.loading?<p className="text-xs">Cargando perfiles…</p>:details.error||!profileData?.recentAvailable?<p className="text-xs">No hay datos verificados para esta comparación.</p>:!comparable.length?<p className="text-xs">No encontramos cruces con ese perfil en los registros disponibles.</p>:<ul className="space-y-2 text-xs">{comparable.map(({row,usage,zones,verified,own,coverage})=><li key={row.id+':'+row.playerId} className="rounded-lg border border-[var(--border)] p-2"><Link className="font-bold hover:text-emerald-400" href={`/players/${row.playerId}`}>{row.name}</Link> · {day(row.date)} · {fmt(row.minutes)} min · {fmt(row.value)} pts · prom. previo {fmt(row.baseline)}
       <p className="text-[var(--text-muted)]">{coverage===2?'Uso y zonas comparados':coverage===1?'Cobertura parcial de uso o tiro':'Perfil básico'}{verified?` · ${row.priorGames} PJ previos del comparable · ${own?.games} del jugador`:''}{usage!==null?` · diferencia de uso: ${fmt(usage)} pp`:''}</p>
       {zones!==null&&row.priorShot&&own?.shot&&<p className="text-[var(--text-muted)]">Distribución de intentos · comparable / jugador: {SHOT_ZONES.map((zone,i)=>`${zone} ${fmt(row.priorShot!.zones[i]/row.priorShot!.attempts*100,0)}/${fmt(own.shot!.zones[i]/own.shot!.attempts*100,0)} %`).join(' · ')} · {row.priorShot.attempts}/{own.shot.attempts} tiros</p>}
      </li>)}</ul>}
    </details>}
    {report&&<details><summary className="cursor-pointer text-[11px] font-bold">Ranking completo</summary><div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-[11px]"><thead><tr><th className="p-1 text-left">Equipo</th><th>Puesto</th><th>Permite</th><th>PJ</th></tr></thead><tbody>{[...(report.rankings[options.position]??[])].sort((a,b)=>(a.rank??99)-(b.rank??99)||a.team.localeCompare(b.team)).map(r=><tr key={r.team} className={`border-t border-[var(--border)] ${r.team===opponent?'font-bold text-emerald-400':''}`}><td className="p-1.5">{r.team}</td><td className="text-center">{r.rank??'—'}</td><td className="text-center">{fmt(r.allowed)}</td><td className="text-center">{r.games}/{r.total}</td></tr>)}</tbody></table></div></details>}
    {opponent&&<details><summary className="cursor-pointer text-[11px] font-bold">Últimos jugadores contra {opponent}</summary><p className="mt-2 text-[10px] text-[var(--text-muted)]">Hasta 30 registros con 15+ minutos · partido completo. Promedio: partidos anteriores del jugador en esa temporada y fase.</p>{details.loading?<p className="mt-2 text-xs" role="status">Cargando jugadores…</p>:details.error||!details.data?.recentAvailable?<p className="mt-2 text-xs text-[var(--text-muted)]">No pudimos cargar esta tabla; el ranking se conserva.</p>:!details.data.recent.length?<p className="mt-2 text-xs text-[var(--text-muted)]">Sin jugadores con esta posición y muestra.</p>:<div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-[10px]"><thead><tr><th className="p-1 text-left">Jugador / fecha</th><th>MIN</th><th>Valor</th><th>Prom.</th></tr></thead><tbody>{details.data.recent.map(r=><tr key={r.id+':'+r.playerId} className="border-t border-[var(--border)]"><td className="p-1.5"><Link className="font-bold hover:text-emerald-400" href={`/players/${r.playerId}`}>{r.name}</Link><span className="block text-[var(--text-muted)]">{r.team} · {day(r.date)}</span></td><td className="text-center">{fmt(r.minutes)}</td><td className="text-center font-bold">{fmt(r.value)}</td><td className="text-center">{fmt(r.baseline)}</td></tr>)}</tbody></table></div>}</details>}
   </div>
  </details>
 </section>;
}
