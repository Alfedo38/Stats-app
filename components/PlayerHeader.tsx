"use client";
import {useEffect,useState} from "react";
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {PlayerPortrait,TeamLogo} from './NbaMedia';
import {LEAGUE_TEAMS} from '@/lib/teams';
import styles from './NbaVisual.module.css';
export type PlayerKPI={label:string;value:string;trend?:number;trendLabel?:string;sample?:{label:string;count:number;total:number}};
export type NextGame={opponent:string;isHome:boolean;date:string;time?:string};
export type PlayerBioSummary={jerseyNumber?:string|number|null;position?:string|null;height?:string|null;weight?:string|null;age?:number|null;country?:string|null;school?:string|null};
type Props={playerName:string;playerId?:string|number;teamAbbr?:string;position?:string;kpis?:PlayerKPI[];nextGame?:NextGame;initials?:string;bio?:PlayerBioSummary|null};
export default function PlayerHeader({playerName,playerId,teamAbbr,position,nextGame,bio}:Props){
 const owner=String(playerId??''),[resolved,setResolved]=useState<{owner:string;game:NextGame|null}|null>(null);
 useEffect(()=>{const handler=(event:Event)=>{const detail=(event as CustomEvent).detail??{};if(String(detail.playerId)!==owner)return;const c=detail.context,own=teamAbbr?.toUpperCase();let game:NextGame|null=null;
  if(c&&own&&[c.away,c.home].includes(own)&&/^\d{4}-\d{2}-\d{2}$/.test(c.date)){const opponent=own===c.home?c.away:c.home;game={opponent,isHome:own===c.home,date:c.date};if(c.start&&Number.isFinite(Date.parse(c.start)))game.time=new Date(c.start).toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false});}
  setResolved(old=>JSON.stringify(old)==JSON.stringify({owner,game})?old:{owner,game});};window.addEventListener('player-dvp-context-change',handler);return()=>window.removeEventListener('player-dvp-context-change',handler);},[owner,teamAbbr]);
 const upcoming=resolved?.owner===owner?resolved.game:nextGame;
 const rival=LEAGUE_TEAMS.find(t=>t.id===upcoming?.opponent);
 return <header data-player-hero className={styles.hero}>
  <div className={styles.identity}><PlayerPortrait id={playerId} name={playerName} size="hero"/><div><h1>{playerName}</h1><p>{teamAbbr&&<><TeamLogo team={teamAbbr} size={22}/><Link href={`/teams/${teamAbbr}`}>{LEAGUE_TEAMS.find(t=>t.id===teamAbbr)?.name??teamAbbr}</Link></>}{position&&<span>· {position}</span>}{bio?.jerseyNumber&&<span>· #{bio.jerseyNumber}</span>}</p></div></div>
  {upcoming&&<section data-next-game className={styles.next}><p>Próximo partido</p><Link href={`/teams/${upcoming.opponent}`}><TeamLogo team={upcoming.opponent} size={42}/><div><strong>{upcoming.isHome?'Recibe a':'Visita a'} {rival?.name??upcoming.opponent}</strong><small>{upcoming.date.split('-').reverse().join('/')}{upcoming.time?` · ${upcoming.time} ARG`:''}</small></div><ArrowUpRight size={15}/></Link></section>}
  {bio&&Object.values(bio).some(Boolean)&&<details className={styles.bio}><summary>Datos del jugador</summary><div>{[['Altura',bio.height],['Peso',bio.weight],['Edad',bio.age?`${bio.age} años`:null],['País',bio.country],['Origen',bio.school]].filter(([,value])=>value).map(([label,value])=><span key={String(label)}>{label}: <strong>{value}</strong></span>)}</div></details>}
 </header>;
}
