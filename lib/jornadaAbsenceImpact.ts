import {compareAbsences,type ComparisonSettings} from './absenceComparison';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {isDate} from './ticketReader/model';
import {marketIsValid,type JornadaMarket,type JornadaGame} from './nbaJornada';
import type {InjuryItem,InjuryReport} from './injuryReport';
export const IMPACT_MIN_GAMES=5;
export const IMPACT_UNITS:Record<JornadaMarket,string>={pts:'pts',reb:'reb',ast:'ast',fga:'FGA',fg3m:'triples',fg3a:'3PA',fta:'FTA',pra:'PRA',pr:'P+R',pa:'P+A',ra:'R+A'};
export type ImpactTarget={playerId:number;gameId:string};
export type AutoImpactRequest={date:string;market:JornadaMarket;slate:boolean;players:ImpactTarget[]};
export type AutoImpactItem={teammateId:number;name:string;reportAt:string|null;withAverage:number|null;withoutAverage:number|null;withCount:number;withoutCount:number;difference:number|null;unknown:number;conflicts:number;firstDate:string|null;lastDate:string|null};
export type AutoImpactPlayer=ImpactTarget&{team:string;status:'ready'|'none'|'unavailable'|'player_out';reason?:string;items:AutoImpactItem[]};
export type AutoImpactReport=AutoImpactRequest&{ok:true;version:2;archiveId:string|null;rosterAt:string;results:AutoImpactPlayer[]};
export function impactPlayerKey(player:ImpactTarget){return player.gameId+':'+player.playerId;}
export function automaticImpactRequest(raw:Record<string,unknown>):AutoImpactRequest|null{
 if(!raw||!isDate(raw.date)||!marketIsValid(raw.market)||raw.slate!=null&&typeof raw.slate!=='boolean'||!Array.isArray(raw.players)||!raw.players.length||raw.players.length>40)return null;
 const players:ImpactTarget[]=[],seen=new Set<string>();
 for(const p of raw.players){if(!p||typeof p!=='object'||!Number.isSafeInteger(p.playerId)||p.playerId<=0||typeof p.gameId!=='string'||!/^\d{1,15}$/.test(p.gameId))return null;const target={playerId:p.playerId,gameId:p.gameId},key=impactPlayerKey(target);if(seen.has(key))return null;seen.add(key);players.push(target);}
 return {date:raw.date,market:raw.market,slate:raw.slate===true,players:players.sort((a,b)=>impactPlayerKey(a).localeCompare(impactPlayerKey(b)))};
}
export function confirmedGameAbsences(report:InjuryReport,game:JornadaGame,eventDate:string,team:string){
 if(!report.available||!report.calendarAvailable||report.stale)return null;
 const rows=report.items.filter(i=>i.team===team&&i.date===eventDate&&i.game?.id===game.id&&i.game.away===game.away&&i.game.home===game.home);
 // Conflicting statuses, ambiguous identities and old reports never confirm a missing player.
 const unique=new Map<number,InjuryItem>(),invalid=new Set<number>();
 for(const row of rows){if(!row.playerId)continue;const old=unique.get(row.playerId);if(old&&old.status!==row.status)invalid.add(row.playerId);unique.set(row.playerId,row);}
 return [...unique.values()].filter(i=>i.status==='OUT'&&!i.conflict&&!i.stale&&i.playerId&&!invalid.has(i.playerId));
}
export function automaticImpact(facts:Record<string,any>[],mateFacts:Record<string,any>[],absences:Record<string,any>[],settings:Omit<ComparisonSettings,'teammateName'>,mate:{playerId:number;name:string;reportAt:string|null}):AutoImpactItem{
 const data=compareAbsences(facts,mateFacts,absences,[],{...settings,teammateName:mate.name},mate.playerId),yes=data.withPlayer.selection,no=data.withoutPlayer.selection;
 return {teammateId:mate.playerId,name:mate.name,reportAt:mate.reportAt,withAverage:yes.average,withoutAverage:no.average,withCount:yes.valid,withoutCount:no.valid,difference:yes.average!==null&&no.average!==null?(Math.round((no.average-yes.average)*10)/10||0):null,unknown:data.window.unknown,conflicts:data.window.conflicts,firstDate:data.window.firstDate,lastDate:data.window.lastDate};
}
export function impactDirection(item:AutoImpactItem){return item.difference===null||item.withCount<IMPACT_MIN_GAMES||item.withoutCount<IMPACT_MIN_GAMES?'missing':item.difference>0?'up':item.difference<0?'down':'same';}
export function impactDelta(value:number){return (value>0?'+':'')+value.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});}
export function matchingImpactReport(value:AutoImpactReport,request:AutoImpactRequest){
 if(!value?.ok||value.version!==2||value.date!==request.date||value.market!==request.market||value.slate!==request.slate||!Array.isArray(value.results)||value.results.length!==request.players.length)return false;
 const wanted=new Set(request.players.map(impactPlayerKey)),seen=new Set<string>();
 return value.results.every(p=>{const key=impactPlayerKey(p);if(!wanted.has(key)||seen.has(key)||!Array.isArray(p.items)||!['ready','none','unavailable','player_out'].includes(p.status))return false;seen.add(key);return p.items.every(i=>Number.isSafeInteger(i.teammateId)&&i.teammateId>0&&i.teammateId!==p.playerId&&typeof i.name==='string'&&i.name.length>0&&[i.withCount,i.withoutCount].every(n=>Number.isSafeInteger(n)&&n>=0)&&[i.withAverage,i.withoutAverage,i.difference].every(n=>n===null||typeof n==='number'&&Number.isFinite(n)));});
}
export const impactName=canonicalOddsPlayerName;
