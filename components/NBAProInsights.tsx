"use client";
import {sampleGameKey} from '@/lib/playerSample';
import AnalysisAccordion from "@/components/AnalysisAccordion";
import { useEffect, useMemo, useState } from 'react';
import { ROLE_METRICS, prepareRoleSeason, summarizeRole, roleValue, type RoleRow } from '@/lib/nbaRole';
import { leagueDelta } from '@/lib/nbaAnalysis';
import { paired, proOpponent, restGroups,onOff } from '@/lib/nbaPro';

const fmt = (v: number | null) => v === null ? 'S/D' : v.toLocaleString('es-AR', {maximumFractionDigits:1});
const box = 'rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4';
const muted = 'text-xs leading-5 text-[var(--text-muted)]';
const btn = 'rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold';
type ShotRow = { game_id: string; shot_zone_basic?: string | null; shot_made_flag?: number | null; shot_attempted_flag?:number|null; action_type?:string|null };
type Stint={game_id:string;game_date:string;start_seconds:number;end_seconds:number;game_seconds:number;lineup:number[];pts:number;reb:number;ast:number;fga:number};
type Remote = {stints?:Stint[];players?:{id:number;name:string}[]; ok?: boolean; error?: string; available?: boolean; zones?: {zone:string; attempts:number; made:number; games:number; league_attempts:number; league_made:number; league_team_games:number}[]; teamDates?: {team:string; date:string}[] };
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
export default function NBAProInsights({rows,shots,playerId,opponent,seasonType,range,nextGameDate,rivalOnly:controlledRivalOnly,onRivalOnlyChange,referenceSeason,combinedSeasons,view="all"}: {rows:RoleRow[];shots:ShotRow[];playerId:string;opponent:string;seasonType:string;range:number;nextGameDate?:string|null;rivalOnly?:boolean;onRivalOnlyChange?:(value:boolean)=>void;referenceSeason?:string;combinedSeasons?:string;view?:"all"|"opponent"|"shots"}) {
  const [mode,setMode]=useState<'game'|'per36'>('game');
  const [window,setWindow]=useState<5|10>(5);
  const [localRivalOnly,setLocalRivalOnly]=useState(false);
  const rivalOnly=controlledRivalOnly??localRivalOnly;
  const setRivalOnly=onRivalOnlyChange??setLocalRivalOnly;
  const [zoneView,setZoneView]=useState<'player'|'defense'|'matchup'>(view==='shots'?'player':'matchup');
  const [stintsOpen,setStintsOpen]=useState(false);
  const [stintGame,setStintGame]=useState('');
  const [courtMate,setCourtMate]=useState('');
  const [restOpen,setRestOpen]=useState(false), [defenseOpen,setDefenseOpen]=useState(false);
  const season = prepareRoleSeason(rows,seasonType==='ALL'?'all':seasonType==='Playoffs'?'playoffs':'regular',!!combinedSeasons);
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
  const seasonLabel=referenceSeason??season.label;
  const query=`playerId=${encodeURIComponent(playerId)}&season=${encodeURIComponent(seasonLabel)}&phase=${encodeURIComponent(seasonType)}`;
  const defense=useRemote(`/api/nba-pro-context?kind=defense&${query}&opponent=${encodeURIComponent(opponent)}`,defenseOpen&&zoneView!=='player'&&opponent!=='ALL');
  const rest=useRemote(`/api/nba-pro-context?kind=rest&${query}`,view!=='shots'&&restOpen);
  const rotations=useRemote(`/api/nba-pro-context?kind=stints&${query}`,view!=='shots'&&stintsOpen);
  const rotationGames=[...new Map((rotations.data?.stints??[]).filter(row=>!nextGameDate||row.game_date<nextGameDate.slice(0,10)).map(row=>[row.game_id,row.game_date])).entries()];
  const rotationId=rotationGames.some(([id])=>id===stintGame)?stintGame:rotationGames[0]?.[0];
  const activeStints=rotations.data?.stints?.filter(row=>row.game_id===rotationId)??[];
  const sampledIds=new Set(recent.map(row=>sampleGameKey(row.game_id)));
  const validStints=(rotations.data?.stints??[]).filter(row=>sampledIds.has(sampleGameKey(row.game_id))&&row.lineup.includes(Number(playerId))&&row.end_seconds>row.start_seconds);
  const courtMates=[...new Set(validStints.flatMap(row=>row.lineup))].filter(id=>id!==Number(playerId));
  const mateGames=new Set(validStints.filter(row=>row.lineup.includes(Number(courtMate))).map(row=>sampleGameKey(row.game_id)));
  const courtComparison=courtMate?onOff(validStints.filter(row=>mateGames.has(sampleGameKey(row.game_id))),Number(courtMate)):[];
  const restSummary=restGroups(recent,rest.data?.teamDates??[]);
  const zones = useMemo(()=>{
    const ids=new Set(recent.map(row=>sampleGameKey(row.game_id)));
    const totals=new Map<string,{attempts:number;made:number}>();
    for(const shot of shots){if(!ids.has(sampleGameKey(shot.game_id))||shot.shot_attempted_flag===0||!(shot.shot_made_flag===0||shot.shot_made_flag===1))continue;const zone=shot.shot_zone_basic||'Sin zona';const total=totals.get(zone)??{attempts:0,made:0};total.attempts++;total.made+=shot.shot_made_flag===1?1:0;totals.set(zone,total);}
    return [...totals.entries()].sort((a,b)=>b[1].attempts-a[1].attempts);
  },[recent,shots]);
  const totalShots=zones.reduce((sum,[,value])=>sum+value.attempts,0);
  const actionTypes=useMemo(()=>{
    const ids=new Set(recent.map(row=>sampleGameKey(row.game_id)));
    const result=new Map<string,{made:number;attempts:number}>();
    for(const shot of shots){
      const key=shot.action_type?.trim();
      if(!key||!ids.has(sampleGameKey(shot.game_id))||shot.shot_attempted_flag===0||!(shot.shot_made_flag===0||shot.shot_made_flag===1))continue;
      const stat=result.get(key)??{made:0,attempts:0};
      stat.attempts++;stat.made+=shot.shot_made_flag;result.set(key,stat);
    }
    return [...result.entries()].sort((a,b)=>b[1].attempts-a[1].attempts);
  },[recent,shots]);
  const clock=(seconds:number)=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');

  return <div className="space-y-3">
    <p className={muted}>Historial del jugador · {combinedSeasons??seasonLabel} · {seasonType==='ALL'?'Todas las fases':seasonType}. Este bloque usa partidos completos. El resumen de rol sigue el período del gráfico.</p>
    <label className={`flex items-center gap-2 ${muted}`}><input type="checkbox" checked={rivalOnly} disabled={opponent==='ALL'} onChange={event=>setRivalOnly(event.target.checked)} />Solo contra el rival · {opponent==='ALL'?'el rival seleccionado':opponent}</label>
    <Section title="Tiros por zona · jugador y rival" onToggle={setDefenseOpen}>
      <div className="flex flex-wrap gap-2">{(['player','defense','matchup'] as const).map(key=><button key={key} type="button" className={btn+' '+(zoneView===key?'border-cyan-400 text-cyan-300':'')} aria-pressed={zoneView===key} onClick={()=>setZoneView(key)}>{key==='player'?'Dónde tira el jugador':key==='defense'?'Qué concede el rival':'Comparar por zona'}</button>)}</div>
      {zoneView!=='player'&&<>{opponent==='ALL'?<p className={muted}>Elegí un rival para ver lo que concede.</p>:<Status state={defense}/>}</>}
      <p className={muted}>Jugador: {recent.length} PJ de la muestra elegida. Defensa del rival: referencia de {seasonLabel}; incluye solo partidos disponibles en la fuente.</p>
      <div className="grid gap-2 md:grid-cols-2">{[...new Set([...(zoneView==='defense'?[]:zones.map(([key])=>key)),...(zoneView==='player'?[]:defense.data?.zones?.map(x=>x.zone)??[])])].map(zone=>{
        const own=zones.find(([key])=>key===zone)?.[1], rival=defense.data?.zones?.find(x=>x.zone===zone);
        const delta=rival?leagueDelta(rival,{attempts:rival.league_attempts,made:rival.league_made}):null;
        const ownShare=own&&totalShots?own.attempts/totalShots*100:null;
        return <div key={zone} className={box}><strong className="text-xs">{zone}</strong>
          {zoneView!=='defense'&&<><p className={muted}>Jugador: {own?`${own.made}/${own.attempts} · ${fmt(own.made/own.attempts*100)}% TC · ${fmt(ownShare)}% de sus intentos${own.attempts<5?' · muestra corta':''}`:'S/D'}</p>{ownShare!==null&&<div className="h-1 rounded bg-[var(--surface-soft)]"><div className="h-1 rounded bg-emerald-400" style={{width:ownShare+'%'}}/></div>}</>}
          {zoneView!=='player'&&<p className={muted}>Rival: {rival?.attempts?`${rival.made}/${rival.attempts} · ${fmt(rival.made/rival.attempts*100)}% TC concedido · ${rival.games} PJ${rival.attempts<5?' · muestra corta':''}`:'S/D'}{zoneView==='matchup'&&delta!==null?` · ${delta>=0?'+':''}${fmt(delta)} pp vs. liga`:''}</p>}
        </div>;
      })}</div>
      {zoneView!=='defense'&&!zones.length&&<p className={muted}>Sin tiros del jugador para esta muestra.</p>}
      {zoneView!=='player'&&opponent!=='ALL'&&defense.data&&!defense.data.zones?.length&&<p className={muted}>Sin tiros concedidos disponibles para ese rival.</p>}
    </Section>
    {view!=='opponent'&&<Section title="Tipos de tiro registrados">
      <p className={muted}>Categorías de la fuente de tiros, no sistemas ofensivos ni conexiones de asistencia. {actionTypes.reduce((n,[,x])=>n+x.attempts,0)} de {totalShots} tiros con tipo registrado.</p>
      {actionTypes.length?<ul className="grid gap-2 sm:grid-cols-2">{actionTypes.map(([name,x])=><li className={box} key={name}><strong className="text-xs">{name}</strong><p className={muted}>{x.made}/{x.attempts} · {fmt(100*x.made/x.attempts)}% TC</p></li>)}</ul>:<p className={muted}>Sin tipos de tiro en la muestra.</p>}
    </Section>}
    {view!=="shots"&&<>
    <Section title="Rotaciones históricas verificadas" onToggle={setStintsOpen}>
      <Status state={rotations}/>
      {rotations.data&&!rotationGames.length&&<p className={muted}>No hay tramos conciliados para este jugador en esta referencia.</p>}
      {courtMates.length>0&&<div className={box}><h3 className="text-sm font-bold">Compañero en cancha / fuera de cancha</h3><label className={muted}>Compañero <select className={btn+' bg-[var(--bg)]'} value={courtMate} onChange={e=>setCourtMate(e.target.value)}><option value="">Elegí un compañero</option>{courtMates.map(id=><option key={id} value={id}>{rotations.data?.players?.find(p=>p.id===id)?.name??'Jugador '+id}</option>)}</select></label>
        <p className={muted}>Solo tramos verificados donde el jugador analizado estuvo en cancha, de partidos de la muestra en los que también se vio al compañero. Para ausencias de partido completo, usá el filtro de compañeros.</p>
        {courtComparison.map(row=><p key={String(row.on)} className={muted}><strong>{row.on?'Juntos':'Compañero fuera de cancha'}</strong> · {row.games} PJ · {fmt(row.minutes)} min{row.minutes>0&&<> · por 36 min: {row.values.map((value,i)=>`${fmt(value)} ${['PTS','REB','AST','FGA'][i]}`).join(' · ')}</>}</p>)}</div>}
      {rotationGames.length>0&&<>
        <label className={muted}>Partido <select className={btn+' bg-[var(--bg)]'} value={rotationId} onChange={e=>setStintGame(e.target.value)}>{rotationGames.map(([id,date])=><option key={id} value={id}>{date} · {id}</option>)}</select></label>
        <p className={muted}>Tiempo transcurrido desde el inicio. {fmt(activeStints.reduce((sum,row)=>sum+row.end_seconds-row.start_seconds,0)/60)} minutos conciliados.</p>
        <ul className="space-y-2">{activeStints.map(row=><li className={box} key={row.start_seconds}>
          <strong className="text-xs">{clock(row.start_seconds)} a {clock(row.end_seconds)} · {row.pts} PTS · {row.reb} REB · {row.ast} AST · {row.fga} FGA</strong>
          <p className={muted}>{row.lineup.map(id=>rotations.data?.players?.find(p=>p.id===id)?.name??'Jugador '+id).join(' · ')}</p>
        </li>)}</ul>
      </>}
    </Section>
    <Section title="Descanso y partidos consecutivos" onToggle={setRestOpen}>
      <Status state={rest}/>{rest.data&&<><p className={muted}>Calendario de descanso: {seasonLabel}. Incluye partidos que el jugador no disputó. {nextGameDate?`Próximo partido: ${nextGameDate.slice(0,10)}.`:''}</p><div className="overflow-x-auto"><table className="w-full min-w-[450px] text-xs"><thead><tr>{['Situación','PJ','MIN','PTS','REB','AST'].map(label=><th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{restSummary.groups.map(group=><tr key={group.label} className="border-t border-[var(--border)]"><th className="p-2 text-left">{group.label}</th><td className="p-2">{group.rows.length}</td>{['minutes','pts','reb','ast'].map(id=>{const sample=summarizeRole(group.rows,ROLE_METRICS.find(m=>m.id===id)!);return <td className="p-2" key={id}>{fmt(sample.value)} <small>({sample.count})</small></td>;})}</tr>)}</tbody></table></div><p className={muted}>{restSummary.unknown} PJ sin antecedente de calendario disponible. Las diferencias son descriptivas; pueden cambiar por rival, lesiones o minutos.</p></>}
    </Section>
    </>}
  </div>;
}
