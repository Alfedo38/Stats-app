import type {MarketSupport} from '@/lib/nbaMarketSupport';
import styles from './NbaResearch.module.css';
export default function NbaMarketSupport({support,label}:{support:MarketSupport;label:string}){
 if(!support.total)return null;
 const review=support.items.reduce((total,item)=>total+item.review,0);
 return <section className={styles.support} aria-label="Datos de apoyo">
  <h4>Datos de apoyo <small>· {label}</small></h4>
  <ul>{support.items.map(item=><li key={item.id}>
   <span>{item.label}</span>
   <strong>{item.average===null?'S/D':item.average.toLocaleString('es-AR',{maximumFractionDigits:1})}</strong>
   <small>{item.count}/{support.total} con dato · promedio</small>
  </li>)}</ul>
  {review>0&&<small>Potenciales dudosas excluidas del promedio: {review}.</small>}
 </section>;
}
