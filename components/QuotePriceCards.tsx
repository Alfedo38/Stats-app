'use client';
import styles from './QuotePriceCards.module.css';
export type QuoteCard={key:string;label:string;price:number|null};
export default function QuotePriceCards({cards,label,loading=false,selectedBook,onSelectBook,bestPrice}:{cards:QuoteCard[];label:string;loading?:boolean;selectedBook?:string|null;onSelectBook?:(book:string|null)=>void;bestPrice?:number|null}){
 return <div className={styles.cards} role="group" aria-label={label}>
  {cards.map(card=>{
   const value=card.price!==null&&Number.isFinite(card.price)&&card.price>1?card.price:null;
   const price=value===null?'—':value.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
   const content=<><span>{card.label}</span><strong>{loading?'…':price}</strong></>;
   const selected=value!==null&&selectedBook===card.key;
   return onSelectBook?<button type="button" key={card.key} className={styles.card} disabled={value===null||loading} aria-pressed={selected}
    aria-label={`${card.label}: ${value===null?'sin cuota disponible':`cuota ${price}`}`} data-best={value!==null&&value===bestPrice}
    onClick={()=>onSelectBook(selected?null:card.key)}>{content}</button>:
    <div key={card.key} className={styles.card} aria-label={`${card.label}: ${value===null?'sin cuota disponible':`cuota ${price}`}`} data-best={value!==null&&value===bestPrice}>{content}</div>;
  })}
 </div>;
}
