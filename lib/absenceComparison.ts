import {summarizeRotation,type RotationGame} from "./nbaRotations";
import {finiteStat,selectionSummary} from './selectionStats';
import {getMinutesValue} from './formatters';
import {getOpponent,getGameLocation} from './playerUtils';
import {gamePhase} from './nbaGameFilters';
import {buildPeriodRows,type PeriodScope} from './nbaPeriodStats';
import {EVIDENCE_METRICS,evidenceMetricIds,evidenceValue,summarizeEvidence,type EvidenceMetric} from './marketEvidence';
import {injuryDate,injuryTeam} from './injuryReport';
import {isDate} from './ticketReader/model';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
export const CONFIRMED_ABSENT=['OUT','INACTIVE','DNP','DID NOT PLAY','DID_NOT_PLAY','DIDNOTPLAY','NOT_PLAYED','ABSENT','SUSPENDED','REST'];
export const COMPARISON_MARKETS=['pts','reb','ast','pra','pr','pa','ra','fgm','fga','fg3m','fg3a','ftm','fta','stl','blk','stl_blk','tov','pf','usage_pct','touches'] as const;
export type ComparisonMarket=typeof COMPARISON_MARKETS[number];
export type ComparisonSettings={playerId:number;teammateName:string;mode:'current'|'historical';team:string;market:ComparisonMarket;scope:PeriodScope;side:'over'|'under';line:number;asOfDate:string;phase:'ALL'|'Regular Season'|'Playoffs';season:string;lastN:number;opponent:string|null;homeAway:'HOME'|'AWAY'|null;minMinutes:number|null;thresholds:{metric:string;value:number}[]};
export type ComparisonContext=Omit<ComparisonSettings,'playerId'|'teammateName'|'mode'|'team'|'season'> & {unsupportedFilters?:boolean};
export function comparisonMarket(raw:unknown):ComparisonMarket|null{const value=String(raw??'').toLowerCase(),aliases:Record<string,string>={'pts+reb+ast':'pra','pts+reb':'pr','pts+ast':'pa','reb+ast':'ra','3ptm':'fg3m','3pm':'fg3m','3pt':'fg3m','3pta':'fg3a','3pa':'fg3a','stl+blk':'stl_blk',to:'tov'},key=aliases[value]??value;return (COMPARISON_MARKETS as readonly string[]).includes(key)?key as ComparisonMarket:null;}
export function seasonKey(row:Record<string,unknown>){const raw=String(row.season_year??row.season??row.season_id??'');if(/^\d{4}-\d{2}$/.test(raw)&&Number(raw.slice(5))===(Number(raw.slice(0,4))+1)%100)return raw;const match=raw.match(/^2?(\d{4})$/);if(match)return `${match[1]}-${String((Number(match[1])+1)%100).padStart(2,'0')}`;const date=injuryDate(row.game_date);if(!date)return '';const y=Number(date.slice(0,4))-(Number(date.slice(5,7))<10?1:0);return `${y}-${String((y+1)%100).padStart(2,'0')}`;}
export function comparisonSettings(raw:Record<string,unknown>):ComparisonSettings|null{
 const market=comparisonMarket(raw.market),playerId=Number(raw.playerId),name=typeof raw.teammateName==='string'?raw.teammateName.trim():'',team=injuryTeam(raw.team);
 if(!['number','string'].includes(typeof raw.playerId)||!/^\d+$/.test(String(raw.playerId))||!Number.isSafeInteger(playerId)||playerId<=0||!name||name.length>100||!market||!isDate(raw.asOfDate))return null;
 if(raw.mode!=='current'&&raw.mode!=='historical'||raw.mode==='historical'&&!team||raw.team!=null&&raw.team!==''&&!team)return null;
 if(!['FULL','Q1','H1','H2_REG'].includes(String(raw.scope))||!['over','under'].includes(String(raw.side))||!['ALL','Regular Season','Playoffs'].includes(String(raw.phase)))return null;
 const line=finiteStat(raw.line),lastN=Number(raw.lastN),minMinutes=raw.minMinutes==null?null:finiteStat(raw.minMinutes),season=String(raw.season??'all');
 if(line===null||line>300||![5,10,20,30,1000].includes(lastN)||raw.minMinutes!=null&&(minMinutes===null||minMinutes>100))return null;
 if(season!=='all'&&(!/^\d{4}-\d{2}$/.test(season)||Number(season.slice(5))!==(Number(season.slice(0,4))+1)%100))return null;
 if(raw.opponent!=null&&raw.opponent!==''&&!injuryTeam(raw.opponent)||raw.homeAway!=null&&!['HOME','AWAY'].includes(String(raw.homeAway)))return null;
 const thresholds=raw.thresholds??[];if(!Array.isArray(thresholds)||thresholds.length>16)return null;const parsed:{metric:string;value:number}[]=[];
 for(const t of thresholds){if(!t||typeof t!=='object')return null;const metric=String(t.metric??''),value=finiteStat(t.value);if(metric!=='minutes'&&!Object.hasOwn(EVIDENCE_METRICS,metric)||value===null||value>1000)return null;parsed.push({metric,value});}
 return {playerId,teammateName:name,mode:raw.mode as ComparisonSettings['mode'],team,market,scope:raw.scope as PeriodScope,side:raw.side as 'over'|'under',line,asOfDate:raw.asOfDate,phase:raw.phase as ComparisonSettings['phase'],season,lastN,opponent:injuryTeam(raw.opponent)||null,homeAway:raw.homeAway as 'HOME'|'AWAY'|null??null,minMinutes,thresholds:parsed};
}
type Row=Record<string,any>;
const id=(r:Row)=>/^\d{1,15}$/.test(String(r.game_id??''))?String(Number(r.game_id)):'';
const player=(v:unknown)=>['number','string'].includes(typeof v)&&/^\d+$/.test(String(v))?Number(v):NaN;
function location(r:Row){return ['HOME','AWAY'].includes(String(r.home_away_clean??r.home_away??'').toUpperCase())||/@|\bvs\.?\b/i.test(String(r.matchup_clean??r.matchup??''))?getGameLocation(r):null;}
function fullRow(row:Row){const copy={...row};for(const [field,parts] of Object.entries({pra:['pts','reb','ast'],pr:['pts','reb'],pa:['pts','ast'],ra:['reb','ast'],stl_blk:['stl','blk']})){const values=parts.map(p=>finiteStat(copy[p]));if(evidenceValue(copy,field)===null&&values.every(v=>v!==null))copy[field]=values.reduce<number>((s,v)=>s+v!,0);}return copy;}
function metricList(market:ComparisonMarket):EvidenceMetric[]{const label:Record<string,string>={pra:'PRA',pr:'Puntos + rebotes',pa:'Puntos + asistencias',ra:'Rebotes + asistencias'};return [...new Set(['minutes',market,...evidenceMetricIds(market)])].map(k=>EVIDENCE_METRICS[k]??{id:k,label:label[k]??k.toUpperCase(),description:'Mercado elegido',color:'#10b981'});}
export function compareAbsences(facts:Row[],teammateFacts:Row[],absenceRows:Row[],splits:Row[],s:ComparisonSettings,teammateId:number){
 const unique=new Map<string,Row>(),invalid=new Set<string>();
 for(const raw of facts){const date=injuryDate(raw.game_date),game=id(raw),team=injuryTeam(raw.team_abbreviation??raw.team_abbr);if(player(raw.player_id)!==s.playerId||!game||!date||date>=s.asOfDate||team!==s.team||!['Regular Season','Playoffs'].includes(gamePhase(raw)??''))continue;if(raw.split_code&&raw.split_code!=='FULL'||raw.period_scope&&raw.period_scope!=='FULL')continue;const row=fullRow(raw),old=unique.get(game);if(old&&injuryDate(old.game_date)!==date){invalid.add(game);continue;}if(!old)unique.set(game,row);}
 const all=[...unique.entries()].filter(([key])=>!invalid.has(key)).map(([,r])=>r),seasons=[...new Set(all.map(seasonKey).filter(Boolean))].sort().reverse();
 const base=all.filter(r=>(s.phase==='ALL'||gamePhase(r)===s.phase)&&(s.season==='all'||seasonKey(r)===s.season)&&getMinutesValue(r)!==0&&(!s.opponent||getOpponent(r)===s.opponent)&&(!s.homeAway||location(r)===(s.homeAway==='HOME'?'vs':'@'))&&(s.minMinutes===null||getMinutesValue(r)!==null&&getMinutesValue(r)!>=s.minMinutes));
 const partials=new Map<string,Row>();if(s.scope!=='FULL')for(const metric of metricList(s.market))for(const r of buildPeriodRows(base,splits,s.scope,metric.id))if(id(r)&&!partials.has(id(r)))partials.set(id(r),r);
 let selected=base.map(r=>({full:r,scoped:s.scope==='FULL'?r:partials.get(id(r))??{game_id:r.game_id,game_date:r.game_date,player_id:r.player_id,team_abbreviation:r.team_abbreviation,split_code:s.scope,period_scope:s.scope,min:null,minutes:null,period_minutes_verified:false}}));
 selected=selected.filter(({full,scoped})=>s.thresholds.every(t=>{const v=t.metric==='minutes'?getMinutesValue(full):evidenceValue(scoped,t.metric,s.scope);return v!==null&&v>=t.value;})).sort((a,b)=>String(b.full.game_date).localeCompare(String(a.full.game_date))||Number(b.full.game_id)-Number(a.full.game_id)).slice(0,s.lastN);
 const played=new Set<string>();for(const r of teammateFacts){const date=injuryDate(r.game_date);if(player(r.player_id)===teammateId&&injuryTeam(r.team_abbreviation??r.team_abbr)===s.team&&(getMinutesValue(r)??0)>0&&date&&date<s.asOfDate)played.add(id(r)+'|'+date);}
 const confirmed=new Set(absenceRows.filter(r=>injuryTeam(r.team_abbreviation??r.team_abbr)===s.team&&CONFIRMED_ABSENT.includes(String(r.absent_status??'').trim().toUpperCase())&&canonicalOddsPlayerName(r.absent_teammate)===canonicalOddsPlayerName(s.teammateName)).map(id).filter(Boolean));
 const withRows:Row[]=[],withoutRows:Row[]=[];let unknown=0,conflicts=0;
 for(const {full,scoped} of selected){const present=played.has(id(full)+'|'+injuryDate(full.game_date)),absent=confirmed.has(id(full));if(present&&absent)conflicts++;else if(present)withRows.push(scoped);else if(absent)withoutRows.push(scoped);else unknown++;}
 function summarize(rows:Row[]){const dates=rows.map(r=>injuryDate(r.game_date)).filter((d):d is string=>d!==null).sort();return {games:rows.length,firstDate:dates[0]??null,lastDate:dates.at(-1)??null,gameIds:rows.map(id),selection:selectionSummary(rows.map(r=>evidenceValue(r,s.market,s.scope)),s.line,s.side),metrics:metricList(s.market).map(metric=>{const m=summarizeEvidence(rows,metric,s.scope);return {id:metric.id,label:metric.label,kind:metric.kind??'number',average:m.average,count:m.count,total:m.total,invalid:m.invalid};})};}
 const withPlayer=summarize(withRows),withoutPlayer=summarize(withoutRows),dates=selected.map(r=>injuryDate(r.full.game_date)!).sort();return {settings:s,seasons,window:{games:selected.length,firstDate:dates[0]??null,lastDate:dates.at(-1)??null,unknown,conflicts,invalidIdentities:invalid.size},withPlayer,withoutPlayer,difference:{average:withPlayer.selection.average!==null&&withoutPlayer.selection.average!==null?withoutPlayer.selection.average-withPlayer.selection.average:null,hitRatePoints:withPlayer.selection.rate!==null&&withoutPlayer.selection.rate!==null?withoutPlayer.selection.rate-withPlayer.selection.rate:null},smallSample:withPlayer.selection.decided<5||withoutPlayer.selection.decided<5};
}
export function comparisonRotation(rows:RotationGame[],base:ReturnType<typeof compareAbsences>){
 return {withPlayer:summarizeRotation(rows,base.withPlayer.gameIds,base.settings.team),
  withoutPlayer:summarizeRotation(rows,base.withoutPlayer.gameIds,base.settings.team)};
}
export type AbsenceComparison=ReturnType<typeof compareAbsences> & {ok:true;archiveId:string;teammateId:number;teammateName:string;periodsAvailable:boolean;rosterAt:string;rotation?:ReturnType<typeof comparisonRotation>};
