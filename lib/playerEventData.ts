import 'server-only';
import prisma from './prisma';
import {getCurrentRosterPlayer,CURRENT_ROSTER_UPDATED_AT} from './currentRosters';
import {TEAMS} from './ticketReader/model';
import {rosterFitsDate} from './ticketReader/teamContext';
import {eventGames,type PlayerEventData} from './playerEvent';
const cache=new Map<string,{until:number;promise:Promise<Record<string,unknown>[]>}>();
export async function getPlayerEvent(playerId:number,date:string,mode:'upcoming'|'day',now=new Date()):Promise<PlayerEventData>{
 const player=getCurrentRosterPlayer(playerId),team=player?.team_abbreviation??null;
 const base:PlayerEventData={ok:true,playerId,date,mode,team,referenceAt:CURRENT_ROSTER_UPDATED_AT,available:false,status:'unknown_team',games:[]};
 if(!team||!TEAMS.includes(team))return {...base,team:null};if(!rosterFitsDate(date,CURRENT_ROSTER_UPDATED_AT))return {...base,status:'stale_roster'};
 const key=[team,date,mode].join('|');let entry=cache.get(key);
 try{
  if(!entry||entry.until<=Date.now()){
   const promise=prisma.$queryRawUnsafe<Record<string,unknown>[]>('SELECT nba_game_id,event_date,home,away,start_utc,status_id,postponed FROM public.nba_daily_schedule WHERE (home=$1::text OR away=$1::text) AND event_date BETWEEN ($2::date - 1) AND ($2::date + $3::integer) AND postponed=false ORDER BY start_utc,nba_game_id LIMIT 40',team,date,mode==='upcoming'?7:1);
   entry={until:Date.now()+60000,promise};if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(key,entry);
   promise.catch(()=>{if(cache.get(key)?.promise===promise)cache.delete(key);});
  }
  const rows=await entry.promise;if(rows.length>=40)return {...base,status:'unavailable'};
  const games=eventGames(rows,team,date,mode,now);return {...base,available:true,status:games.length?'ready':'no_game',games};
 }catch{return {...base,status:'unavailable'};}
}
