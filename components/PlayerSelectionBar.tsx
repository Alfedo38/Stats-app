'use client';
import type {ReactNode} from 'react';
import {Minus,Plus} from 'lucide-react';
import {playerMarketLabel,PLAYER_SCOPE_LABELS} from '@/lib/playerPresentation';

type Props={market:string;markets:{id:string;label:string}[];scope:string;lastN:number;side:'over'|'under';line:number;onMarket:(value:string)=>void;onScope:(value:string)=>void;onWindow:(value:number)=>void;onSide:(value:'over'|'under')=>void;onLine:(value:number)=>void;onStep:(direction:-1|1)=>void;odds:ReactNode;halfLines?:boolean};
export default function PlayerSelectionBar(p:Props){
 const min=p.halfLines===false?0:.5,max=p.halfLines===false?300:299.5;
 return <section className="mosk-selection" aria-label="Selección del jugador">
  <label>Estadística<select aria-label="Estadística de la selección" value={p.market} onChange={e=>p.onMarket(e.target.value)}>{p.markets.map(m=><option key={m.id} value={m.id}>{playerMarketLabel(m.id)}</option>)}</select></label>
  <div className="mosk-line-field"><span>Línea</span>
    <div className="mosk-line-controls">
      <div role="group" className="mosk-segment" aria-label="Lado de la selección">{(['over','under'] as const).map(side=><button key={side} type="button" aria-pressed={p.side===side} onClick={()=>p.onSide(side)}>{side==='over'?'Más':'Menos'}</button>)}</div>
      <div className="mosk-stepper">
        <button type="button" onClick={()=>p.onStep(-1)} disabled={p.line<=min} aria-label="Bajar línea"><Minus size={15} aria-hidden/></button>
        <input aria-label="Línea de la selección" type="number" min={min} max={max} step={1} value={p.line} onBlur={()=>p.onLine(Math.max(min,Math.min(max,p.halfLines===false?Math.round(p.line):Math.floor(p.line)+.5)))} onChange={e=>{const value=e.target.valueAsNumber;if(Number.isFinite(value)&&value>=0&&value<=300)p.onLine(value);}} />
        <button type="button" onClick={()=>p.onStep(1)} disabled={p.line>=max} aria-label="Subir línea"><Plus size={15} aria-hidden/></button>
      </div>
    </div>
  </div>
  <div><span>Muestra</span><div className="mosk-segment" role="group" aria-label="Muestra de la selección">{[5,10,20,30].map(n=><button type="button" key={n} aria-pressed={p.lastN===n} onClick={()=>p.onWindow(n)}>L{n}</button>)}</div></div>
  <label>Período<select aria-label="Período de la selección" value={p.scope} onChange={e=>p.onScope(e.target.value)}>{Object.entries(PLAYER_SCOPE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <div className="mosk-selection-odds"><span>Cuotas</span>{p.odds}</div>
 </section>;
}
