'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Plus,ArrowRight} from 'lucide-react';
import {argentinaDate,isDate,type Leg} from '@/lib/ticketReader/model';
import {appendDraft,readDraft,draftKey} from '@/lib/ticketReader/draft';
import {selectionFromPage,eventFromQuotes,safePlayerHref,matchupHref,PAGE_MARKETS,type GameContext} from '@/lib/playerNavigation';
import type {PageSample} from '@/lib/playerSample';
import type {PriceQuote} from '@/lib/nbaOdds';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {type PlayerEventState} from '@/hooks/usePlayerEvent';
import ShareButton from './ShareButton';
import PlayerEventControl from './PlayerEventControl';
import type {PlayerGameChoices} from './AnalyzerGameChoice';
type Props={storageKey:string;playerId:string|number;playerName:string;team?:string|null;stat:string;scope:Leg['scope'];side:'over'|'under';line:number;context:GameContext|null;quotes:PriceQuote[];book:string|null;pageSample?:PageSample;samplePending?:boolean;managedEvent?:PlayerEventState;onShare?:()=>Promise<boolean>};
export default function AddSelectionToAnalyzer(props:Props){
 const managed=props.managedEvent;
 const inferred=managed?managed.context:props.context??eventFromQuotes(props.quotes);
 const [date,setDate]=useState(''),[count,setCount]=useState(0),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[choice,setChoice]=useState<{key:string;id:string}|null>(null);
 const current=useRef(props);current.current=props;
 useEffect(()=>{setDate(argentinaDate());const update=()=>{try{setCount(readDraft(localStorage,props.storageKey)?.document.legs.length??0);}catch{}};update();window.addEventListener('nba-ticket-draft',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('nba-ticket-draft',update);window.removeEventListener('storage',update);};},[props.storageKey]);
 const query=useAnalysisQuery<PlayerGameChoices>(!managed&&!inferred&&isDate(date)?`/api/ticket-reader/context?playerId=${props.playerId}&date=${date}`:null);
 const data=query.data,key=`${props.playerId}:${date}`;
 const game=data?.verified?(choice?.key===key?data.games.find(g=>g.id===choice.id):data.games.length===1?data.games[0]:undefined):undefined;
 const context=managed?managed.context:inferred??(game?{away:game.away,home:game.home,date,returnTo:matchupHref(game.away,game.home,date)}:null);
 const identity=JSON.stringify([props.playerId,props.stat,props.scope,props.side,props.line,context?.date,context?.away,context?.home,props.book]);
 useEffect(()=>setMessage(''),[identity]);
 async function add(){setSaving(true);setMessage('');const selected=current.current;
  try{
   const leg={...selectionFromPage({...selected,context,date:context?.date??managed?.date??date}),pageSample:selected.pageSample};
   const back=new URLSearchParams(window.location.search);back.set('stat',selected.stat);back.set('line',String(selected.line));back.set('scope',selected.scope);back.set('side',selected.side);if(context){back.set('game',context.away+'-'+context.home);back.set('date',context.date);if(context.start)back.set('start',context.start);back.set('from',context.returnTo);}
   const returnHref=safePlayerHref(window.location.pathname+'?'+back);
   const write=()=>appendDraft(localStorage,selected.storageKey,leg,returnHref);
   const saved=typeof navigator.locks?.request==='function'?await navigator.locks.request(draftKey(selected.storageKey),write):write();
   setCount(saved.draft.document.legs.length);setMessage(saved.duplicate?'La selección ya estaba en el borrador; quedó actualizada.':`Selección agregada · ${saved.draft.document.legs.length} en el borrador.`);window.dispatchEvent(new Event('nba-ticket-draft'));
  }catch(error){const code=(error as Error).message;setMessage(code==='DRAFT_DATE_CONFLICT'?'El borrador corresponde a otra fecha. Abrí el analizador para revisarlo o iniciar uno nuevo.':code==='DRAFT_FULL'?'El borrador admite hasta 40 selecciones.':code==='DRAFT_CONFLICT'?'El borrador cambió en otra pestaña. Volvé a agregar la selección.':'No se pudo guardar el borrador. Revisá la selección y el almacenamiento del navegador.');}
  finally{setSaving(false);}
 }
 if(!PAGE_MARKETS[props.stat])return null;
 return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#10b981]/25 bg-[var(--surface)] px-3 py-3">
  {managed?<PlayerEventControl event={managed}/>:inferred?<span className="text-[10px] font-bold text-[var(--text-muted)]">{inferred.away} – {inferred.home} · {inferred.date.split('-').reverse().join('/')}</span>:<>
   <label className="text-[10px] text-[var(--text-muted)]">Fecha <input aria-label="Fecha para agregar selección" type="date" value={date} onChange={e=>{setDate(e.target.value);setChoice(null);}} className="ml-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1" /></label>
   {!!data?.games.length&&<select aria-label="Partido para agregar selección" value={game?.id??(choice?.key===key?choice.id:'')} onChange={e=>setChoice({key,id:e.target.value})} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px]"><option value="">Elegir partido</option>{data.games.map(g=><option key={g.id} value={g.id}>{g.away} – {g.home}</option>)}</select>}
   <span className="text-[10px] text-[var(--text-muted)]">{query.loading?'Buscando partido…':game?`${game.away} – ${game.home}`:'Partido por completar en el analizador'}</span>
  </>}
  <button type="button" disabled={saving||props.samplePending||!isDate(context?.date??managed?.date??date)} onClick={()=>void add()} className="inline-flex items-center gap-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/10 px-3 py-2 text-[10px] font-black text-[#10b981] disabled:opacity-50"><Plus size={13}/>{saving?'Guardando…':'Agregar al analizador'}</button>
  <Link href="/analizar-ticket" className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--text-muted)] hover:text-[#10b981]">Abrir analizador{count?` (${count})`:''}<ArrowRight size={12}/></Link>
  {props.onShare&&<span className="ml-auto"><ShareButton onShare={props.onShare}/></span>}
  {!!message&&<span className="basis-full text-xs text-[var(--text-muted)]" role="status">{message}</span>}
 </div>;
}
