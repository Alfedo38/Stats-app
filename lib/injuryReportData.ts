import 'server-only';
import prisma from './prisma';
import {getAllCurrentRosterPlayers} from './currentRosters';
import {isDate} from './ticketReader/model';
import {injuryDate,injuryTimestamp,injuryTeam,prepareInjuryItems,mergeInjuryEditions,type InjuryReport,type ReportGame} from './injuryReport';
const cache=new Map<string,{until:number;value:Promise<InjuryReport>}>();
export function nextReportDate(date:string){return new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
export function getInjuryReport(date:string):Promise<InjuryReport>{if(!isDate(date))throw Error('INJURY_DATE');const old=cache.get(date);if(old&&old.until>Date.now())return old.value;const value=readReport(date),entry={until:Date.now()+45000,value};cache.set(date,entry);if(cache.size>16)cache.delete(cache.keys().next().value!);value.catch(()=>{if(cache.get(date)===entry)cache.delete(date);});return value;}
async function readReport(date:string):Promise<InjuryReport>{
 const nextDate=nextReportDate(date),now=new Date(),report:InjuryReport={ok:true,available:false,calendarAvailable:false,date,nextDate,latestReportAt:null,queriedAt:now.toISOString(),stale:false,items:[],warnings:[]};
 const [raw,schedule,editions]=await Promise.allSettled([
  prisma.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT id,source,snapshot_key,report_ts,game_date,matchup,team,player_name_raw,player_name,current_status,normalized_status,reason FROM public.nba_injuries_latest_cache WHERE game_date BETWEEN ($1::date - 1) AND $2::date ORDER BY report_ts DESC NULLS LAST,id DESC LIMIT 2001`,date,nextDate),
  prisma.$queryRawUnsafe<Record<string,unknown>[]>('SELECT nba_game_id,event_date,away,home,start_utc FROM public.nba_daily_schedule WHERE event_date BETWEEN $1::date AND $2::date AND postponed=false ORDER BY start_utc LIMIT 81',date,nextDate),
  prisma.$queryRawUnsafe<Record<string,unknown>[]>('SELECT game_date,matchup,team,state,players,report_ts FROM nba_api_data.nba_injury_editions WHERE game_date BETWEEN ($1::date - 1) AND $2::date ORDER BY game_date LIMIT 121',date,nextDate),

 ]);
 const games:ReportGame[]=[];
 if(schedule.status==='fulfilled'&&schedule.value.length<=80){report.calendarAvailable=true;for(const row of schedule.value){const id=String(row.nba_game_id??''),day=injuryDate(row.event_date),away=injuryTeam(row.away),home=injuryTeam(row.home);if(/^\d{1,15}$/.test(id)&&day&&away&&home&&away!==home)games.push({id,date:day,away,home,start:injuryTimestamp(row.start_utc)});}}
 else report.warnings.push('No pudimos comprobar el calendario. Los estados conservan la fecha del parte; no se asigna un partido automáticamente.');
 report.games=games;
 const legacy=raw.status==='fulfilled'&&raw.value.length<=2000?raw.value:null;
 const official=editions.status==='fulfilled'&&editions.value.length<=120?editions.value:[];
 const combined=mergeInjuryEditions(legacy??[],official,games,now);
 if(legacy===null&&!combined.editions.length){report.warnings.push('No se pudo leer el parte médico guardado. Esto no significa que los jugadores estén disponibles.');return report;}
 report.editions=combined.editions;
 report.available=true;const result=prepareInjuryItems(combined.rows,games,getAllCurrentRosterPlayers(),date,nextDate,now);
 report.items=result.items.map(p=>({...p,stale:p.stale||combined.editions.some(e=>e.team===p.team&&e.game.id===p.game?.id&&e.stale)}));
 report.latestReportAt=[...report.items.map(p=>p.reportAt),...combined.editions.map(e=>e.reportAt)].filter((v):v is string=>v!==null).sort().at(-1)??null;
 report.stale=report.latestReportAt!==null&&now.getTime()-Date.parse(report.latestReportAt)>36*3600000;
 if(combined.editions.some(e=>e.stale&&e.game.start&&Date.parse(e.game.start)>=now.getTime()))report.warnings.push('Hay ediciones del parte sin actualización reciente cerca del inicio.');
 if(result.ignored)report.warnings.push('Algunos registros tenían fecha o identidad incompleta y no se utilizaron.');
 if(report.items.some(p=>p.conflict))report.warnings.push('Hay estados contradictorios en una misma captura. Se muestran como Por confirmar.');
 if(report.stale)report.warnings.push('El último reporte guardado tiene más de 36 horas. Revisá su fecha antes de usarlo.');return report;
}
