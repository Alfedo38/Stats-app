'use client';
import {useState,type CSSProperties} from 'react';
import {UserRound} from 'lucide-react';
import {nbaLogo,nbaPortrait} from '@/lib/nbaVisuals';
import styles from './NbaVisual.module.css';

export function PlayerPortrait({id,name,size='small'}:{id?:string|number;name:string;size?:'small'|'card'|'hero'}){
 const src=nbaPortrait(id),[failed,setFailed]=useState<string|null>(null);
 return <span className={styles.portrait} data-size={size} aria-hidden="true">
  {src&&failed!==src?<img src={src} alt="" width={260} height={190} loading={size==='hero'?'eager':'lazy'} decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:<UserRound size={size==='hero'?38:24} strokeWidth={1.2}/>}
 </span>;
}
export function TeamLogo({team,size=36}:{team:string;size?:number}){
 const src=nbaLogo(team),[failed,setFailed]=useState<string|null>(null);
 return <span className={styles.logo} style={{width:size,height:size} as CSSProperties}>{src&&failed!==src?<img src={src} alt={team} width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:<span>{team}</span>}</span>;
}
