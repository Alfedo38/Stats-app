"use client";
import {useEffect,useState} from 'react';
import {ChevronDown,Users,X} from 'lucide-react';
export default function PlayerAbsenceFilter({playerId,selected,onChange,loading,error,onRetry}:{playerId:string;selected:string[];onChange:(names:string[])=>void;loading:boolean;error:string|null;onRetry:()=>void}){
 const [names,setNames]=useState<string[]>([]),[query,setQuery]=useState(''),[catalogLoading,setCatalogLoading]=useState(false),[catalogError,setCatalogError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setNames([]);setCatalogError('');setCatalogLoading(true);
  fetch(`/api/player-absence?playerId=${encodeURIComponent(playerId)}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'No se pudo cargar el catálogo');if(!controller.signal.aborted)setNames(Array.isArray(data.names)?data.names:[]);}).catch(reason=>{if(!controller.signal.aborted)setCatalogError(reason.message);}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});
  return()=>controller.abort();
 },[playerId,retry]);
 const options=[...new Set([...selected,...names])].filter(name=>name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5">
  <details className="group"><summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-2 text-[10px] font-black uppercase text-[var(--text)]"><span className="flex items-center gap-2"><Users size={16} className="text-cyan-300"/>Ausencias de compañeros {selected.length?`(${selected.length})`:''}</span><ChevronDown size={16} className="shrink-0 group-open:rotate-180"/></summary>
   <p className="my-2 text-[10px] text-[var(--text-muted)]">Seleccioná uno o más. Deben faltar todos a la vez.</p>
   <input aria-label="Buscar compañero ausente" placeholder="Buscar compañero…" value={query} onChange={event=>setQuery(event.target.value)} className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"/>
   {catalogLoading&&<p className="text-xs text-cyan-300">Cargando compañeros…</p>}
   {catalogError&&<p className="text-xs text-amber-300">{catalogError} <button type="button" onClick={()=>setRetry(n=>n+1)} className="underline">Reintentar</button></p>}
   <div className="max-h-36 space-y-1 overflow-auto">{options.map(name=><label key={name} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-[11px] hover:bg-white/5"><input type="checkbox" checked={selected.includes(name)} disabled={!selected.includes(name)&&selected.length>=8} onChange={()=>onChange(selected.includes(name)?selected.filter(n=>n!==name):[...selected,name])}/>{name}</label>)}</div>
   {!catalogLoading&&!catalogError&&!options.length&&<p className="text-xs text-[var(--text-muted)]">No hay compañeros con ausencias registradas para esta búsqueda.</p>}
   <details className="mt-2 text-[10px] text-[var(--text-muted)]"><summary className="cursor-pointer">Sobre estos datos</summary><p className="mt-1">Hasta 8 compañeros. No jugar no significa necesariamente lesión. Se usan ausencias registradas; los estados desconocidos no se cuentan.</p></details>
  </details>
  {!!selected.length&&<div className="mt-2 flex flex-wrap gap-2">{selected.map(name=><button type="button" key={name} onClick={()=>onChange(selected.filter(n=>n!==name))} title={name} className="flex max-w-full items-center gap-1 rounded-lg border border-cyan-400/25 px-2 py-1 text-[10px] text-cyan-300" aria-label={`Quitar ausencia de ${name}`}><span className="min-w-0 truncate">{name}</span><X size={12} className="shrink-0"/></button>)}<button type="button" onClick={()=>onChange([])} className="text-xs text-[var(--text-muted)] underline">Quitar todas</button></div>}
  {loading&&<p className="mt-2 text-xs text-cyan-300">Buscando partidos con estas ausencias…</p>}
  {error&&<p className="mt-2 text-xs text-amber-300">{error} <button type="button" onClick={onRetry} className="underline">Reintentar</button></p>}
 </section>;
}
