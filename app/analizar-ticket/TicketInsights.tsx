import type {Leg,Result,TicketDocument} from '@/lib/ticketReader/model';
import type {AnalysisEntry} from '@/lib/ticketReader/analysisSnapshot';
import {assessSelection,assessTicket,medicalLabel} from '@/lib/ticketReader/ticketAssessment';
import s from './reader.module.css';

const fmt=(value:number|null,d=1)=>value===null?'S/D':value.toLocaleString('es-AR',{maximumFractionDigits:d});
const positions={ALL:'todas las posiciones',G:'bases / escoltas',F:'aleros / ala-pívots',C:'pívots'};
const relations={DUPLICATE:'Selecciones equivalentes',INCOMPATIBLE:'No pueden acertarse juntas',OVERLAPPING_MARKETS:'Mercados que comparten estadísticas',SAME_PLAYER:'Mismo jugador: resultados relacionados',MULTIPLE_EVENTS:'Mismo jugador en distintos partidos: revisar'};

export function SelectionInsight({leg,result}:{leg:Leg;result:Result}){
 const a=assessSelection(leg,result),context=a.context,d=context?.defense,reference=d?.reference,medical=context?.injuries;
 const factors=[a.support[0],a.concerns[0]].filter(Boolean);
 return <section className={s.selectionInsight} aria-label="Lectura y contexto de la selección">
  <div className={s.contextTiles}>
   <div><span>MIN. PARTIDO · L5</span><strong>{fmt(a.minutes.last5.average)}</strong><small>{a.minutes.last5.valid}/{a.minutes.last5.total} con dato</small></div>
   <div><span>DEFENSA · {context?.opponent??'RIVAL'}</span><strong>{reference?.rank?`${reference.rank} / ${reference.rankedTeams}`:'S/D'}</strong><small>{reference?`${reference.season} · ${reference.games} PJ${d?.usesPrevious?' · anterior':''}`:'Sin referencia comparable'}</small></div>
   <div><span>ESTADO MÉDICO</span><strong>{medical?.player?medicalLabel(medical.player.state):medical?.status==='historical'?'Fecha pasada':'Sin confirmar'}</strong><small>{medical?.player?.stale?'Parte anterior: revisar':medical?.player?.reportDate?`Parte ${medical.player.reportDate.split('-').reverse().join('/')}`:'Sin estado verificado para el partido'}</small></div>
  </div>
  {!!factors.length&&<div className={s.factorPreview}>{factors.map(f=><p key={f.code} data-kind={a.support.includes(f)?'support':'review'}><strong>{a.support.includes(f)?'A favor':'A revisar'}</strong> {f.text}</p>)}</div>}
  <details className={s.resultDetail}><summary>Por qué aparece esta lectura · contexto y límites</summary>
   <div className={s.evidenceColumns}>{[{title:'Señales a favor',items:a.support},{title:'Puntos a revisar',items:a.concerns}].map(group=><div key={group.title}><h4>{group.title}</h4>{group.items.length?<ul>{group.items.map(f=><li key={f.code}>{f.text}</li>)}</ul>:<p>No hay una señal destacada con los datos disponibles.</p>}</div>)}</div>
   <div className={s.contextDetails}>
    <h4>Contexto comprobado</h4>
    <p>Minutos observados del partido completo: L5 {fmt(a.minutes.last5.average)} ({a.minutes.last5.valid}/{a.minutes.last5.total}); L10 {fmt(a.minutes.last10.average)} ({a.minutes.last10.valid}/{a.minutes.last10.total}). No son minutos proyectados.</p>
    {reference&&<p>{context!.opponent} permite {fmt(reference.allowed)} por partido al conjunto de {positions[reference.position]}; liga {fmt(reference.leagueAverage)}. {reference.games}/{reference.total} partidos válidos · {reference.season}. Puesto {reference.rank??'S/D'} de {reference.rankedTeams}; 1 permite más. Es el total del grupo, no una proyección individual.{reference.through?` Hasta ${reference.through}.`:''}{d?.usesPrevious?` Temporada actual: ${d.currentGames} PJ válidos; se muestra la anterior por separado.`:''}</p>}
    {!!medical?.teammates.length&&<p>Compañeros a revisar: {medical.teammates.map(p=>`${p.name} (${medicalLabel(p.state)}${p.stale?', parte anterior':''})`).join(' · ')}{medical.additional?` · ${medical.additional} más en el parte`:''}.</p>}
    <h4>Limitaciones de la lectura</h4><ul>{a.limitations.map(f=><li key={f.code}>{f.text}</li>)}<li>Frecuencias históricas y contexto descriptivo: no se calcula una probabilidad para el próximo partido.</li></ul>
   </div>
  </details>
 </section>;
}

export function TicketInsight({document,entries}:{document:TicketDocument;entries:Record<string,AnalysisEntry>}){
 const a=assessTicket(document,entries),byId=new Map(document.legs.map((l,i)=>[l.id,{leg:l,position:i+1}]));
 const pairs=Object.values(a.relationCounts).reduce((sum,n)=>sum+n,0);
 return <section className={s.ticketInsight} aria-label="Revisión del ticket">
  <div className={s.insightHeading}><h2>Lectura del ticket</h2><span>{a.analyzed}/{a.total} analizadas</span></div>
  <div className={s.insightCounts}><span><strong>{a.pending}</strong> pendientes</span><span><strong>{a.smallSamples}</strong> con muestra pequeña</span><span><strong>{a.withContext}</strong> con contexto</span></div>
  {a.hasImpossible&&<p className={s.impossible}>Hay condiciones que no pueden acertarse juntas. Revisá las selecciones señaladas.</p>}
  {!!a.reviewFirst.length&&<div className={s.reviewFirst}><strong>Revisar primero</strong>{a.reviewFirst.map(row=><a key={row.id} href={`#ticket-leg-${row.id}`}><span>{row.position}. {row.name||'Jugador pendiente'}</span><small>{row.reason}</small></a>)}</div>}
  <details className={s.resultDetail}><summary>Partidos y selecciones relacionadas{pairs?` · ${pairs} par(es)`:''}</summary>
   {a.events.length>0&&<ul className={s.relationList}>{a.events.map(event=><li key={[event.date,...event.teams].join('|')}>{event.teams.join(' – ')}: {event.count} selección(es).{event.count>1?' Sus resultados pueden estar relacionados.':''}</li>)}</ul>}
   {a.relations.length>0?<ul className={s.relationList}>{a.relations.map((r,index)=><li key={index}><strong>{relations[r.code]}:</strong> {r.legIds.map((id,i)=><span key={id}>{i?' + ':''}<a href={`#ticket-leg-${id}`}>{byId.get(id)?.position}. {byId.get(id)?.leg.playerName}</a></span>)}</li>)}</ul>:<p>No se detectaron selecciones repetidas o incompatibles entre los datos completos.</p>}
   {pairs>a.relations.length&&<p>Se muestran {a.relations.length} pares de {pairs}. El JSON conserva el conteo por tipo.</p>}
  </details>
 </section>;
}
