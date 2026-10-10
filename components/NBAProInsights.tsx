"use client";
import AnalysisAccordion from "@/components/AnalysisAccordion";
import { useEffect, useMemo, useState } from 'react';
import { ROLE_METRICS, prepareRoleSeason, summarizeRole, roleValue, type RoleRow } from '@/lib/nbaRole';
import { leagueDelta } from '@/lib/nbaAnalysis';
import { paired, proOpponent, restGroups } from '@/lib/nbaPro';

const fmt = (v: number | null) => v === null ? 'S/D' : v.toLocaleString('es-AR', {maximumFractionDigits:1});
const box = 'rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4';
const muted = 'text-xs leading-5 text-[var(--text-muted)]';
const btn = 'rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold';
type ShotRow = { game_id: string; shot_zone_basic?: string | null; shot_made_flag?: number | null };
type Remote = { ok?: boolean; error?: string; available?: boolean; zones?: {zone:string; attempts:number; made:number; games:number; league_attempts:number; league_made:number; league_team_games:number}[]; teamDates?: {team:string; date:string}[] };
const remoteCache = new Map<string,{expires:number;data:Remote}>();
function useRemote(url: string, enabled: boolean) {
  const [state,setState] = useState<{url:string; data:Remote|null; loading:boolean; error:string}>({url:'',data:null,loading:false,error:''});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!enabled) return;
    const cached=remoteCache.get(url);
    if(cached&&cached.expires>Date.now()&&retry===0){setState({url,data:cached.data,loading:false,error:""});return;}
    const controller = new AbortController();
    setState({url,data:null,loading:true,error:''});
    fetch(url,{signal:controller.signal}).then(async response=>{
      const data=await response.json(); if(!response.ok||!data.ok) throw new Error(data.error||'No se pudieron cargar los datos.');
      if(controller.signal.aborted)return;
      if(remoteCache.size>=60)remoteCache.delete(remoteCache.keys().next().value!);
      remoteCache.set(url,{expires:Date.now()+300000,data});
      setState({url,data,loading:false,error:''});
    }).catch(error=>{if(error.name!=='AbortError')setState({url,data:null,loading:false,error:'No se pudieron cargar los datos. Reintentá.'});});
    return ()=>controller.abort();
  },[url,enabled,retry]);
  return {...(state.url===url?state:{data:null,loading:enabled,error:''}),retry:()=>setRetry(v=>v+1)};
}
function Status({state}: {state:ReturnType<typeof useRemote>}) {
  return state.loading?<p className={muted}>Cargando…</p>:state.error?<div className={muted}>{state.error} <button type="button" className={btn} onClick={state.retry}>Reintentar</button></div>:null;
}
function Section({title,children,onToggle}: {title:string; children:React.ReactNode; onToggle?:(value:boolean)=>void}) {
  return <AnalysisAccordion title={title} icon={title.startsWith('Descanso')?'rest':'defense'} onToggle={onToggle}>{children}</AnalysisAccordion>;
}
export default function NBAProInsights({rows,shots,playerId,opponent,seasonType,range,nextGameDate}: {rows:RoleRow[];shots:ShotRow[];playerId:string;opponent:string;seasonType:string;range:number;nextGameDate?:string|null}) {
  const [mode,setMode]=useState<'game'|'per36'>('game');
  const [window,setWindow]=useState<5|10>(5);
  const [rivalOnly,setRivalOnly]=useState(false);
  const [restOpen,setRestOpen]=useState(false), [defenseOpen,setDefenseOpen]=useState(false);
  const season = prepareRoleSeason(rows,seasonType==='ALL'?'all':seasonType==='Playoffs'?'playoffs':'regular');
  const scope = season.games.filter(row=>!rivalOnly||opponent==='ALL'||proOpponent(row)===opponent);
  const recent = range>0?scope.slice(0,range):scope;
  const metrics = ROLE_METRICS.map(metric=>({metric,samples:[scope,scope.slice(0,10),scope.slice(0,5)].map(games=>summarizeRole(games,metric,mode))}));
  const signals = ROLE_METRICS.slice(0,7).flatMap(metric=>{
    const a=summarizeRole(scope.slice(0,window),metric,mode), b=summarizeRole(scope.slice(window,window*2),metric,mode);
    if(a.count<window||b.count<window||a.value===null||b.value===null)return[];
    const delta=a.value-b.value, pct=b.value>0?delta/b.value*100:null;
    if(metric.percent?Math.abs(delta)<2:pct===null||Math.abs(pct)<10)return[];
    return [{label:metric.label,delta,change:metric.percent?`${fmt(delta)} pp`:`${fmt(pct)}%`,a:a.value,b:b.value}];
  });
  const query=`playerId=${encodeURIComponent(playerId)}&season=${encodeURIComponent(season.label)}&phase=${encodeURIComponent(seasonType)}`;
  const defense=useRemote(`/api/nba-pro-context?kind=defense&${query}&opponent=${encodeURIComponent(opponent)}`,defenseOpen&&opponent!=='ALL');
  const rest=useRemote(`/api/nba-pro-context?kind=rest&${query}`,restOpen);
  const restSummary=restGroups(recent,rest.data?.teamDates??[]);
  const zones = useMemo(()=>{
    const ids=new Set(recent.map(row=>String(row.game_id)));
    const totals=new Map<string,{attempts:number;made:number}>();
    for(const shot of shots){if(!ids.has(String(shot.game_id)))continue;const zone=shot.shot_zone_basic||'Sin zona';const total=totals.get(zone)??{attempts:0,made:0};total.attempts++;total.made+=shot.shot_made_flag===1?1:0;totals.set(zone,total);}
    return [...totals.entries()].sort((a,b)=>b[1].attempts-a[1].attempts);
  },[recent,shots]);
  const totalShots=zones.reduce((sum,[,value])=>sum+value.attempts,0);
  return <div className="space-y-3">
    <p className={muted}>Contexto del rival · {season.label} · {seasonType==='ALL'?'Todas las fases':seasonType}. Este bloque usa partidos completos. El resumen de rol sigue el período del gráfico.</p>
    <label className={`flex items-center gap-2 ${muted}`}><input type="checkbox" checked={rivalOnly} disabled={opponent==='ALL'} onChange={event=>setRivalOnly(event.target.checked)} />Analizar solamente partidos contra {opponent==='ALL'?'el rival seleccionado':opponent}</label>
    <Section title="Perfil del rival · defensa por zona" onToggle={setDefenseOpen}>
      {opponent==='ALL'?<p className={muted}>Elegí el equipo rival arriba.</p>:<><Status state={defense}/>{defense.data&&<><p className={muted}>Jugador: {recent.length} PJ seleccionados · Rival {opponent}: tiros que concede a todos los jugadores en {season.label}, {seasonType==='ALL'?'todas las fases':seasonType}. La defensa usa la fase completa, no L5/L10.</p><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-xs"><thead><tr>{['Zona','Peso del jugador','TC jugador','TC concedido','TC liga disponible','Diferencia vs liga','Tiros / PJ rival'].map(label=><th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{zones.map(([zone,value])=>{const rival=defense.data?.zones?.find(z=>z.zone===zone);return <tr key={zone} className="border-t border-[var(--border)]"><td className="p-2">{zone}</td><td className="p-2">{fmt(totalShots?value.attempts/totalShots*100:null)}% · {value.attempts} tiros</td><td className="p-2">{fmt(value.made/value.attempts*100)}%</td><td className="p-2">{rival&&rival.attempts?`${fmt(rival.made/rival.attempts*100)}% · ${rival.attempts} tiros`:'S/D'}</td><td className="p-2">{rival&&rival.league_attempts?`${fmt(rival.league_made/rival.league_attempts*100)}% · ${rival.league_attempts} tiros`:'S/D'}</td><td className="p-2">{rival ? (()=>{const delta=leagueDelta(rival,{attempts:rival.league_attempts,made:rival.league_made});return delta===null?'Muestra insuficiente':`${delta>=0?'+':''}${fmt(delta)} pp`;})():'S/D'}</td><td className="p-2">{rival?`${fmt(rival.games?rival.attempts/rival.games:null)} · ${rival.games} PJ`:'S/D'}</td></tr>;})}</tbody></table></div>{!zones.length&&<p className={muted}>Sin tiros del jugador en la muestra elegida.</p>}<p className={muted}>PJ rival cuenta partidos con tiros disponibles en la fuente. Describe zonas; no mide todavía pick and roll, tiros tras pase o tras bote. La referencia de liga incluye únicamente tiros disponibles en esta fuente. Mostramos diferencia con al menos 50 tiros del rival y 200 de liga por zona. No es una prueba estadística ni demuestra una ventaja por sí sola.</p></>}</>}
    </Section>
    <Section title="Descanso y partidos consecutivos" onToggle={setRestOpen}>
      <Status state={rest}/>{rest.data&&<><p className={muted}>Descanso del equipo, incluyendo partidos que el jugador no disputó. {nextGameDate?`Próximo partido: ${nextGameDate.slice(0,10)}.`:''}</p><div className="overflow-x-auto"><table className="w-full min-w-[450px] text-xs"><thead><tr>{['Situación','PJ','MIN','PTS','REB','AST'].map(label=><th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{restSummary.groups.map(group=><tr key={group.label} className="border-t border-[var(--border)]"><th className="p-2 text-left">{group.label}</th><td className="p-2">{group.rows.length}</td>{['minutes','pts','reb','ast'].map(id=>{const sample=summarizeRole(group.rows,ROLE_METRICS.find(m=>m.id===id)!);return <td className="p-2" key={id}>{fmt(sample.value)} <small>({sample.count})</small></td>;})}</tr>)}</tbody></table></div><p className={muted}>{restSummary.unknown} PJ sin antecedente de calendario disponible. Las diferencias son descriptivas; pueden cambiar por rival, lesiones o minutos.</p></>}
    </Section>
  </div>;
}
