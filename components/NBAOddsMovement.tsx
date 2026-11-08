"use client";
import {useState} from 'react';
import {PRICE_BOOKS,normalizedEvent} from '@/lib/nbaOdds';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import type {MovementPoint,PriorPrice} from '@/lib/nbaOddsMovement';
type Props={player:string;date:string;away:string;home:string;line:number;market:string;scope:string;side:'over'|'under';selectedBook?:string|null;displayPrices?:Record<string,number|null>};
const price=(value:number)=>value.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function NBAOddsMovement(p:Props){
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(''),[retry,setRetry]=useState(0);
 const book=choice||p.selectedBook||'stake';
 const params=new URLSearchParams({player:p.player,date:p.date,game:normalizedEvent(p.away+'-'+p.home),line:String(p.line),market:p.market,scope:p.scope,side:p.side,book,retry:String(retry)});
 const q=useAnalysisQuery<{enabled:boolean;points:MovementPoint[];limited:boolean;conflicts:number;prior?:PriorPrice}>(open?'/api/nba-odds-movement?'+params:null,undefined,8000);
 const points=q.data?.points??[],first=points[0],last=points.at(-1);
 const displayed=p.displayPrices?.[book]??null,prior=q.data?.prior;
 const low=Math.min(...points.map(p=>p.price)),high=Math.max(...points.map(p=>p.price));
 const position=(p:MovementPoint)=>[14+252*points.indexOf(p)/Math.max(1,points.length-1),64-50*(p.price-low)/Math.max(.01,high-low)] as const;
 return <details className="mt-2 max-w-72 text-xs text-[var(--text-muted)]" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="cursor-pointer font-bold">Ver cambios de cuota</summary>
  <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
   <label className="flex items-center justify-between gap-2">{p.side==='over'?'Over':'Under'} {p.line.toLocaleString('es-AR')} · misma línea
    <select aria-label="Casa del historial de cuotas" className="rounded border border-[var(--border)] bg-[var(--surface)] p-1" value={book} onChange={e=>setChoice(e.target.value)}>{PRICE_BOOKS.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}</select>
   </label>
   {q.loading&&<p role="status">Consultando capturas…</p>}
   {q.error&&<p role="alert">{q.error} <button type="button" className="underline" onClick={()=>setRetry(v=>v+1)}>Reintentar</button></p>}
   {q.data&&!q.data.enabled&&<p>El registro de cambios todavía no está activado.</p>}
   {q.data?.enabled&&<>
    <div className="grid grid-cols-2 gap-2 rounded border border-[var(--border)] p-2">
     <div>Precio en ficha<strong className="mt-1 block text-[var(--text)]">{displayed===null?'S/D':price(displayed)}</strong></div>
     <div>Último previo registrado<strong className="mt-1 block text-[var(--text)]">{prior?.status==='ready'?price(prior.price):'S/D'}</strong></div>
    </div>
    <p>{prior?.status==='ready'?'Antes del horario programado, para la misma casa, línea y condición. No es cierre oficial.':prior?.status==='conflict'?'El último registro previo tiene precios inconsistentes.':prior?.status==='none'?'No hay un registro previo al horario programado para esta selección.':'La referencia previa requiere un partido iniciado y un horario verificado.'}</p>
   </>}
   {q.data?.enabled&&points.length<2&&<p>Todavía no hay dos precios registrados para esta línea, lado y casa.</p>}
   {points.length>=2&&last&&<>
    <p>{q.data?.limited?"Primera visible":"Primera registrada"} <strong>{price(first.price)}</strong> · Última registrada <strong>{price(last.price)}</strong></p>
    <svg viewBox="0 0 280 78" className="w-full" role="img" aria-label={`Precio observado: de ${price(first.price)} a ${price(last.price)}. Los registros se muestran del primero al último, en orden.`}>
     <path d="M14 64H266" fill="none" stroke="var(--border)"/>
     <polyline points={points.map(p=>position(p).join(',')).join(' ')} fill="none" stroke="#10b981" strokeWidth="2"/>
     {points.map(p=>{const [x,y]=position(p);return <circle key={p.at} cx={x} cy={y} r={3} fill="#10b981"><title>Registro {points.indexOf(p)+1} · {price(p.price)}</title></circle>;})}
    </svg>
    <details><summary className="cursor-pointer">Ver precios registrados</summary><ul>{points.map(p=><li key={p.at} className="flex justify-between gap-2"><span>Registro {points.indexOf(p)+1}</span><strong>{price(p.price)}</strong></li>)}</ul></details>
    <p>Solo cambios observados. No registra apertura ni cierre oficiales.</p>
   </>}
   {q.data?.limited&&<p>Se muestran las últimas 80 capturas verificadas.</p>}
   {!!q.data?.conflicts&&<p>Se omitieron capturas con precios contradictorios a la misma hora.</p>}
  </div>
 </details>;
}
