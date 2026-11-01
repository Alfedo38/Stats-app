import {isDate,TEAMS} from './ticketReader/model';
import {normalizedEvent,type PriceQuote} from './nbaOdds';
import {matchupHref,validStart,type GameContext} from './playerNavigation';
export type EventGame={id:string;date:string;nbaDate:string;away:string;home:string;start:string};
export type PlayerEventData={ok:true;playerId:number;date:string;mode:'upcoming'|'day';team:string|null;referenceAt:string;available:boolean;status:'ready'|'no_game'|'unknown_team'|'stale_roster'|'unavailable';games:EventGame[]};
export function eventDay(value:unknown){if(!(value instanceof Date)&&!(typeof value==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)))return null;if(typeof value==='string'&&(!/^\d{4}-\d{2}-\d{2}T/.test(value)||!isDate(value.slice(0,10))))return null;const d=value instanceof Date?value:new Date(value);if(!Number.isFinite(d.getTime()))return null;const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');}
export function eventGames(rows:Record<string,unknown>[],team:string,date:string,mode:'upcoming'|'day',now:Date){
 const found=new Map<string,EventGame>(),conflicts=new Set<string>();
 for(const row of rows){const id=String(row.nba_game_id??''),away=String(row.away??''),home=String(row.home??''),day=eventDay(row.start_utc),status=Number(row.status_id),nbaDate=String(row.event_date instanceof Date?row.event_date.toISOString():row.event_date??'').slice(0,10);
  if(!/^[1-9]\d{0,14}$/.test(id.replace(/^0+/,''))||!TEAMS.includes(away)||!TEAMS.includes(home)||away===home||![away,home].includes(team)||!day||!isDate(nbaDate)||row.postponed===true||!['1','2','3'].includes(String(row.status_id)))continue;
  const start=new Date(row.start_utc as string|Date).toISOString();
  if(mode==='day'?day!==date:status!==1||day<date||day>new Date(Date.parse(date+'T12:00:00Z')+7*86400000).toISOString().slice(0,10)||Date.parse(start)<=now.getTime())continue;
  const canonical=id.replace(/^0+/,''),game={id:canonical,date:day,nbaDate,away,home,start},old=found.get(canonical);if(old&&JSON.stringify(old)!==JSON.stringify(game))conflicts.add(canonical);else found.set(canonical,game);
 }
 return [...found].filter(([id])=>!conflicts.has(id)).map(([,game])=>game).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
export function eventContext(game:EventGame):GameContext{return {away:game.away,home:game.home,date:game.date,start:game.start,returnTo:matchupHref(game.away,game.home,game.date,game.start)};}
export function safeEventData(value:unknown,playerId:string|number,date:string,mode:'upcoming'|'day'):PlayerEventData|null{
 if(!value||typeof value!=='object')return null;const d=value as PlayerEventData;
 if(d.ok!==true||String(d.playerId)!==String(playerId)||d.date!==date||d.mode!==mode||typeof d.available!=='boolean'||!['ready','no_game','unknown_team','stale_roster','unavailable'].includes(d.status)||!Array.isArray(d.games)||d.games.length>39||d.team!==null&&!TEAMS.includes(d.team))return null;
 if(d.available!==['ready','no_game'].includes(d.status)||(d.status==='ready')!==(d.games.length>0))return null;
 if(d.games.some(g=>!g||!/^\d{1,15}$/.test(g.id)||!isDate(g.date)||!isDate(g.nbaDate)||!TEAMS.includes(g.away)||!TEAMS.includes(g.home)||g.away===g.home||!d.team||![g.away,g.home].includes(d.team)||!validStart(g.start,g.date)))return null;
 return d;
}
export function eventMessage(status:PlayerEventData['status']|undefined,mode:'upcoming'|'day',loading=false,error=false){return loading?'Buscando partido en el calendario…':error?'No pudimos comprobar el calendario. Volvé a intentar.':status==='unknown_team'?'Falta un equipo confirmado para este jugador.':status==='stale_roster'?'El plantel de referencia necesita actualizarse para esa fecha.':status==='unavailable'?'El calendario no está disponible.':status==='no_game'?(mode==='upcoming'?'No hay un próximo partido verificado en los próximos 7 días.':'Su equipo no tiene un partido verificado para esta fecha.'):'Elegí un partido del calendario.';}

export function quotesForEvent(rows:PriceQuote[],context:GameContext|null,now=new Date()){return context?rows.filter(q=>q.event_date===context.date&&normalizedEvent(q.matchup)===normalizedEvent(context.away+'-'+context.home)&&q.updated_at&&Number.isFinite(Date.parse(q.updated_at))&&Date.parse(q.updated_at)<=now.getTime()):[];}
