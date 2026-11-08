'use client';
import {useState} from 'react';
import Link from 'next/link';
import styles from './DefenseContextCard.module.css';
import {Shield} from 'lucide-react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {SHOT_ZONES,zoneDistance} from '@/lib/nbaComparableProfile';
import {usePlayerDefense} from '@/hooks/usePlayerDefense';
import {DEFENSE_GROUPS,DEFENSE_MARKETS,DEFENSE_BANDS,COMPARABLE_MINUTES_GAP,rankFor,type DefenseReport,type DefenseGroup,type DefenseBand} from '@/lib/nbaDefense';

const fmt=(n:number|null|undefined,d=1)=>n==null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:d,minimumFractionDigits:d});
const day=(s:string|null)=>s?s.split('-').reverse().join('/'):'S/D';
type State=ReturnType<typeof usePlayerDefense>;
export function DefenseReadout({data,opponent,position,side}:{data:DefenseReport;opponent:string;position:DefenseGroup;side:'over'|'under'}){
 const row=rankFor(data,opponent,position),delta=row?.diffPct??null;
 if(!opponent){const league=data.rankings[position]?.find(r=>r.leagueAverage!==null)?.leagueAverage??null;return <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Seleccioná el partido arriba para ver la defensa del rival.{league!==null?` Referencia de liga: ${fmt(league)} por partido en este grupo.`:''}</p>;}
 if(!row||row.games===0)return <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{row?.total?`${row.total} partidos de ${opponent}, sin cobertura válida de este mercado y posición.`:`No hay partidos de ${opponent} en esta referencia.`} Podés cambiar temporada o posición en el detalle.</p>;
 const unit:Record<string,string>={pts:'puntos',reb:'rebotes',ast:'asistencias',fg3m:'triples anotados',fga:'tiros de campo intentados',fgm:'tiros de campo anotados',fta:'tiros libres intentados',ftm:'tiros libres anotados',fg3a:'triples intentados',oreb:'rebotes ofensivos',dreb:'rebotes defensivos'};
 const metric=unit[data.settings?.market]??(DEFENSE_MARKETS[data.settings?.market]??'unidades').toLowerCase();
 const short=row.games<(data.minGames??5);
 return <div className={styles.readout}>
  <div className={styles.allowed}><strong>{fmt(row.allowed)}</strong><span>{metric} permitidos por partido</span></div>
  {delta!==null&&<p className={styles.delta}>{Math.abs(delta)<.05?'Similar al promedio de la liga':`${fmt(Math.abs(delta))}% ${delta>0?'más':'menos'} que el promedio de la liga`}</p>}
  {delta!==null&&!short&&<p className={styles.explanation}>{Math.abs(delta)<.05?'Esta defensa está cerca del promedio de la liga.':`Este rival concede ${delta>0?'más':'menos'} ${metric} que el promedio${position==='ALL'?'':' a este grupo de jugadores'}.`}</p>}
  <p className={styles.coverage}>Datos de <strong>{row.games} de {row.total} partidos</strong>.{short?' Todavía hay pocos partidos para comparar.':''}</p>
  <p className={styles.note}>{position==='ALL'?'Total del equipo rival.':'Suma de todos los jugadores de este grupo por partido.'} No es una proyección para tu jugador.</p>
  <details className={styles.calculation}><summary>Cómo se compara con la liga</summary><div>
   <p>{row.rank!==null?`Puesto ${row.rank} de ${row.rankedTeams} equipos con datos. El 1.º es el que más permite.`:`Sin orden aún: necesita al menos ${data.minGames??5} partidos con datos para entrar al ranking.`}</p>
   {row.leagueAverage!=null&&<p>Promedio de la liga: {fmt(row.leagueAverage)} por partido.</p>}
   {row.rankedTeams<30&&<p>Ranking parcial: {row.rankedTeams} de 30 equipos tienen datos suficientes.</p>}
   {data.settings?.previousSeason&&<p>{[data.settings.season,data.settings.previousSeason].map(season=>`${season}: ${row.seasonGames?.[season]??0} partidos`).join(' · ')}</p>}
  </div></details>
 </div>;

}
export default function DefenseContextCard({state,opponent,scope,side,profile}:{profile?:{playerId:number;minutes:number;sample:number};state:State;opponent:string;scope:string;side:'over'|'under'}){
 const [open,setOpen]=useState(false),{options,report}=state;
 const [showProfiles,setShowProfiles]=useState(false);
 const details=useAnalysisQuery<DefenseReport>(open&&state.url&&opponent?state.url+'&details=1':null);
 const similarUrl=showProfiles&&scope==='FULL'&&state.url&&opponent&&options.position!=='ALL'&&profile?.playerId?
  state.url+'&details=1&profilePlayer='+profile.playerId+'&similarMinutes='+profile.minutes.toFixed(1):null;
 const comparable=useAnalysisQuery<DefenseReport>(similarUrl,undefined,8000);
 const seasons=[...new Set([options.season,...(state.data?.seasons??[])])].sort().reverse();
 return <section className={styles.card} aria-label="Defensa del rival">
  <header className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400"><Shield size={13}/> Defensa {opponent||'del rival'}</span><span className="text-[10px] text-[var(--text-muted)]">{report?.settings.previousSeason?`${options.season} + ${report.settings.previousSeason}`:options.season}</span></header>
  <p className="mt-1 text-xs font-bold">{state.market?DEFENSE_MARKETS[state.market]:'Mercado sin ranking'} · {DEFENSE_GROUPS[options.position]}</p>
  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">Posición del jugador<select aria-label="Posición defensiva de referencia" value={options.position} onChange={e=>state.select({position:e.target.value as DefenseGroup})} className="min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--text)]">{Object.entries(DEFENSE_GROUPS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  {state.positionUnclear&&options.position==='ALL'&&<p className="mt-1 text-xs text-[var(--text-muted)]">Posición mixta: mostramos el total del equipo. Podés elegir un grupo para comparar.</p>}
  {!state.market?<p className="mt-2 text-xs text-[var(--text-muted)]">Este mercado no tiene una referencia defensiva comparable.</p>:state.loading?<p role="status" className="mt-2 text-xs text-[var(--text-muted)]">Cargando defensa…</p>:state.error?<p role="alert" className="mt-2 text-xs text-amber-400">No pudimos leer la defensa verificada.</p>:report?<DefenseReadout data={report} opponent={opponent} position={options.position} side={side}/>:<p role="status" className="mt-2 text-xs text-[var(--text-muted)]">{state.data?.reason??'Resumen defensivo pendiente.'}</p>}
  {report&&opponent&&rankFor(report,opponent,options.position)?.games===0&&options.position!=='ALL'&&<button type="button" className="mt-2 text-[11px] font-bold text-emerald-400" onClick={()=>state.select({position:'ALL'})}>Ver total del equipo · todas las posiciones</button>}
  {scope!=='FULL'&&<p className="mt-2 text-[11px] text-amber-400">Referencia de partido completo. No mide {scope}; el filtro defensivo queda deshabilitado.</p>}
  {opponent&&state.market&&scope==='FULL'&&<details className="mt-2" onToggle={e=>setShowProfiles(e.currentTarget.open)}>
   <summary className={styles.disclosure}>Jugadores similares vs. {opponent}</summary>
   <div className="mt-2 space-y-2 text-xs">
    {!profile?<p>Se necesitan cinco partidos con minutos para armar un perfil de este jugador.</p>:options.position==='ALL'?<p>Elegí la posición del jugador para comparar.</p>:<>
     <p className="text-[var(--text-muted)]">Misma posición y hasta {COMPARABLE_MINUTES_GAP} min de diferencia con los {fmt(profile.minutes)} min de esta muestra ({profile.sample} PJ). Cada comparable tiene al menos cinco partidos previos.</p>
     {comparable.loading?<p role="status">Buscando comparables…</p>:comparable.error||!comparable.data?.recentAvailable?<p>Sin datos verificados para esta comparación.</p>:!comparable.data.recent.length?<p>No encontramos cruces con ese perfil y estos filtros.</p>:
     <ul className="space-y-2">{comparable.data.recent.slice(0,5).map(row=>{
      const own=comparable.data?.profiles?.[row.phase??''];
      const usage=own?.usage!=null&&row.priorUsage!=null&&(row.usageGames??0)>=5?Math.abs(own.usage-row.priorUsage):null;
      const zones=own?.shot&&row.priorShot?zoneDistance(own.shot,row.priorShot):null;
      const delta=row.value!==null&&row.baseline!==null?row.value-row.baseline:null;
      return <li key={row.id+':'+row.playerId} className="rounded-lg border border-[var(--border)] p-2">
       <Link className="font-bold hover:text-emerald-400" href={`/players/${row.playerId}`}>{row.name}</Link><span className="text-[var(--text-muted)]"> · {row.team} · {day(row.date)}</span>
       <div className="mt-1"><strong>{fmt(row.value)}</strong> vs. {opponent} · {fmt(row.baseline)} de promedio previo{delta!==null&&<span> ({delta>0?'+':''}{delta.toLocaleString('es-AR',{maximumFractionDigits:1})})</span>}</div>
       <p className="text-[var(--text-muted)]">{fmt(row.minutes)} min en ese partido · {fmt(row.priorMinutes)} min previos · {row.priorGames} PJ{usage!==null?` · diferencia de uso: ${fmt(usage)} pp`:''}</p>
       {zones!==null&&row.priorShot&&own?.shot&&<details><summary className="cursor-pointer">Distribución de tiros</summary><p className="text-[var(--text-muted)]">Comparable / jugador: {SHOT_ZONES.map((zone,i)=>`${zone} ${fmt(row.priorShot!.zones[i]/row.priorShot!.attempts*100,0)}/${fmt(own.shot!.zones[i]/own.shot!.attempts*100,0)} %`).join(' · ')}</p></details>}
      </li>;
     })}</ul>}
    </>}
   </div>
  </details>}
  <details className="mt-2" onToggle={e=>setOpen(e.currentTarget.open)}><summary className={styles.disclosure}>Ajustar análisis</summary>
   <div className="mt-3 space-y-3">
    <div className="grid grid-cols-2 gap-2 text-xs">
     <label>Temporadas<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" aria-label="Cantidad de temporadas defensivas" value={options.reference} onChange={e=>state.select({reference:e.target.value as 'season'|'two'})}><option value="season">Una temporada</option><option value="two">Elegida + anterior</option></select></label>
     <label>Temporada<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" aria-label="Temporada defensiva" value={options.season} onChange={e=>state.select({season:e.target.value})}>{seasons.map(s=><option key={s}>{s}</option>)}</select></label>
     <label>Localía del rival<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" value={options.venue??'ALL'} onChange={e=>state.select({venue:e.target.value as 'ALL'|'HOME'|'AWAY'})}><option value="ALL">Todas</option><option value="HOME">Defendiendo de local</option><option value="AWAY">Defendiendo de visitante</option></select></label>
     <label>Partidos a comparar<select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5" aria-label="Ventana defensiva" value={options.window} onChange={e=>state.select({window:e.target.value as typeof options.window})}><option value="season">Temporada</option><option value="10">Últimos 10</option><option value="20">Últimos 20</option></select></label>

    </div>
    <fieldset><legend className="mb-1 text-[11px] font-bold">Ver partidos según la defensa rival</legend><div className="grid grid-cols-2 gap-1">{Object.entries(DEFENSE_BANDS).map(([band,label])=><button type="button" key={band} aria-pressed={state.band===band} disabled={band!=='all'&&!state.canFilter} className={`rounded-lg border px-2 py-2 text-[10px] font-bold disabled:opacity-40 ${state.band===band?'border-emerald-400/40 bg-emerald-400/10 text-emerald-400':'border-[var(--border)] text-[var(--text-muted)]'}`} onClick={()=>state.setBand(band as DefenseBand)}>{({all:'Todas',high:'Permiten más',middle:'Intermedias',low:'Permiten menos'} as Record<string,string>)[band]??label}</button>)}</div></fieldset>
    {!state.canFilter&&scope==='FULL'&&<p className="text-[10px] text-[var(--text-muted)]">Este filtro se habilita cuando los 30 equipos tienen al menos 5 partidos con datos. Por ahora podés consultar cada defensa por separado.</p>}
    <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">1º = el que más permite. {report?.settings.phase==='ALL'?'Regular y Playoffs':report?.settings.phase==='Playoffs'?'Playoffs':'Temporada regular'} · {options.window==='season'?'temporada completa':`últimos ${options.window} de cada equipo`} · datos hasta {day(report?.through??null)}. Se incluyen planteles completos presentes en el archivo. El catálogo agrupa posiciones de referencia; no reconstruye el rol histórico.</p>
    {state.band!=='all'&&<p role="status" className="text-[11px] text-amber-400">{DEFENSE_BANDS[state.band]}. Clasifica rivales históricos con el ranking de referencia elegido; no representa su defensa de aquel día. Solo análisis descriptivo.</p>}
    {report&&<details><summary className="cursor-pointer text-[11px] font-bold">Ranking completo</summary><div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-[11px]"><thead><tr><th className="p-1 text-left">Equipo</th><th>Puesto</th><th>Permite</th><th>PJ</th></tr></thead><tbody>{[...(report.rankings[options.position]??[])].sort((a,b)=>(a.rank??99)-(b.rank??99)||a.team.localeCompare(b.team)).map(r=><tr key={r.team} className={`border-t border-[var(--border)] ${r.team===opponent?'font-bold text-emerald-400':''}`}><td className="p-1.5">{r.team}</td><td className="text-center">{r.rank??'—'}</td><td className="text-center">{fmt(r.allowed)}</td><td className="text-center">{r.games}/{r.total}</td></tr>)}</tbody></table></div></details>}
    {opponent&&<details><summary className="cursor-pointer text-[11px] font-bold">Últimos jugadores contra {opponent}</summary><p className="mt-2 text-[10px] text-[var(--text-muted)]">Hasta 30 registros con 15+ minutos · partido completo. Promedio: partidos anteriores del jugador en esa temporada y fase.</p>{details.loading?<p className="mt-2 text-xs" role="status">Cargando jugadores…</p>:details.error||!details.data?.recentAvailable?<p className="mt-2 text-xs text-[var(--text-muted)]">No pudimos cargar esta tabla; el ranking se conserva.</p>:!details.data.recent.length?<p className="mt-2 text-xs text-[var(--text-muted)]">Sin jugadores con esta posición y muestra.</p>:<div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-[10px]"><thead><tr><th className="p-1 text-left">Jugador / fecha</th><th>MIN</th><th>Valor</th><th>Prom.</th></tr></thead><tbody>{details.data.recent.map(r=><tr key={r.id+':'+r.playerId} className="border-t border-[var(--border)]"><td className="p-1.5"><Link className="font-bold hover:text-emerald-400" href={`/players/${r.playerId}`}>{r.name}</Link><span className="block text-[var(--text-muted)]">{r.team} · {day(r.date)}</span></td><td className="text-center">{fmt(r.minutes)}</td><td className="text-center font-bold">{fmt(r.value)}</td><td className="text-center">{fmt(r.baseline)}</td></tr>)}</tbody></table></div>}</details>}
   </div>
  </details>
 </section>;
}
