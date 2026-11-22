'use client';
import Link from 'next/link';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {useJornadaInjuryImpact} from '@/hooks/useJornadaInjuryImpact';
import JornadaAbsenceImpact from './JornadaAbsenceImpact';
import NbaMatchupFavorabilityCard from './NbaMatchupFavorabilityCard';
import {marketIsValid} from '@/lib/nbaJornada';
import {impactPlayerKey} from '@/lib/jornadaAbsenceImpact';
import {INJURY_LABELS,injuryEditionLabel,reportTimeLabel,type InjuryReport} from '@/lib/injuryReport';
import type {GameContext} from '@/lib/playerNavigation';
import type {expectedMinutes} from '@/lib/minutesResearch';
import type {RivalSelection} from '@/lib/rivalSelection';
import type {TeamMatchupPreview} from '@/lib/nbaMatchupPreview';
import {LEAGUE_TEAMS} from '@/lib/teams';
import styles from './NbaNextMatchup.module.css';
type Preview={ok:true;available:boolean;gameId?:string;teams:TeamMatchupPreview[];season?:string};
const number=(n:number|null|undefined)=>n==null?'S/D':n.toLocaleString('es-AR',{maximumFractionDigits:1});
export default function NbaNextMatchup({context,team,playerId,market='pts',scope='FULL',rivalHistory,onFilterRival,minuteGuide,onApplyAbsences}:{context:GameContext|null;team?:string|null;playerId?:string|number;market?:string;scope?:string;rivalHistory?:RivalSelection|null;onFilterRival?:()=>void;minuteGuide?:ReturnType<typeof expectedMinutes>|null;onApplyAbsences?:(names:string[])=>void}){
 const query=useAnalysisQuery<Preview>(context?'/api/nba-matchup-preview?'+new URLSearchParams({away:context.away,home:context.home,date:context.date}):null,undefined,12000);
 const report=useAnalysisQuery<InjuryReport>(context?'/api/injury-report?date='+context.date:null,undefined,15000);
 const data=query.data,gameId=data?.available?data.gameId:undefined,id=Number(playerId);
 const supported=marketIsValid(market),targets=gameId&&Number.isSafeInteger(id)&&id>0&&supported&&scope==='FULL'?[{playerId:id,gameId:gameId.padStart(10,'0')}]:[];
 const impacts=useJornadaInjuryImpact(context?.date??'',supported?market:'pts',false,targets);
 const impact=targets[0]?impacts.results[impactPlayerKey(targets[0])]:null;
 if(!context)return null;
 const opponent=team===context.home?context.away:team===context.away?context.home:null;
 const injuries=(report.data?.items??[]).filter(i=>i.date===context.date&&[context.away,context.home].includes(i.team)&&i.game&&i.game.id.replace(/^0+/,'')===gameId?.replace(/^0+/,'')&&i.status!=='AVAILABLE');
 const rival=LEAGUE_TEAMS.find(t=>t.id===opponent)?.name??opponent;
 const editions=(report.data?.editions??[]).filter(e=>e.date===context.date&&e.game.away===context.away&&e.game.home===context.home);
 const consecutive=(data?.teams??[]).filter(t=>t.backToBack===true).map(t=>t.team).join(' y ');
 return <section className={styles.card} aria-label="Partido y contexto">
  <header className="mosk-next-rival">
    <div><h2>Qué cambia hoy</h2>{opponent?<Link className={styles.link} href={`/teams/${opponent}`}>{team===context.home?'vs.':'@'} {rival}</Link>:<span>{context.away} – {context.home}</span>}{consecutive&&<small className="mosk-rest-note">{consecutive}: segundo partido seguido</small>}</div>
  </header>
  {scope==='FULL'&&Number.isSafeInteger(id)&&id>0&&<NbaMatchupFavorabilityCard context={context} playerId={id} market={market} injuries={report.data}/>}
  {opponent&&rivalHistory&&rivalHistory.valid>0&&<section className="mosk-rival-history" aria-label={`Historial contra ${opponent}`}>
    <div><strong>Últimos vs. {opponent}</strong>{onFilterRival&&<button type="button" onClick={onFilterRival} className="mosk-text-link">Ver en gráfico</button>}</div>
    {rivalHistory.decided>0&&<span>{rivalHistory.hits} de {rivalHistory.decided} {rivalHistory.side==='over'?'superaron':'quedaron por debajo de'} {number(rivalHistory.line)}</span>}
    <small>Promedio: {number(rivalHistory.average)} · {rivalHistory.valid} {rivalHistory.valid===1?'partido con dato':'partidos con datos'}{rivalHistory.pushes>0?` · ${rivalHistory.pushes} en la línea`:''}</small>
  </section>}
  {minuteGuide&&minuteGuide.history.count>=5&&impact?.status!=='player_out'&&<details className={styles.details}>
   <summary>{minuteGuide.estimate!==null&&impact?.status==='none'?`${number(minuteGuide.estimate)} min estimados`:`${number(minuteGuide.history.median)} min de referencia`}</summary>
   <p>Mediana de los últimos {minuteGuide.history.count} partidos con el equipo. {minuteGuide.history.typical?`La mitad central jugó ${number(minuteGuide.history.typical[0])}–${number(minuteGuide.history.typical[1])} min.`:''}</p>
   {minuteGuide.estimate!==null&&impact?.status==='none'?<p>Comparación retrospectiva: error medio de {number(minuteGuide.tested)} min frente a {number(minuteGuide.baseline)} de la mediana reciente, en {minuteGuide.observations} partidos.</p>:<p>Para una baja confirmada, revisá debajo los minutos observados sin ese compañero. La referencia no aplica un ajuste automático.</p>}
  </details>}
  <details className={styles.details}><summary>Ritmo y descanso</summary>{query.loading?<p role="status">Consultando últimos partidos…</p>:query.error?<p role="status">El contexto del equipo no está disponible.</p>:data?.available?<><div className={styles.teamStats}>{data.teams.map(row=><div key={row.team}><b>{row.team}</b><dl><dt>Posesiones estimadas</dt><dd>{number(row.possessions)}</dd><dt>Partidos con dato</dt><dd>{row.paceGames}/{row.games}</dd><dt>Descanso</dt><dd>{row.backToBack===true?'Consecutivo':row.restDays===null?'S/D':`${row.restDays} ${row.restDays===1?"día":"días"}`}</dd></dl></div>)}</div><p>Últimos 10 de {data.season}. Posesiones estimadas por partido; no es ritmo ajustado a 48 minutos. Descanso desde el último partido registrado.</p></>:<p>Falta confirmar el partido en el calendario.</p>}</details>
  <details className={styles.details}><summary>Parte oficial{injuries.length?` · ${injuries.length}`:''}</summary>
   {report.loading?<p role="status">Consultando el parte médico…</p>:report.error||!report.data?.available?<p>Parte médico no disponible.</p>:<>
    <ul>{[context.away,context.home].map(t=>{const e=editions.find(x=>x.team===t);return <li key={t}><strong>{t}</strong><span title={e?reportTimeLabel(e.reportAt):undefined}>{e?injuryEditionLabel(e):injuries.some(i=>i.team===t)?'Estados guardados':'Sin parte verificado'}{e?.stale?' · Revisar vigencia':''}</span></li>;})}</ul>
    {!!injuries.length&&<ul>{injuries.map(i=><li key={i.id}><Link href={i.playerId?`/players/${i.playerId}`:`/injuries?date=${context.date}&team=${i.team}`}>{i.name}</Link><span>{i.team} · {INJURY_LABELS[i.status]}{i.stale||i.conflict||report.data?.stale?' · Revisar vigencia':''}</span></li>)}</ul>}
   </>}<Link className={styles.link} href={`/injuries?date=${context.date}`}>Ver parte completo →</Link>
  </details>
  {supported&&scope==='FULL'&&targets.length>0&&<details className={styles.details}><summary>Si falta un compañero</summary>{impacts.loading?<p role="status">Comparando bajas confirmadas…</p>:impacts.error||impact?.status==='unavailable'?<p>La comparación histórica no está disponible.</p>:impact?.status==='player_out'?<p>Este jugador figura fuera del partido.</p>:impact?.items.length?<><JornadaAbsenceImpact data={impact} market={market} onApplyAbsences={onApplyAbsences}/><p>Promedios históricos con y sin el compañero. No son minutos ni producción garantizados para este partido.</p></>:<p>No hay una baja confirmada con muestra comparable. Podés explorar escenarios en el filtro de ausencias.</p>}</details>}
 </section>;
}
