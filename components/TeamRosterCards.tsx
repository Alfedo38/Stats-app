'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {PlayerPortrait} from './NbaMedia';
import MatchupPlayerTable from './MatchupPlayerTable';
import {playerGameHref,type GameContext} from '@/lib/playerNavigation';
import type {PlayerAverage} from '@/lib/matchupData';
import type {InjuryItem} from '@/lib/injuryReport';
import {INJURY_LABELS} from '@/lib/injuryReport';
import styles from './NbaVisual.module.css';
type Player={player_id:number;full_name:string;position:string|null};
const number=(n:number|null|undefined)=>n==null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:1});
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export default function TeamRosterCards({team,roster,averages,season,gameContext,injuries=[],referenceAt,unavailable=false}:{team:string;roster:Player[];averages:PlayerAverage[];season:string;gameContext?:GameContext;injuries?:InjuryItem[];referenceAt:string;unavailable?:boolean}){
 const [query,setQuery]=useState(''),[sort,setSort]=useState<'min'|'pts'|'reb'|'ast'>('min');
 const lookup=useMemo(()=>new Map(averages.map(p=>[p.player_id,p])),[averages]);
 const players=roster.filter(p=>normalize(p.full_name).includes(normalize(query))).sort((a,b)=>(lookup.get(b.player_id)?.[sort]??-1)-(lookup.get(a.player_id)?.[sort]??-1)||a.full_name.localeCompare(b.full_name));
 return <section className={styles.roster}>
  <header className={styles.rosterHeading}><div><h2>Jugadores de {team} <span style={{color:'var(--text-muted)',fontWeight:450}}>· {roster.length}</span></h2><p>Promedios por partido · {season} · regular y playoffs · con este equipo</p></div><div className={styles.tools}><label><span className="sr-only">Buscar jugador</span><input type="search" placeholder="Buscar jugador…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label><span className="sr-only">Ordenar jugadores</span><select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="min">Más minutos</option><option value="pts">Más puntos</option><option value="reb">Más rebotes</option><option value="ast">Más asistencias</option></select></label></div></header>
  {unavailable&&<p role="status" className={styles.empty}>No pudimos consultar los promedios. El plantel sigue disponible; las cifras no se sustituyeron por cero.</p>}
  <div className={styles.cards}>{players.map(p=>{const a=lookup.get(p.player_id),href=gameContext?playerGameHref(p.player_id,gameContext):`/players/${p.player_id}`,injury=injuries.find(i=>i.playerId===p.player_id&&!i.stale&&!i.conflict&&i.status!=='AVAILABLE');return <article key={p.player_id} className={styles.card}><div className={styles.cardHeader}><Link href={href} tabIndex={-1} aria-hidden="true"><PlayerPortrait id={p.player_id} name={p.full_name} size="card"/></Link><div><h3><Link href={href}>{p.full_name}</Link></h3><p>{team} · {p.position||'Posición sin registrar'}</p>{injury&&<span className={styles.status}>{INJURY_LABELS[injury.status]}</span>}</div></div><dl className={styles.stats}>{([['min','MIN'],['pts','PTS'],['reb','REB'],['ast','AST']] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{number(a?.[key])}</dd></div>)}</dl><footer className={styles.cardFoot}><span>{a?.gp?`${a.gp} partidos con dato`:'Sin partidos con dato'}</span><Link href={href}>Analizar jugador <ArrowUpRight size={14}/></Link></footer></article>;})}</div>
  {!players.length&&<p className={styles.empty}>{roster.length?'No encontramos jugadores con ese nombre.':'No hay un plantel de referencia para este equipo.'}</p>}
  <details className={styles.tableToggle}><summary>Sobre el plantel</summary><p className={styles.reference}>Plantel de referencia del {referenceAt.split('-').reverse().join('/')}. Pertenecer al plantel no confirma disponibilidad.</p></details>
  <details className={styles.tableToggle}><summary>Ver todas las estadísticas del plantel</summary><div><MatchupPlayerTable team={team} roster={roster} averages={averages} season={season} gameContext={gameContext} injuries={injuries}/></div></details>
 </section>;
}
