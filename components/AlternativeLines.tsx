'use client';
import {useState} from 'react';
import {oddsBook,PRICE_BOOKS,priceAt,type PriceQuote} from '@/lib/nbaOdds';
import {selectionSummary} from '@/lib/selectionStats';
import styles from './NbaResearch.module.css';

const number=(n:number)=>n.toLocaleString('es-AR',{maximumFractionDigits:2});
const priceText=(n:number)=>n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
type Props={quotes:PriceQuote[];values:unknown[];line:number|null;book:string|null;side:'over'|'under';bookFilter?:string;historyLabel:string;onSelect:(line:number,book:string|null)=>void};

export default function AlternativeLines({quotes,values,line,book,side,bookFilter='all',historyLabel,onSelect}:Props){
 const [open,setOpen]=useState(false);
 const grouped=new Map<number,PriceQuote[]>();
 for(const q of quotes){
  const n=q.line;
  if(n===null||!Number.isInteger(n-.5)||n<.5||n>299.5||!oddsBook(q.book))continue;
  const list=grouped.get(n)??[];list.push(q);grouped.set(n,list);
 }
 const lines=[...grouped.keys()].filter(n=>PRICE_BOOKS.some(b=>(bookFilter==='all'||bookFilter===b.key)&&priceAt(grouped.get(n)!,b.key,n,side))).sort((a,b)=>a-b);
 if(!lines.some(n=>n!==line))return null;
 return <details className={styles.disclosure} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>Comparar líneas y cuotas <small>· {lines.length} disponibles</small></summary>
  {open&&<div className={styles.detail}>
   <p>{side==='over'?'Más de':'Menos de'} · Elegí una línea o el precio de una casa.</p>
   <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Comparación de líneas y cuotas">
    <table className={styles.table}>
     <thead><tr><th scope="col">Línea</th>{PRICE_BOOKS.map(b=><th scope="col" key={b.key}>{b.label}</th>)}<th scope="col">Aciertos {historyLabel}</th></tr></thead>
     <tbody>{lines.map(n=>{
      const stat=selectionSummary(values,n,side),prices=PRICE_BOOKS.map(b=>priceAt(grouped.get(n)!,b.key,n,side)?.price??null);
      const count=prices.filter(v=>v!==null).length,best=count>1?Math.max(...prices.map(v=>v??0)):null;
      return <tr key={n} data-selected={n===line}>
       <th scope="row"><button type="button" aria-pressed={n===line} aria-label={`Elegir línea ${number(n)}`} onClick={()=>onSelect(n,null)}>{number(n)}</button></th>
       {PRICE_BOOKS.map((b,i)=>{const price=prices[i];return <td key={b.key}>{price===null?'—':bookFilter!=='all'&&b.key!==bookFilter?priceText(price):<button type="button" data-best={price===best} aria-pressed={n===line&&b.key===book} aria-label={`${b.label}: ${priceText(price)}, línea ${number(n)}`} onClick={()=>onSelect(n,b.key)}>{priceText(price)}</button>}</td>;})}
       <td>{stat.decided?<><strong>{stat.hits}/{stat.decided}</strong>{stat.decided>=5&&<small> · {Math.round(stat.rate!)}%</small>}</>:'S/D'}</td>
      </tr>;
     })}</tbody>
    </table>
   </div>
   <small>{values.length?(`Mismos ${values.length} partidos por fila. Verde: mejor cuota para esa línea.`):'Sin muestra histórica disponible. Verde: mejor cuota para esa línea.'}</small>
  </div>}
 </details>;
}
