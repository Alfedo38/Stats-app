import {LEAGUE_TEAMS} from './teams';
import {canonicalTeam} from './matchupFilters';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {normalizedEvent} from './nbaOdds';
import {isDate} from './ticketReader/model';
import {matchupHref,playerGameHref,type GameContext} from './playerNavigation';
export const INJURY_STATUSES=['PROBABLE','QUESTIONABLE','DOUBTFUL','OUT','AVAILABLE','UNKNOWN'] as const;
export type InjuryStatus=typeof INJURY_STATUSES[number];
export const INJURY_LABELS:Record<InjuryStatus,string>={PROBABLE:'Probable',QUESTIONABLE:'Questionable',DOUBTFUL:'Doubtful',OUT:'OUT',AVAILABLE:'Disponible',UNKNOWN:'Por confirmar'};
export type ReportGame={id:string;date:string;away:string;home:string;start:string|null};
export type InjuryItem={id:string;playerId:number|null;name:string;team:string;date:string;reportGameDate:string;matchup:string;status:InjuryStatus;reason:string|null;reportAt:string|null;source:string;game:ReportGame|null;conflict:boolean;stale:boolean};
export type InjuryReport={ok:true;available:boolean;calendarAvailable:boolean;date:string;nextDate:string;latestReportAt:string|null;queriedAt:string;stale:boolean;items:InjuryItem[];warnings:string[]};
export function injuryDate(raw:unknown):string|null{const value=raw instanceof Date?Number.isFinite(raw.getTime())?raw.toISOString().slice(0,10):'':typeof raw==='string'?raw.slice(0,10):'';return isDate(value)?value:null;}
export function injuryTimestamp(raw:unknown):string|null{
 if(raw instanceof Date)return Number.isFinite(raw.getTime())?raw.toISOString():null;
 if(typeof raw!=='string'||!isDate(raw.slice(0,10))||!/^\d{4}-\d{2}-\d{2}[T ]/.test(raw)||!/(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(raw))return null;
 const time=Date.parse(raw);return Number.isFinite(time)?new Date(time).toISOString():null;
}
export function reportDateLabel(raw:unknown){const d=injuryDate(raw);if(!d)return 'Fecha S/D';const [y,m,day]=d.split('-');return `${day}/${m}/${y}`;}
export function reportTimeLabel(raw:unknown,zone:'AR'|'ET'='AR'){const timestamp=injuryTimestamp(raw);return timestamp?new Intl.DateTimeFormat('es-AR',{timeZone:zone==='AR'?'America/Argentina/Buenos_Aires':'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(timestamp))+` ${zone}`:'Hora del reporte S/D';}
export function injuryTeam(value:unknown){const raw=String(value??'').trim(),team=canonicalTeam(raw);if(team)return team;const key=raw.toLowerCase().replace(/[^a-z]/g,'');return LEAGUE_TEAMS.find(t=>t.name.toLowerCase().replace(/[^a-z]/g,'')===key)?.id??({losangelesclippers:'LAC',lalakers:'LAL'} as Record<string,string>)[key]??'';}
export function injuryStatus(value:unknown):InjuryStatus{const v=String(value??'').trim().toUpperCase().replace(/[ _-]+/g,' ');if(['OUT','INACTIVE','SUSPENDED'].includes(v))return 'OUT';return ['AVAILABLE','ACTIVE','PROBABLE','QUESTIONABLE','DOUBTFUL'].includes(v)?v==='ACTIVE'?'AVAILABLE':v as InjuryStatus:'UNKNOWN';}
export function injuryContext(g:ReportGame):GameContext{return {away:g.away,home:g.home,date:g.date,...(g.start?{start:g.start}:{}),returnTo:matchupHref(g.away,g.home,g.date,g.start??undefined)};}
export function injuryPlayerHref(item:InjuryItem){return item.playerId?playerGameHref(item.playerId,item.game?injuryContext(item.game):null,item.team):null;}
export function nbaHistoryCutoff(game:{start?:string|null;date:string}){const start=injuryTimestamp(game.start);if(!start)return game.date;const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(start));return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');}
type Raw=Record<string,unknown>;
type RosterPlayer={player_id:number;full_name:string;team_abbreviation:string};
export function prepareInjuryItems(rows:Raw[],games:ReportGame[],roster:RosterPlayer[],date:string,nextDate:string,now=new Date()){
 const latest=new Map<string,InjuryItem>();let ignored=0;
 for(const row of rows){
  const day=injuryDate(row.game_date),team=injuryTeam(row.team),name=String(row.player_name||row.player_name_raw||'').trim();
  if(!day||!team||!name||name.length>120){ignored++;continue;}
  const reportAt=injuryTimestamp(row.report_ts);if(reportAt&&Date.parse(reportAt)>now.getTime()+300000){ignored++;continue;}
  const matchup=String(row.matchup??'').trim(),event=normalizedEvent(matchup),expected=games.filter(g=>nbaHistoryCutoff(g)===day&&(g.away===team||g.home===team));
  const candidates=matchup?expected.filter(g=>normalizedEvent(g.away+'-'+g.home)===event):expected,game=candidates.length===1?candidates[0]:null,displayDate=game?.date??day;
  if(displayDate<date||displayDate>nextDate){ignored++;continue;}
  const identities=roster.filter(p=>p.team_abbreviation===team&&canonicalOddsPlayerName(p.full_name)===canonicalOddsPlayerName(name));
  const item:InjuryItem={id:String(row.id??latest.size),playerId:identities.length===1?identities[0].player_id:null,name,team,date:displayDate,reportGameDate:day,matchup:game?`${game.away} @ ${game.home}`:matchup,status:injuryStatus(row.normalized_status??row.current_status),reason:row.reason?String(row.reason).slice(0,600):null,reportAt,source:String(row.source||'NBA').slice(0,60),game,conflict:false,stale:reportAt===null||now.getTime()-Date.parse(reportAt)>36*3600000};
  const key=[displayDate,team,canonicalOddsPlayerName(name),game?.id??event].join('|'),previous=latest.get(key),time=reportAt?Date.parse(reportAt):-1,old=previous?.reportAt?Date.parse(previous.reportAt):-1;
  if(!previous||time>old)latest.set(key,item);else if(time===old&&previous.status!==item.status)latest.set(key,{...previous,status:'UNKNOWN',conflict:true,reason:'Hay estados diferentes en la misma captura. Requiere revisión.'});
 }
 return {items:[...latest.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.team.localeCompare(b.team)||a.name.localeCompare(b.name,'es')),ignored};
}
export function filterInjuries(items:InjuryItem[],input:{query?:string;team?:string;status?:string;date?:string;game?:string;includeAvailable?:boolean}){const key=canonicalOddsPlayerName(input.query??'');return items.filter(p=>(!input.team||p.team===input.team)&&(!input.status||p.status===input.status)&&(!input.date||p.date===input.date)&&(!input.game||p.game?.id===input.game)&&(input.includeAvailable||input.status==='AVAILABLE'||p.status!=='AVAILABLE')&&(!key||canonicalOddsPlayerName(`${p.name} ${p.team}`).includes(key)));}
export function injuryPlayerId(value:unknown):number|null {
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(typeof value==='string'&&!/^[1-9]\d{0,12}$/.test(value))return null;
 const id=Number(value);return Number.isSafeInteger(id)&&id>0?id:null;
}
export function selectPlayerInjury(report:InjuryReport,playerId:number|string,date:string,context:GameContext|null=null){const id=injuryPlayerId(playerId);if(id===null)return null;const rows=report.items.filter(p=>p.playerId===id&&p.date===date&&(!context||p.game?.away===context.away&&p.game?.home===context.home));return rows.length===1?rows[0]:null;}
