import {getMinutesValue} from './formatters';
import {gamePhase} from './nbaGameFilters';
import {periodCode,periodMetricValue,verifiedPeriodMinutes,type PeriodScope} from './nbaPeriodStats';
import {rotationGameId,rotationMinutes,rotationPeriodMs,type RotationGame} from './nbaRotations';
import {isDate,TEAMS} from './ticketReader/model';

type Row=Record<string,unknown>;
export type PartialScope=Exclude<PeriodScope,'FULL'>;
export type PeriodGame={playerId:number;gameId:string;date:string;team:string};
const ACTIVITY=['pts','reb','ast','oreb','dreb','stl','blk','tov','fgm','fga','fg3m','fg3a','ftm','fta'] as const;
const Q1_STATS=['pts','reb','ast'] as const;
export type Q1Stat=typeof Q1_STATS[number];
const PARTS:Record<string,readonly string[]>={pra:['pts','reb','ast'],pr:['pts','reb'],pa:['pts','ast'],ra:['reb','ast']};

function periodGame(row:Row):PeriodGame|null{
 const playerId=Number(row.player_id),gameId=rotationGameId(String(row.game_id??'')),team=String(row.team_abbreviation??'').trim().toUpperCase();
 const date=row.game_date instanceof Date?row.game_date.toJSON()?.slice(0,10):String(row.game_date??'').slice(0,10);
 return Number.isSafeInteger(playerId)&&playerId>0&&gameId&&isDate(date)&&TEAMS.includes(team)?{playerId,gameId,date,team}:null;
}
export const periodGameKey=({playerId,gameId,date,team}:PeriodGame)=>[playerId,gameId,date,team].join(':');

export function recentPeriodGames(rows:Row[],playerId:number,cutoff:string):PeriodGame[]{
 const games=rows.flatMap(row=>{
  if(periodCode(row.split_code??row.period_scope??'FULL')!=='FULL'||!['Regular Season','Playoffs'].includes(gamePhase(row)??''))return [];
  const game=periodGame(row);
  const minutes=getMinutesValue(row);
  if(!game||game.playerId!==playerId||game.date>=cutoff||!(minutes!==null?minutes>0:ACTIVITY.some(k=>(count(row,k,'FULL')??0)>0)))return [];
  return [game];
 }).sort((a,b)=>b.date.localeCompare(a.date)||b.gameId.localeCompare(a.gameId));
 const byId=new Map<string,PeriodGame>(),ambiguous=new Set<string>();
 for(const game of games){
  const previous=byId.get(game.gameId);
  if(!previous)byId.set(game.gameId,game);
  else if(previous.team!==game.team||previous.date!==game.date)ambiguous.add(game.gameId);
 }
 return [...byId.values()].filter(game=>!ambiguous.has(game.gameId)).slice(0,10);
}

function count(row:Row,stat:string,scope:PeriodScope){
 const value=periodMetricValue(row,stat,scope);
 return value!==null&&Number.isSafeInteger(value)&&value>=0?value:null;
}
function consensus(values:(number|null)[]){
 const found=new Set(values.filter((n):n is number=>n!==null));
 return found.size===1?[...found][0]:null;
}
export function indexPeriodBoxes(rows:Row[],scope:PartialScope){
 const index=new Map<string,Row[]>();
 for(const row of rows){
  if(periodCode(row.split_code)!==scope)continue;
  const game=periodGame(row);
  if(!game)continue;
  const key=periodGameKey(game),same=index.get(key);
  if(same)same.push(row);
  else index.set(key,[row]);
 }
 return index;
}

export function periodBox(rows:Row[],scope:PartialScope){
 const values=new Map(ACTIVITY.map(key=>[key,consensus(rows.map(row=>count(row,key,scope)))] as const));
 const minutes=consensus(rows.map(row=>verifiedPeriodMinutes(row,scope)));
 const activity=[...values.values()].some(n=>n!==null&&n>0);
 const value=(market:string)=>{
  const direct=consensus(rows.map(row=>count(row,market,scope)));
  const parts=PARTS[market]?.map(k=>values.get(k as typeof ACTIVITY[number])??null);
  if(!parts||parts.some(n=>n===null))return direct;
  const sum=parts.reduce<number>((acc,n)=>acc+n!,0);
  return direct!==null&&direct!==sum?null:sum;
 };
 return {minutes,activity,value};
}

export function periodSelection(box:ReturnType<typeof periodBox>,market:string){
 // Rows of zeroes can include players who sat out that period. Don't count
 // one as an Under unless verified minutes or logged activity prove play.
 return box.minutes===0||box.minutes===null&&!box.activity?null:box.value(market);
}

export function firstQuarterSample(games:PeriodGame[],splits:Row[],rotations:RotationGame[]){
 const boxes=indexPeriodBoxes(splits,'Q1');
 const byGame=new Map(rotations.filter(r=>r.played).map(r=>[r.gameId,r]));
 const rows=games.map(game=>{
  const r=byGame.get(game.gameId);
  const rotation=r?.team===game.team&&r.date===game.date?r:null;
  const box=periodBox(boxes.get(periodGameKey(game))??[],'Q1');
  const rotationMin=rotation?rotationMinutes(rotation,1):null;
  const conflict=(rotationMin!==null&&box.minutes!==null&&(rotationMin===0)!==(box.minutes===0))||
    (rotationMin!==null&&box.minutes!==null&&Math.abs(rotationMin-box.minutes)>0.05)||
    ((rotationMin??box.minutes)===0&&box.activity);
  const minutes=conflict?null:rotationMin??box.minutes;
  const played=conflict?null:minutes===null?box.activity?true:null:minutes>0;
  const first=rotation?.spans.find(([period])=>period===1)?.[1]??null;
  const role=conflict||!rotation||first===null?null:rotation.starter&&first===0?'starter':first>0&&!rotation.starter?'bench':null;
  const entryMs=role!==null&&first!==null?rotationPeriodMs(1)-first:null;
  const values=Object.fromEntries(Q1_STATS.map(k=>[k,played===true?box.value(k):null])) as Record<Q1Stat,number|null>;
  return {...game,minutes,played,role,entryMs,values,conflict};
 });
 const average=(values:(number|null)[])=>{
  const valid=values.filter((n):n is number=>n!==null);
  return {games:valid.length,value:valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null};
 };
 const minutes=average(rows.map(r=>r.minutes));
 const entries=rows.flatMap(r=>r.role==='bench'&&r.entryMs!==null?[r.entryMs]:[]).sort((a,b)=>a-b);
 const medianEntry=entries.length?(entries[Math.floor((entries.length-1)/2)]+entries[Math.floor(entries.length/2)])/2:null;
 return {rows,minutes,stats:Q1_STATS.map(key=>({key,...average(rows.map(r=>r.values[key]))})),
  played:rows.filter(r=>r.played===true).length,skipped:rows.filter(r=>r.played===false).length,
  starts:rows.filter(r=>r.role==='starter').length,benchEntries:entries.length,medianEntry};
}
