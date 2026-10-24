import 'server-only';
import prisma from '@/lib/prisma';
import {readerManifest,readerPart,expectedManifest,type ReaderManifest} from './archive';
import {ReaderError} from './errors';
import {lookupQuote} from './quotes';
import {getAllCurrentRosterPlayers,CURRENT_ROSTER_UPDATED_AT} from '@/lib/currentRosters';
import {isDate,TEAMS,type Leg,type PlayerOption,type Settings} from './model';
import {playerKey,playerCandidates,reviewIdentity} from './identity';
import {prepareGames} from './analysis';
import {rosterFitsDate,resolveTeamContext} from './teamContext';
import {ticketSchedule} from './calendar';

async function directory(manifest?:ReaderManifest):Promise<PlayerOption[]>{
 const players=new Map<number,PlayerOption>();
 {
  const summary=await readerPart<{players?:Record<string,string>}>('summaries',manifest);
  for(const [id,name]of Object.entries(summary.players??{})){const n=Number(id);if(Number.isSafeInteger(n)&&n>0)players.set(n,{id:n,name:String(name),team:null});}
 }
 for(const p of getAllCurrentRosterPlayers())players.set(p.player_id,{id:p.player_id,name:p.full_name,team:p.team_abbreviation});
 return [...players.values()];
}
export async function findPlayers(name:string,teams:string[]=[]){return playerCandidates(name,await directory(),teams);}
export async function resolveNames(items:{id:string;name:string;teams:string[]}[],eventDate?:string,archiveId?:string){
 const manifest=await expectedManifest(archiveId);
 const people=await directory(manifest),schedule=eventDate?await ticketSchedule(eventDate):{available:false,games:[]};
 const summary=eventDate?await readerPart<{recent?:Record<string,Record<string,unknown>[]>}>('summaries',manifest):{};
 return items.map(x=>{
  const identity=reviewIdentity(x.name,people,x.teams);
  if(!eventDate||identity.status!=='exact'||!identity.player)return {id:x.id,...identity};
  let team=identity.player.team,at=String(CURRENT_ROSTER_UPDATED_AT).slice(0,10),source:'roster'|'recent_archive'='roster';
  const rows=summary.recent?.[String(identity.player.id)]??[];
  const latest=rows.filter(r=>isDate(String(r.game_date).slice(0,10))&&String(r.game_date).slice(0,10)<eventDate&&TEAMS.includes(String(r.team_abbreviation??r.team_abbr))).sort((a,b)=>String(b.game_date).localeCompare(String(a.game_date)))[0];
  const date=latest?String(latest.game_date).slice(0,10):'';
  if(latest&&(date>at||!rosterFitsDate(eventDate,at))&&(Date.parse(eventDate)-Date.parse(date))/86400000<=14){team=String(latest.team_abbreviation??latest.team_abbr);at=date;source='recent_archive';}
  return {id:x.id,...identity,teamContext:resolveTeamContext(team,x.teams,eventDate,at,schedule,false,source)};
 });
}
export async function readAnalysis(leg:Leg,settings:Settings,archiveId?:string){
 const manifest=await expectedManifest(archiveId);
 const people=await directory(manifest),identity=reviewIdentity(leg.playerName,people,leg.teams);
 const exact=leg.playerId?people.filter(p=>p.id===leg.playerId&&playerKey(p.name)===playerKey(leg.playerName)):identity.status==='exact'&&identity.player?[identity.player]:[];
 if(exact.length!==1)return {ok:false,needsPlayer:true,candidates:identity.status==='exact'&&identity.player?[identity.player]:identity.candidates,error:identity.status==='exact'?'El identificador del jugador no coincide con su nombre. Buscalo y elegilo nuevamente.':identity.message};
 const player={...exact[0]};
 const facts=await readerPart<Record<string,unknown>[]>(`facts/${player.id}`,manifest);
 if(!Array.isArray(facts))throw new ReaderError('ARCHIVE_INVALID','El histórico del jugador no tiene el formato esperado.');
 const latest=facts.filter(r=>(r.game_date instanceof Date?r.game_date.toISOString():String(r.game_date)).slice(0,10)<settings.eventDate).sort((a,b)=>String(b.game_date).localeCompare(String(a.game_date)))[0];
 const rosterFresh=rosterFitsDate(settings.eventDate,String(CURRENT_ROSTER_UPDATED_AT));
 const historicalTeam=latest?String(latest.team_abbreviation??latest.team_abbr??''):null;
 const latestDate=latest?String(latest.game_date instanceof Date?latest.game_date.toISOString():latest.game_date).slice(0,10):'';
 const newerHistory=latestDate>String(CURRENT_ROSTER_UPDATED_AT).slice(0,10)&&historicalTeam&&TEAMS.includes(historicalTeam)&&(Date.parse(settings.eventDate)-Date.parse(latestDate))/86400000<=14;
 const team=leg.teamConfirmed?leg.playerTeam:newerHistory?historicalTeam:player.team&&rosterFresh?player.team:historicalTeam&&TEAMS.includes(historicalTeam)?historicalTeam:null;
 if(!leg.teamConfirmed&&team===player.team&&rosterFresh&&player.team&&historicalTeam&&TEAMS.includes(historicalTeam)&&historicalTeam!==player.team&&latestDate>=String(CURRENT_ROSTER_UPDATED_AT).slice(0,10))return {ok:false,needsTeam:true,player,error:`El plantel indica ${player.team}, pero el histórico más reciente indica ${historicalTeam}. Confirmá el equipo del jugador antes de analizar.`};
 if(!team||!leg.teams.includes(team))return {ok:false,needsTeam:true,player,error:`El equipo disponible para ${player.name}${team?` (${team})`:''} no permite identificar el rival de este ticket. Confirmá el equipo del jugador o corregí el partido.`};
 const fromRoster=rosterFresh&&player.team===team&&!newerHistory;
 const teamContext=resolveTeamContext(team,leg.teams,settings.eventDate,leg.teamConfirmed?settings.eventDate:fromRoster?String(CURRENT_ROSTER_UPDATED_AT):latestDate,await ticketSchedule(settings.eventDate),true,leg.teamConfirmed?'manual':fromRoster?'roster':'recent_archive');
 if(teamContext.status==='conflict')return {ok:false,needsTeam:true,player,teamContext,error:teamContext.message};
 let splits:Record<string,unknown>[]=[];
 if(leg.scope!=='FULL')try{splits=await prisma.$queryRawUnsafe('SELECT * FROM public.player_period_splits_front_v2_cache WHERE player_id = $1::bigint AND game_date < $2::date ORDER BY game_date DESC LIMIT 3000',player.id,settings.eventDate);}catch{throw new ReaderError('PERIODS_UNAVAILABLE','El histórico está conectado, pero no se pudieron consultar los parciales. Revisá la conexión de la base de datos.');}
 const targetId=teamContext.status==='matched'?teamContext.gameId?.replace(/^0+/,''):null;
 const games=prepareGames(facts,splits,leg,settings).filter(g=>!targetId||g.id.replace(/^0+/,'')!==targetId);const warnings:string[]=[];
 if(leg.teamConfirmed)warnings.push(`Equipo para este partido confirmado por vos: ${team}.`);
 else warnings.push(rosterFresh&&player.team===team?`Equipo de referencia: ${team}. Plantel actualizado: ${String(CURRENT_ROSTER_UPDATED_AT).slice(0,10)}. Revisalo si hubo un traspaso.`:`Equipo tomado del último partido histórico anterior a esta fecha: ${team}. Revisalo si hubo un traspaso.`);
 warnings.push(teamContext.message);
 const coverage=!facts.length?'no_history':!games.length?'filtered_out':games.every(g=>g.value===null)?'missing_period':'ready';
 if(coverage==='no_history')warnings.push('El archivo está conectado, pero todavía no contiene histórico de este jugador.');
 if(coverage==='filtered_out')warnings.push(`El archivo contiene ${facts.length} registros de este jugador, pero ninguno pasa los filtros y la fecha elegidos.`);
 if(coverage==='missing_period')warnings.push('Hay partidos del jugador, pero faltan los valores de este mercado o período. No se calcularon porcentajes.');
 const missing=games.slice(0,10).filter(g=>g.value===null).length;if(missing)warnings.push(`${missing} de los últimos ${Math.min(games.length,10)} partidos no tienen este mercado/período. No se cuentan como cero.`);
 if(leg.scope!=='FULL')warnings.push('Se usan exclusivamente datos del período elegido; los minutos mostrados corresponden al partido completo.');
 const quote=await lookupQuote({...leg,playerId:player.id,playerName:player.name,eventDate:settings.eventDate});
 if(leg.playerName!==player.name)warnings.push(`Nombre leído: ${leg.playerName}. Identidad verificada: ${player.name}.`);
 return {ok:true,result:{player:{...player,team},games,warnings,asOf:settings.eventDate,source:'Archivo NBA verificado',archiveId:manifest.id,coverage,quote,teamContext},resolvedLeg:{playerId:player.id,playerName:player.name,playerTeam:team,teamConfirmed:!!leg.teamConfirmed}};
}

export async function readerConnection(){
 const manifest=await readerManifest(true);
 const name=Object.keys(manifest.parts).find(k=>/^facts\/\d+$/.test(k)&&manifest.parts[k].rows>0);
 if(!name)throw new ReaderError('ARCHIVE_EMPTY','El archivo no contiene una muestra de hechos verificable.');
 const sample=await readerPart<Record<string,unknown>[]>(name,manifest);
 if(!Array.isArray(sample)||!sample.length)throw new ReaderError('ARCHIVE_EMPTY','No se pudo comprobar una muestra del histórico.');
 async function probe(table:'public.player_period_splits_front_v2_cache'|'public.latest_player_prop_odds_cache'){
  try{const rows=await prisma.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${table} LIMIT 1`);return {ok:true,hasRows:rows.length>0};}catch{return {ok:false,hasRows:false};}
 }
 const [periods,quotes]=await Promise.all([probe('public.player_period_splits_front_v2_cache'),probe('public.latest_player_prop_odds_cache')]);
 return {archive:{ok:true as const,id:manifest.id,facts:manifest.counts.facts,sampleRows:sample.length},periods,quotes};
}
