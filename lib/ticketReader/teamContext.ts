import {isDate, TEAMS, type TeamContext} from './model';
import {seasonOf} from './analysis';
export type ScheduledGame={id:string;home:string;away:string};
export type ScheduleContext={available:boolean;games:ScheduledGame[]};
export function rosterFitsDate(eventDate:string,rosterAt:string){
 const at=rosterAt.slice(0,10);
 return isDate(eventDate)&&isDate(at)&&eventDate>=at&&seasonOf(eventDate)===seasonOf(at)&&(Date.parse(eventDate)-Date.parse(at))/86400000<=30;
}
export function resolveTeamContext(team:string|null,teams:string[],eventDate:string,rosterAt:string,schedule:ScheduleContext,explicitTeam=false,referenceSource:TeamContext['referenceSource']='roster'):TeamContext {
 const base={team,teams:[] as string[],gameId:null as string|null,referenceAt:rosterAt.slice(0,10),referenceSource};
 if(!team||!TEAMS.includes(team)||!isDate(eventDate)||!explicitTeam&&!rosterFitsDate(eventDate,rosterAt))return {...base,status:'not_checked',message:'No hay un plantel de referencia suficientemente reciente para completar este partido. Revisá los equipos.'};
 if(!schedule.available)return {...base,status:'unavailable',message:`Equipo de referencia: ${team}. No pudimos comprobar el calendario de esa fecha.`};
 const games=schedule.games.filter(g=>g.home===team||g.away===team);
 if(!games.length)return {...base,status:'not_found',message:`Equipo de referencia: ${team}. No encontramos su partido en el calendario de esa fecha.`};
 if(games.length!==1)return {...base,status:'ambiguous',message:`Hay más de un partido posible para ${team} en esa fecha. Revisá el rival.`};
 const game=games[0],pair=[game.away,game.home];
 if(teams.some(t=>!pair.includes(t)))return {...base,status:'conflict',teams:pair,gameId:game.id,message:`El calendario indica ${pair.join(' – ')}. Los equipos leídos no coinciden; revisá el partido o la fecha.`};
 return {...base,status:'matched',teams:pair,gameId:game.id,message:`Equipo de referencia: ${team} (${referenceSource==='recent_archive'?'histórico reciente':referenceSource==='manual'?'confirmado por vos':'plantel'}, ${rosterAt.slice(0,10)}). Partido comprobado en el calendario: ${pair.join(' – ')}.`};
}
