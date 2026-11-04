'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import styles from './PlayerPresentation.module.css';
const Presentation=createContext(false);
export function useCompactPlayer(){return useContext(Presentation);}
export default function PlayerPresentation({children,initialCompact=false}:{children:ReactNode;initialCompact?:boolean}){
 const [compact,setCompact]=useState(initialCompact);
 useEffect(()=>{const sync=()=>setCompact(new URLSearchParams(window.location.search).get('vista')!=='clasica');window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
 function choose(value:boolean){setCompact(value);const url=new URL(window.location.href);if(value)url.searchParams.set('vista','compacta');else url.searchParams.set('vista','clasica');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}
 return <Presentation.Provider value={compact}><div className={styles.presentation} data-player-view={compact?'compact':'classic'}>
  <div className={styles.viewChoice} role="group" aria-label="Presentación de la ficha"><span>Presentación</span><button type="button" aria-pressed={!compact} onClick={()=>choose(false)}>Clásica</button><button type="button" aria-pressed={compact} onClick={()=>choose(true)}>Compacta</button></div>
  {children}
 </div></Presentation.Provider>;
}
