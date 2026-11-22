import {compareAbsences,type ComparisonSettings} from './absenceComparison';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {isDate} from './ticketReader/model';
import {marketIsValid,type JornadaMarket,type JornadaGame} from './nbaJornada';
import type {InjuryItem,InjuryReport} from './injuryReport';
export const IMPACT_MIN_GAMES=5;
export const IMPACT_UNITS:Record<JornadaMarket,string>={pts:'pts',reb:'reb',ast:'ast',fga:'FGA',fgm:'FGM',fg3m:'triples',fg3a:'3PA',fta:'FTA',pra:'PRA',pr:'P+R',pa:'P+A',ra:'R+A'};
export type ImpactTarget={playerId:number;gameId:string};
export type AutoImpactRequest={date:string;market:JornadaMarket;slate:boolean;players:ImpactTarget[]};
import {minutesDistribution,type SeasonMinutes} from './minutesDistribution';
import {expectedMinutes} from './minutesResearch';
import {rotationGameId} from './nbaRotations';
import {getMinutesValue} from './formatters';
import {finiteStat} from './selectionStats';
export const ROLE_STATS={minutes:'MIN',pts:'PTS',reb:'REB',ast:'AST',fga:'FGA',fgm:'FGM'} as const;
export type RoleStats={metric:keyof typeof ROLE_STATS;withAvg:number|null;withoutAvg:number|null;withCount:number;withoutCount:number;delta:number|null};
export type AbsenceCohort={present:string[];absent:string[]};
export type AutoImpactItem={teammateId:number;name:string;reportAt:string|null;withAverage:number|null;withoutAverage:number|null;withCount:number;withoutCount:number;difference:number|null;unknown:number;conflicts:number;firstDate:string|null;lastDate:string|null;minutes?:{with:SeasonMinutes[];without:SeasonMinutes[]};role?:RoleStats[];quarterSamples?:{with:string[];without:string[]};minutesGuide?:{with:ReturnType<typeof expectedMinutes>;without:ReturnType<typeof expectedMinutes>}};
export type AutoImpactPlayer=ImpactTarget&{team:string;status:'ready'|'none'|'unavailable'|'player_out';reason?:string;items:AutoImpactItem[];joint?:{names:string[];role:RoleStats[]}};
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
 const edition=report.editions?.find(e=>e.team===team&&e.date===eventDate&&e.game.id===game.id);
 if(edition&&(edition.state==='pending'||edition.stale))return null;
 const rows=report.items.filter(i=>i.team===team&&i.date===eventDate&&i.game?.id===game.id&&i.game.away===game.away&&i.game.home===game.home);
 if(!edition&&!rows.length)return null;
 // Conflicting statuses, ambiguous identities and old reports never confirm a missing player.
 const unique=new Map<number,InjuryItem>(),invalid=new Set<number>();
 for(const row of rows){if(!row.playerId)continue;const old=unique.get(row.playerId);if(old&&old.status!==row.status)invalid.add(row.playerId);unique.set(row.playerId,row);}
 return [...unique.values()].filter(i=>i.status==='OUT'&&!i.conflict&&!i.stale&&i.playerId&&!invalid.has(i.playerId));
}
export function absenceRole(facts:Record<string,any>[],cohorts:AbsenceCohort[],team:string){
 const intersection=(key:keyof AbsenceCohort)=>{
  const sets=cohorts.map(c=>new Set(c[key]));
  return new Set((cohorts[0]?.[key]??[]).filter(id=>sets.every(set=>set.has(id))));
 };
 const yes=intersection('present'),no=intersection('absent');
 const rows=new Map<string,Record<string,any>>();
 for(const row of facts){
  const id=String(row.game_id??'').replace(/^0+/,'');
  if((yes.has(id)||no.has(id))&&!rows.has(id)&&(row.team_abbreviation??row.team_abbr)===team&&
   (!row.period_scope||row.period_scope==='FULL')&&(!row.split_code||row.split_code==='FULL'))rows.set(id,row);
 }
 const values=(ids:Set<string>,metric:keyof typeof ROLE_STATS)=>minutesDistributionOrMean([...ids].map(id=>{
  const r=rows.get(id);return !r?null:metric==='minutes'?getMinutesValue(r):finiteStat(r[metric]);
 }),metric==='minutes');
 return (Object.keys(ROLE_STATS) as (keyof typeof ROLE_STATS)[]).map(metric=>{
  const withPlayer=values(yes,metric),without=values(no,metric);
  return {metric,withAvg:withPlayer.average,withoutAvg:without.average,withCount:withPlayer.count,withoutCount:without.count,
   delta:withPlayer.count>=IMPACT_MIN_GAMES&&without.count>=IMPACT_MIN_GAMES&&withPlayer.average!==null&&without.average!==null
    ?Math.round((without.average-withPlayer.average)*10)/10||0:null};
 });
}
function minutesDistributionOrMean(values:(number|null)[],minutes:boolean){
 if(minutes)return minutesDistribution(values);
 const known=values.filter((v):v is number=>v!==null);
 return {count:known.length,average:known.length?known.reduce((a,b)=>a+b,0)/known.length:null};
}
export function automaticImpactDetail(facts:Record<string,any>[],mateFacts:Record<string,any>[],absences:Record<string,any>[],settings:Omit<ComparisonSettings,'teammateName'>,mate:{playerId:number;name:string;reportAt:string|null}){
 const data=compareAbsences(facts,mateFacts,absences,[],{...settings,teammateName:mate.name},mate.playerId),yes=data.withPlayer.selection,no=data.withoutPlayer.selection;
 const cohort={present:data.withPlayer.gameIds,absent:data.withoutPlayer.gameIds};
 const sampleFor=(ids:string[])=>{
  const wanted=new Set(ids.map(value=>String(value).replace(/^0+/,'')));
  return facts.filter(row=>wanted.has(String(row.game_id??'').replace(/^0+/,'')))
   .sort((a,b)=>String(b.game_date??'').slice(0,10).localeCompare(String(a.game_date??'').slice(0,10)));
 };
 const present=sampleFor(cohort.present),absent=sampleFor(cohort.absent);
 const rotationIds=(rows:Record<string,any>[])=>[...new Set(rows.map(r=>rotationGameId(r.game_id)).filter((id):id is string=>id!==null))].slice(0,20);
 const item:AutoImpactItem={teammateId:mate.playerId,name:mate.name,reportAt:mate.reportAt,withAverage:yes.average,withoutAverage:no.average,withCount:yes.valid,withoutCount:no.valid,difference:yes.average!==null&&no.average!==null?(Math.round((no.average-yes.average)*10)/10||0):null,unknown:data.window.unknown,conflicts:data.window.conflicts,firstDate:data.window.firstDate,lastDate:data.window.lastDate,minutes:{with:data.withPlayer.minuteSeasons,without:data.withoutPlayer.minuteSeasons},role:absenceRole(facts,[cohort],settings.team)};
 if(settings.asOfDate){
  item.quarterSamples={with:rotationIds(present),without:rotationIds(absent)};
  item.minutesGuide={with:expectedMinutes(present,settings.asOfDate,settings.team),without:expectedMinutes(absent,settings.asOfDate,settings.team)};
 }
 return {item,cohort};
}
export function automaticImpact(...args:Parameters<typeof automaticImpactDetail>):AutoImpactItem{
 return automaticImpactDetail(...args).item;
}
export function impactDirection(item:AutoImpactItem){return item.difference===null||item.withCount<IMPACT_MIN_GAMES||item.withoutCount<IMPACT_MIN_GAMES?'missing':item.difference>0?'up':item.difference<0?'down':'same';}
export function impactDelta(value:number){return (value>0?'+':'')+value.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});}
export function matchingImpactReport(value:AutoImpactReport,request:AutoImpactRequest){
 if(!value?.ok||value.version!==2||value.date!==request.date||value.market!==request.market||value.slate!==request.slate||!Array.isArray(value.results)||value.results.length!==request.players.length)return false;
 const wanted=new Set(request.players.map(impactPlayerKey)),seen=new Set<string>();
 return value.results.every(p=>{const key=impactPlayerKey(p);if(!wanted.has(key)||seen.has(key)||!Array.isArray(p.items)||!['ready','none','unavailable','player_out'].includes(p.status))return false;seen.add(key);return p.items.every(i=>Number.isSafeInteger(i.teammateId)&&i.teammateId>0&&i.teammateId!==p.playerId&&typeof i.name==='string'&&i.name.length>0&&[i.withCount,i.withoutCount].every(n=>Number.isSafeInteger(n)&&n>=0)&&[i.withAverage,i.withoutAverage,i.difference].every(n=>n===null||typeof n==='number'&&Number.isFinite(n)));});
}
export const impactName=canonicalOddsPlayerName;
