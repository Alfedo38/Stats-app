"use client";
import {createContext,useContext,type ReactNode} from 'react';
import styles from './PlayerPresentation.module.css';
const Presentation=createContext(false);
export function useCompactPlayer(){return useContext(Presentation);}
/** Advanced presentation only; old ?vista= links keep working. */
export default function PlayerPresentation({children}:{children:ReactNode;initialCompact?:boolean}){
 return <Presentation.Provider value={false}><div className={styles.presentation} data-player-view="advanced">{children}</div></Presentation.Provider>;
}
