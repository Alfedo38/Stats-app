'use client';
import type {ReactNode} from 'react';
import {playerMarketLabel,PLAYER_SCOPE_LABELS} from '@/lib/playerPresentation';
import styles from './PlayerPresentation.module.css';
type Props={market:string;markets:{id:string;label:string}[];scope:string;lastN:number;side:'over'|'under';line:number;step:number|string;onMarket:(value:string)=>void;onScope:(value:string)=>void;onWindow:(value:number)=>void;onSide:(value:'over'|'under')=>void;onLine:(value:number)=>void;odds:ReactNode};
export default function PlayerSelectionBar(p:Props){
 return <section className={styles.selectionBar} aria-label="Selección del jugador">
  <label className={styles.marketChoice}>Estadística<select aria-label="Estadística de la selección" value={p.market} onChange={e=>p.onMarket(e.target.value)}>{p.markets.map(m=><option key={m.id} value={m.id}>{playerMarketLabel(m.id)}</option>)}</select></label>
  <label>Período<select aria-label="Período de la selección" value={p.scope} onChange={e=>p.onScope(e.target.value)}>{Object.entries(PLAYER_SCOPE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <div><span>Muestra</span><div className={styles.sampleShortcuts} role="group" aria-label="Muestra de la selección">{[5,10,20,30].map(n=><button type="button" key={n} aria-pressed={p.lastN===n} onClick={()=>p.onWindow(n)}>L{n}</button>)}</div></div>
  <div className={styles.lineChoice}><div role="group" aria-label="Lado de la selección">{(['over','under'] as const).map(side=><button key={side} type="button" aria-pressed={p.side===side} onClick={()=>p.onSide(side)}>{side==='over'?'Más de':'Menos de'}</button>)}</div><label>Línea<input aria-label="Línea de la selección" type="number" min="0" max="300" step={p.step} value={p.line} onChange={e=>{const value=e.target.valueAsNumber;if(Number.isFinite(value)&&value>=0&&value<=300)p.onLine(value);}}/></label></div>
  <div className={styles.barOdds}><span>Cuota individual</span>{p.odds}</div>
 </section>;
}
