import 'server-only';
import prisma from '@/lib/prisma';
import {isDate,TEAMS} from './model';
import type {ScheduleContext} from './teamContext';
const cache=new Map<string,{until:number;value:Promise<ScheduleContext>}>();
export async function ticketSchedule(eventDate:string):Promise<ScheduleContext>{
 if(!isDate(eventDate))return {available:false,games:[]};
 const old=cache.get(eventDate);if(old&&old.until>Date.now())return old.value;
 const value=(async()=>{
  try{
   const rows=await prisma.$queryRawUnsafe<{nba_game_id:string;home:string;away:string}[]>('SELECT nba_game_id,home,away FROM public.nba_daily_schedule WHERE event_date=$1::date AND postponed=false ORDER BY start_utc LIMIT 40',eventDate);
   return {available:true,games:rows.filter(r=>/^\d{1,15}$/.test(String(r.nba_game_id))&&TEAMS.includes(r.home)&&TEAMS.includes(r.away)&&r.home!==r.away).map(r=>({id:String(r.nba_game_id),home:r.home,away:r.away}))};
  }catch{return {available:false,games:[]};}
 })();
 cache.set(eventDate,{until:Date.now()+60000,value});
 if(cache.size>16)cache.delete(cache.keys().next().value!);
 return value;
}
