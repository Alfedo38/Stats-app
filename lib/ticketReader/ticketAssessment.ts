import {normalize,type Leg,type Result,type Game,type TicketDocument} from './model';
import {reviewLeg,summarize} from './analysis';
import {sanitizeSelectionContext,type SelectionContext} from './contextModel';

export type Factor={code:string;text:string;source:'history'|'opponent'|'minutes'|'defense'|'injury'|'coverage'};
type Entries=Record<string,{result?:Result;error?:string;needsTeam?:boolean;needsPlayer?:boolean}>;
export function minuteSummary(games:Game[]){const values=games.map(g=>g.minutes).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0);return {valid:values.length,total:games.length,average:values.length?values.reduce((s,v)=>s+v,0)/values.length:null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};}
const n=(value:number,d=1)=>value.toLocaleString('es-AR',{maximumFractionDigits:d});
const enough=(s:ReturnType<typeof summarize>)=>s.hits+s.misses>=5;
export function assessSelection(leg:Leg,result:Result){
 const own=result.player.id===leg.playerId&&result.asOf===leg.eventDate&&leg.market&&leg.operator&&leg.line!==null;
 const context=own&&result.context?sanitizeSelectionContext(result.context,leg,result.archiveId):null;
 const r=reviewLeg(own?result.games:[],leg),recent=r.recent,decided=recent.hits+recent.misses,versus=summarize(r.h2h,leg.line??0,leg.operator??'over');
 const support:Factor[]=[],concerns:Factor[]=[],limitations:Factor[]=[];
 const add=(list:Factor[],code:string,text:string,source:Factor['source'])=>list.push({code,text,source});
 if(!own||result.coverage!=='ready'||!recent.n)add(limitations,'NO_SAMPLE','Sin muestra válida para evaluar esta selección.','coverage');
 else if(!enough(recent))add(limitations,'SMALL_DECIDED_SAMPLE',`Solo ${decided} resultados decididos; hacen falta al menos 5 para interpretar la frecuencia.`, 'coverage');
 else if(recent.rate!==null){const text=`${recent.hits}/${decided} resultados decididos cumplen la condición en L10 (${n(recent.rate*100)}%).`;if(recent.rate>=.7)add(support,'RECENT_SUPPORT',text,'history');else if(recent.rate<.4)add(concerns,'RECENT_AGAINST',text,'history');}
 if(recent.requested<10)add(limitations,'SHORT_L10',`Hay ${recent.requested} partidos disponibles de los 10 buscados.`, 'coverage');
 if(recent.missing)add(limitations,'MISSING_VALUES',`${recent.missing} registros del mercado están sin dato; no se cuentan como cero.`, 'coverage');
 if(recent.pushes)add(limitations,'PUSHES',`${recent.pushes} empate(s) separados del acierto y del porcentaje decidido.`, 'history');
 if(enough(versus)&&versus.rate!==null){if(versus.rate>=.7)add(support,'OPPONENT_SUPPORT',`Contra ${r.rival}: ${versus.hits}/${versus.hits+versus.misses} decididos cumplen la línea.`, 'opponent');else if(versus.rate<.4)add(concerns,'OPPONENT_AGAINST',`Contra ${r.rival}: solo ${versus.hits}/${versus.hits+versus.misses} decididos cumplen la línea.`, 'opponent');}
 else add(limitations,'SMALL_OPPONENT_SAMPLE',`Contra ${r.rival??'el rival'} hay ${versus.n} antecedentes válidos, hasta 5 bajo los mismos filtros.`, 'coverage');
 const mins=minuteSummary((own?result.games:[]).slice(0,10)),last5=minuteSummary((own?result.games:[]).slice(0,5));
 if(mins.valid>=5&&mins.min!==null&&mins.max!==null&&mins.max-mins.min>=12)add(concerns,'MINUTES_VARIABLE',`Minutos del partido variables en la muestra: entre ${n(mins.min)} y ${n(mins.max)}.`, 'minutes');
 if(new Set(result.games.slice(0,10).map(g=>g.team).filter(Boolean)).size>1)add(limitations,'MULTIPLE_TEAMS','La muestra reciente incluye partidos en equipos distintos.','history');
 const d=context?.defense,reference=d?.reference;
 if(d?.status==='ready'&&reference&&leg.scope==='FULL'&&reference.diffPct!==null&&reference.rankedTeams>=20){
  const over=leg.operator==='over'||leg.operator==='at_least',delta=reference.diffPct,aligned=over?delta>=5:delta<=-5,against=over?delta<=-5:delta>=5;
  const text=`${context!.opponent} permite ${n(Math.abs(delta))}% ${delta>=0?'más':'menos'} que la liga ${reference.position==='ALL'?'en defensa general':'a esa posición'} (${reference.season}, ${reference.games} PJ). ${reference.position==='ALL'?'Incluye todas las posiciones.':'Es una referencia del grupo completo.'}`;
  if(aligned)add(support,'DEFENSE_ALIGNED',text,'defense');else if(against)add(concerns,'DEFENSE_AGAINST',text,'defense');
 }
 if(!context)add(limitations,'CONTEXT_UNAVAILABLE','Contexto defensivo y médico no disponible para esta consulta.','coverage');
 else{
  if(d?.status==='unavailable'||d?.status==='unsupported')add(limitations,'DEFENSE_UNAVAILABLE','No hay una referencia defensiva comparable disponible.','coverage');
  if(d?.status==='small_sample')add(limitations,'DEFENSE_SMALL_SAMPLE','La defensa tiene menos de 5 partidos válidos; no se usa como señal.','coverage');
  if(d?.usesPrevious&&reference)add(limitations,'PREVIOUS_DEFENSE',`La temporada actual tiene ${d.currentGames} PJ válidos; la referencia defensiva es ${reference.season}, sin mezclar temporadas.`, 'defense');
  if(leg.scope!=='FULL')add(limitations,'FULL_DEFENSE_REFERENCE','La defensa y los minutos de contexto son del partido completo; no se usan para inferir el rendimiento del período.','coverage');
  const injury=context.injuries;
  if(injury.player){if(injury.player.stale)add(limitations,'INJURY_STALE','El estado médico proviene de un parte anterior o sin fecha verificable; requiere revisión.','injury');else if(['OUT','DOUBTFUL','QUESTIONABLE','UNKNOWN'].includes(injury.player.state))add(concerns,'PLAYER_AVAILABILITY',`Participación a revisar: ${medicalLabel(injury.player.state)}. Comprobá también la liquidación si no juega.`, 'injury');}
  if(injury.teammates.length)add(limitations,'TEAMMATE_STATUS',`${injury.teammates.length+injury.additional} compañero(s) con estado a revisar. No se supone que su baja aumente la producción de este jugador.`, 'injury');
  if(injury.status==='not_reported'||injury.status==='known'&&!injury.player)add(limitations,'INJURY_NOT_REPORTED','No encontramos un estado médico para este partido; no equivale a estar disponible.','coverage');
  if(injury.status==='unavailable'||injury.status==='unverified_event')add(limitations,'INJURY_UNAVAILABLE','No pudimos verificar el parte médico de este partido.','coverage');
  if(injury.status==='historical')add(limitations,'HISTORICAL_MEDICAL','Ticket de una fecha pasada: no se aplica el parte médico actual.','coverage');
 }
 const title=!own||!recent.n?'Sin muestra para evaluar':!enough(recent)?'Muestra pequeña':concerns.some(f=>f.code==='PLAYER_AVAILABILITY')?'Participación a revisar':recent.rate!==null&&recent.rate>=.7?'Frecuencia reciente alta':recent.rate!==null&&recent.rate<.4?'Frecuencia reciente baja':'Frecuencia reciente mixta';
 return {version:1 as const,title,support:support.slice(0,3),concerns:concerns.slice(0,4),limitations:limitations.slice(0,8),recent:{valid:recent.n,decided,hits:recent.hits,rate:enough(recent)?recent.rate:null},minutes:{last5,last10:mins},context,minimumDecided:5};
}
export function medicalLabel(state:string){return ({OUT:'Fuera',QUESTIONABLE:'Cuestionable',DOUBTFUL:'Dudoso',PROBABLE:'Probable',AVAILABLE:'Disponible',UNKNOWN:'Por confirmar'} as Record<string,string>)[state]??'Sin confirmar';}

const components:Record<string,string[]>={PTS:['pts'],REB:['reb'],AST:['ast'],PRA:['pts','reb','ast'],PR:['pts','reb'],PA:['pts','ast'],RA:['reb','ast'],'3PT':['fg3m'],'3PA':['fg3a'],FGM:['fgm'],FGA:['fga'],FTM:['ftm'],FTA:['fta'],STL:['stl'],BLK:['blk'],TO:['tov'],'STL+BLK':['stl','blk']};
function interval(leg:Leg){const x=leg.line!;return leg.operator==='over'?{low:Math.floor(x)+1,high:Infinity,push:Number.isInteger(x)?x:null}:leg.operator==='under'?{low:0,high:Math.ceil(x)-1,push:Number.isInteger(x)?x:null}:leg.operator==='at_least'?{low:Math.ceil(x),high:Infinity,push:null}:{low:0,high:Math.floor(x),push:null};}
export type TicketRelation={code:'DUPLICATE'|'INCOMPATIBLE'|'OVERLAPPING_MARKETS'|'SAME_PLAYER'|'MULTIPLE_EVENTS';legIds:string[]};
export function selectionRelations(legs:Leg[]):TicketRelation[]{
 const out:TicketRelation[]=[];
 for(let a=0;a<legs.length;a++)for(let b=a+1;b<legs.length;b++){
  const x=legs[a],y=legs[b],same=x.playerId&&y.playerId?x.playerId===y.playerId:normalize(x.playerName)!==''&&normalize(x.playerName)===normalize(y.playerName);
  if(!same)continue;
  const event=(l:Leg)=>l.teams.length===2?[l.eventDate,...[...l.teams].sort()].join('|'):null,ex=event(x),ey=event(y);if(!ex||!ey)continue;
  if(ex!==ey){out.push({code:'MULTIPLE_EVENTS',legIds:[x.id,y.id]});continue;}
  if(x.scope===y.scope&&x.market&&y.market&&x.line!==null&&y.line!==null&&x.operator&&y.operator){
   if(x.market===y.market){const i=interval(x),j=interval(y);out.push({code:Math.max(i.low,j.low)>Math.min(i.high,j.high)?'INCOMPATIBLE':i.low===j.low&&i.high===j.high&&i.push===j.push?'DUPLICATE':'SAME_PLAYER',legIds:[x.id,y.id]});continue;}
   if(components[x.market]?.some(c=>components[y.market!]?.includes(c))){out.push({code:'OVERLAPPING_MARKETS',legIds:[x.id,y.id]});continue;}
  }
  out.push({code:'SAME_PLAYER',legIds:[x.id,y.id]});
 }return out;
}
export function assessTicket(document:TicketDocument,entries:Entries){
 const rows=document.legs.map((leg,index)=>{const entry=entries[leg.id],assessment=entry?.result?assessSelection(leg,entry.result):null;
  const priority=!assessment?100:assessment.concerns.some(f=>f.code==='PLAYER_AVAILABILITY')?90:assessment.recent.decided<5?80:assessment.concerns.some(f=>f.code==='RECENT_AGAINST')?70:assessment.concerns.length?60:assessment.limitations.some(f=>f.code==='MISSING_VALUES')?50:0;
  return {id:leg.id,position:index+1,name:leg.playerName,status:entry?.error?'error':assessment?'analyzed':'pending',priority,assessment};});
 const byEvent=new Map<string,{teams:string[];date:string;count:number}>();
 for(const l of document.legs)if(l.teams.length===2){const teams=[...l.teams].sort(),key=[l.eventDate,...teams].join('|'),old=byEvent.get(key);byEvent.set(key,{teams,date:l.eventDate,count:(old?.count??0)+1});}
 const relations=selectionRelations(document.legs),needsReview=rows.filter(r=>r.priority>0).sort((a,b)=>b.priority-a.priority||a.position-b.position);
 return {version:1 as const,total:rows.length,analyzed:rows.filter(r=>r.status==='analyzed').length,pending:rows.filter(r=>r.status!=='analyzed').length,smallSamples:rows.filter(r=>r.assessment&&r.assessment.recent.decided<5).length,withContext:rows.filter(r=>r.assessment?.context&&(r.assessment.context.defense.reference||r.assessment.context.injuries.status==='known')).length,events:[...byEvent.values()].sort((a,b)=>b.count-a.count),relations:relations.slice(0,20),relationCounts:Object.fromEntries(['DUPLICATE','INCOMPATIBLE','OVERLAPPING_MARKETS','SAME_PLAYER','MULTIPLE_EVENTS'].map(code=>[code,relations.filter(r=>r.code===code).length])),reviewFirst:needsReview.slice(0,3).map(r=>({id:r.id,position:r.position,name:r.name,status:r.status,reason:!r.assessment?'Selección pendiente de analizar o revisar.':r.assessment.concerns.find(f=>f.code==='PLAYER_AVAILABILITY')?.text??(r.assessment.recent.decided<5?'Muestra pequeña de resultados decididos.':r.assessment.concerns[0]?.text??r.assessment.limitations.find(f=>f.code==='MISSING_VALUES')?.text??'Revisá la cobertura de la muestra.')})),hasImpossible:relations.some(r=>r.code==='INCOMPATIBLE'),combinedProbability:null};
}
