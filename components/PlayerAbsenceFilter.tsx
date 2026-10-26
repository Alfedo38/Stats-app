"use client";
import {useEffect,useState} from 'react';
import {ChevronDown,Users,X} from 'lucide-react';
import type {AbsenceScope,AbsenceOption} from '@/lib/playerAbsenceContext';
type Catalog={key:string;options:Omit<AbsenceOption,'aliases'>[];teams:string[];team:string;at:string;warning:string;loading:boolean;error:string};
const empty=(key:string):Catalog=>({key,options:[],teams:[],team:'',at:'',warning:'',loading:true,error:''});
export default function PlayerAbsenceFilter({playerId,selected,onChange,loading,error,onRetry,scope,team,onScopeChange,onTeamChange,emptyReason}:{playerId:string;selected:string[];onChange:(names:string[])=>void;loading:boolean;error:string|null;onRetry:()=>void;scope:AbsenceScope;team:string;onScopeChange:(scope:AbsenceScope)=>void;onTeamChange:(team:string)=>void;emptyReason?:string|null}){
 const [catalog,setCatalog]=useState<Catalog>(()=>empty('')),[query,setQuery]=useState(''),[retry,setRetry]=useState(0);
 const key=JSON.stringify([playerId,scope,team]),active=catalog.key===key?catalog:empty(key);
 useEffect(()=>{
  const controller=new AbortController();setCatalog(empty(key));setQuery('');
  const params=new URLSearchParams({playerId,scope});if(team)params.set('team',team);
  fetch('/api/player-absence?'+params,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'No se pudo cargar el catálogo.');
   if(!controller.signal.aborted)setCatalog({key,options:Array.isArray(data.options)?data.options:[],teams:Array.isArray(data.teams)?data.teams:[],team:data.team||'',at:data.snapshotAt||'',warning:data.rosterWarning||'',loading:false,error:''});
  }).catch(reason=>{if(!controller.signal.aborted)setCatalog({...empty(key),loading:false,error:reason.message});});
  return()=>controller.abort();
 },[key,retry]);
 const options=[...new Set([...selected,...active.options.map(o=>o.name)])].filter(name=>name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5">
  <details className="group"><summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-2 text-[10px] font-black uppercase text-[var(--text)]"><span className="flex items-center gap-2"><Users size={16} className="text-cyan-300"/>Ausencias de compañeros {selected.length?`(${selected.length})`:''}</span><ChevronDown size={16} className="shrink-0 group-open:rotate-180"/></summary>
   <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] p-1" role="group" aria-label="Compañeros actuales o históricos">
    {([{value:'current',label:'Equipo actual'},{value:'historical',label:'Históricos'}] as const).map(option=><button key={option.value} type="button" aria-pressed={scope===option.value} onClick={()=>{if(scope!==option.value)onScopeChange(option.value);}} className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${scope===option.value?'bg-cyan-400/15 text-cyan-300':'text-[var(--text-muted)]'}`}>{option.label}</button>)}
   </div>
   {scope==='current'&&active.team&&<p className="mt-2 text-[10px] text-cyan-300">Plantel {active.team}{active.at?` · actualizado ${active.at}`:''}</p>}
   {scope==='current'&&active.warning&&<p className="mt-1 text-[10px] text-amber-300">{active.warning}</p>}
   {scope==='historical'&&<label className="mt-2 block text-[10px] text-[var(--text-muted)]">Equipo del registro<select aria-label="Equipo del historial de ausencias" value={team} onChange={event=>onTeamChange(event.target.value)} className="ml-2 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-1"><option value="">Todos los equipos registrados</option>{active.teams.map(t=><option key={t} value={t}>{t}</option>)}</select></label>}
   <p className="my-2 text-[10px] text-[var(--text-muted)]">Seleccioná uno o más. Deben faltar todos a la vez.{scope==='current'?' Se usan únicamente registros del equipo actual.':' Se usan ausencias del historial y del equipo elegido.'}</p>
   <input aria-label="Buscar compañero ausente" placeholder="Buscar compañero…" value={query} onChange={event=>setQuery(event.target.value)} className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"/>
   {active.loading&&<p className="text-xs text-cyan-300">Cargando compañeros…</p>}
   {active.error&&<p className="text-xs text-amber-300">{active.error} <button type="button" onClick={()=>setRetry(n=>n+1)} className="underline">Reintentar</button></p>}
   <div className="max-h-36 space-y-1 overflow-auto">{options.map(name=>{const option=active.options.find(o=>o.name===name);return <label key={name} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-[11px] hover:bg-white/5"><input type="checkbox" checked={selected.includes(name)} disabled={active.loading||(!selected.includes(name)&&selected.length>=8)} onChange={()=>onChange(selected.includes(name)?selected.filter(n=>n!==name):[...selected,name])}/><span className="min-w-0 flex-1">{name}</span><small className="text-[9px] text-[var(--text-muted)]">{option?(option.hasRecords?'Con registros':'Sin registros confirmados'):'Revisar selección'}</small></label>;})}</div>
   {!active.loading&&!active.error&&!options.length&&<p className="text-xs text-[var(--text-muted)]">No hay compañeros para esta búsqueda y contexto.</p>}
   <details className="mt-2 text-[10px] text-[var(--text-muted)]"><summary className="cursor-pointer">Sobre estos datos</summary><p className="mt-1">Hasta 8 compañeros. El plantel actual es la referencia guardada de la aplicación. Sin registros no significa que el jugador estuviera disponible. Se cuentan ausencias confirmadas; estados desconocidos, dudosos y probables quedan fuera.</p></details>
  </details>
  {!!selected.length&&<div className="mt-2 flex flex-wrap gap-2">{selected.map(name=><button type="button" key={name} onClick={()=>onChange(selected.filter(n=>n!==name))} title={name} className="flex max-w-full items-center gap-1 rounded-lg border border-cyan-400/25 px-2 py-1 text-[10px] text-cyan-300" aria-label={`Quitar ausencia de ${name}`}><span className="min-w-0 truncate">{name}</span><X size={12} className="shrink-0"/></button>)}<button type="button" onClick={()=>onChange([])} className="text-xs text-[var(--text-muted)] underline">Quitar todas</button></div>}
  {loading&&<p className="mt-2 text-xs text-cyan-300">Buscando partidos con estas ausencias…</p>}
  {!loading&&!error&&emptyReason&&<p role="status" className="mt-2 text-xs text-amber-200">{emptyReason} No implica que el compañero haya estado disponible.</p>}
  {error&&<p className="mt-2 text-xs text-amber-300">{error} <button type="button" onClick={onRetry} className="underline">Reintentar</button></p>}
 </section>;
}
