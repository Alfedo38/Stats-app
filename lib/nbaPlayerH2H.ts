import {formatDateOnly,getMinutesValue,normalizeDateOnly} from './formatters';
import {gamePhase} from './nbaGameFilters';
import {matchupSeasons} from './nbaHistoryWindow';
import {getOpponent} from './playerUtils';
import {finiteStat} from './selectionStats';
import {isDate,TEAMS} from './ticketReader/model';
import {twoPointFieldGoals} from './twoPointFieldGoals';

type Row=Record<string,any>;
const id=(raw:unknown)=>{const key=String(raw??'');return /^\d{1,15}$/.test(key)&&Number(key)>0?String(Number(key)):null;};
const team=(raw:unknown)=>{const key=String(raw??'').trim().toUpperCase();return TEAMS.includes(key)?key:null;};
const numeric=(raw:unknown)=>{const n=finiteStat(raw);return n!==null&&n>=0?n:null;};
const count=(raw:unknown)=>{const n=numeric(raw);return Number.isSafeInteger(n)?n:null;};
const seasonOf=(date:string)=>matchupSeasons(date)[0];
const chronological=<T extends {date:string;gameId:string}>(rows:T[])=>rows.sort((a,b)=>b.date.localeCompare(a.date)||Number(b.gameId)-Number(a.gameId));
function unique<T extends {gameId:string}>(rows:T[]){
 const map=new Map<string,T>(),conflicts=new Set<string>();
 for(const row of rows){const prior=map.get(row.gameId);if(prior&&JSON.stringify(prior)!==JSON.stringify(row))conflicts.add(row.gameId);else map.set(row.gameId,row);}
 return new Map([...map].filter(([key])=>!conflicts.has(key)));
}
function base(row:Row,cutoff:string,allowed:Set<string>){
 const gameId=id(row.game_id),date=normalizeDateOnly(row.game_date),phase=gamePhase(row);
 if(!gameId||!isDate(date)||date>=cutoff||!allowed.has(seasonOf(date))||!['Regular Season','Playoffs'].includes(phase??''))return null;
 return {gameId,date,season:seasonOf(date)};
}
function facts(rows:Row[],player:number,cutoff:string,seasons:Set<string>){
 return unique(rows.flatMap(row=>{
  const key=base(row,cutoff,seasons),own=team(row.team_abbreviation??row.team_abbr),opponent=team(getOpponent(row)),minutes=getMinutesValue(row);
  return key&&id(row.player_id)===String(player)&&own&&opponent&&own!==opponent&&minutes!==null&&minutes>0&&minutes<=72&&(!row.split_code||row.split_code==='FULL')&&(!row.period_scope||row.period_scope==='FULL')
   ?[{...key,team:own,opponent,minutes,pts:count(row.pts),reb:count(row.reb),ast:count(row.ast),fg3m:count(row.fg3m)}]:[];
 }));
}
export function playerH2H(attackerFacts:Row[],defenderFacts:Row[],assignments:Row[],attacker:number,defender:number,cutoff:string){
 const seasons=matchupSeasons(cutoff),allowed=new Set(seasons);
 const a=facts(attackerFacts,attacker,cutoff,allowed),b=facts(defenderFacts,defender,cutoff,allowed);
 const games=chronological([...a.values()].flatMap(left=>{const right=b.get(left.gameId);
  return right&&left.date===right.date&&left.team===right.opponent&&right.team===left.opponent?[{gameId:left.gameId,date:left.date,season:left.season,attacker:left,defender:right}]:[];
 }));
 const covered=new Set<string>();
 const direct=unique(assignments.flatMap(row=>{
  const key=base(row,cutoff,allowed),own=team(row.offensive_team_abbr),opp=team(row.defensive_team_abbr);
  const seconds=numeric(row.matchup_minutes_sort),possessions=numeric(row.partial_possessions);
  if(!key||id(row.offensive_player_id)!==String(attacker)||!own||!opp||own===opp||!(seconds||possessions))return [];
  const left=a.get(key.gameId),right=b.get(key.gameId);
  if(left&&(left.team!==own||left.opponent!==opp||left.date!==key.date))return [];
  covered.add(key.gameId);
  if(id(row.defensive_player_id)!==String(defender)||right&&(right.team!==opp||right.opponent!==own||right.date!==key.date))return [];
  const fga=count(row.matchup_field_goals_attempted),fgm=count(row.matchup_field_goals_made),threeA=count(row.matchup_three_pointers_attempted),threeM=count(row.matchup_three_pointers_made);
  const {attempts:twoA,made:twoM}=twoPointFieldGoals(fga,fgm,threeA,threeM);
  return [{...key,team:own,opponent:opp,minutes:seconds!==null?seconds/60:null,possessions,pts:count(row.player_points),
   fga:fga!==null&&fgm!==null&&fgm>fga?null:fga,fgm:fga!==null&&fgm!==null&&fgm>fga?null:fgm,
   threeA:threeA!==null&&threeM!==null&&threeM>threeA?null:threeA,threeM:threeA!==null&&threeM!==null&&threeM>threeA?null:threeM,twoA,twoM}];
 }));
 const marks=chronological([...direct.values()]);
 return {seasons,games:games.slice(0,10),marks:marks.slice(0,10),gamesTotal:games.length,marksTotal:marks.length,
  coverage:seasons.map(season=>({season,games:games.filter(r=>r.season===season).length,
   gamesWithAssignments:games.filter(r=>r.season===season&&covered.has(r.gameId)).length,
   direct:marks.filter(r=>r.season===season).length}))};
}
export type PlayerH2HResult=ReturnType<typeof playerH2H>;
export const h2hDateLabel=(value:string)=>formatDateOnly(value,{year:true});
