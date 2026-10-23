import {normalize,TEAMS,type Game,type Leg,type Market,type Operator,type Settings} from './model';
import {findTeams} from './parser';
type Row=Record<string,unknown>;
const fields:Record<Market,string[]>={PTS:['pts'],REB:['reb'],AST:['ast'],PRA:['pts','reb','ast'],PR:['pts','reb'],PA:['pts','ast'],RA:['reb','ast'],'3PT':['fg3m'],FGM:['fgm'],FGA:['fga'],STL:['stl'],BLK:['blk'],TO:['tov'],'STL+BLK':['stl','blk']};
export function numberOrNull(value:unknown):number|null {if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function minutes(value:unknown){if(typeof value==='string'&&/^\d+:\d{2}/.test(value)){const [m,s]=value.split(':');return Number(m)+Number(s)/60;}return numberOrNull(value);}
function gameId(row:Row){return String(row.game_id??'').replace(/^0+/,'');}
function dateOf(value:unknown){return value instanceof Date?value.toISOString().slice(0,10):String(value??'').slice(0,10);}
export function seasonOf(date:string){const y=Number(date.slice(0,4))-(Number(date.slice(5,7))<10?1:0);return `${y}-${String((y+1)%100).padStart(2,'0')}`;}
function phaseOf(row:Row){const text=normalize(row.season_type);if(text==='regular season')return 'Regular Season';if(text==='playoffs')return 'Playoffs';const id=String(row.game_id??'').padStart(10,'0');return id.startsWith('002')?'Regular Season':id.startsWith('004')?'Playoffs':'Other';}
function abbr(v:unknown){const code=String(v??'').toUpperCase().trim();return TEAMS.includes(code)?code:null;}
function valueOf(row:Row,market:Market,prefix=''):number|null {
 const keys=fields[market];const direct:Record<string,string[]>={fg3m:['fg3m','3ptm','3pm'],tov:['tov','to']};
 const take=(k:string)=>{for(const key of direct[k]??[k]){const n=numberOrNull(row[prefix+key]);if(n!==null)return n;}return null;};
 const parts=keys.map(take);if(parts.every(v=>v!==null))return parts.reduce<number>((a,b)=>a+b!,0);
 if(keys.length>1){for(const key of [market.toLowerCase(),keys.join('_'),keys.join('+')]){const n=numberOrNull(row[prefix+key]);if(n!==null)return n;}}
 return null;
}
export function prepareGames(facts:Row[],splits:Row[],leg:Leg,settings:Settings):Game[]{
 const byId=new Map<string,Row>();for(const row of splits)if(String(row.split_code).toUpperCase()===leg.scope)byId.set(gameId(row),row);
 const prefix=leg.scope==='Q1'?'q1_':leg.scope==='H1'?'h1_':leg.scope==='H2_REG'?'h2_':'';
 const unique=new Map<string,Game>();
 for(const row of facts){
  const date=dateOf(row.game_date);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=settings.eventDate)continue;
  const phase=phaseOf(row);if(phase==='Other'||settings.phase!=='ALL'&&phase!==settings.phase)continue;
  const season=seasonOf(date),current=seasonOf(settings.eventDate),previous=seasonOf(`${Number(current.slice(0,4))-1}-10-01`);
  if(settings.seasons==='current'&&season!==current||settings.seasons==='last2'&&season!==current&&season!==previous)continue;
  const min=minutes(row.min_clean??row.minutes_clean??row.min_decimal??row.min??row.minutes??row.min_text);
  if(min===0||settings.minMinutes!==null&&(min===null||min<settings.minMinutes))continue;
  const team=abbr(row.team_abbreviation??row.team_abbr),opponent=abbr(row.opponent_clean??row.opponent_abbr??row.opponent)??findTeams(String(row.matchup_clean??row.matchup??'')).find(t=>t!==team)??null;
  const id=gameId(row);if(!id)continue;
  const split=byId.get(id);const value=leg.market?leg.scope==='FULL'?valueOf(row,leg.market):split?valueOf(split,leg.market):valueOf(row,leg.market,prefix):null;
  if(!unique.has(id))unique.set(id,{id,date,season,phase,opponent,team,minutes:min,value});
 }
 return [...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
export type Outcome='hit'|'miss'|'push'|'missing';
export function outcome(value:number|null,line:number,operator:Operator):Outcome {if(value===null)return 'missing';if(operator==='at_least')return value>=line?'hit':'miss';if(operator==='at_most')return value<=line?'hit':'miss';if(value===line)return 'push';return operator==='over'?(value>line?'hit':'miss'):(value<line?'hit':'miss');}
export function summarize(games:Game[],line:number,operator:Operator){const values=games.filter(g=>g.value!==null).map(g=>g.value!);const outcomes=games.map(g=>outcome(g.value,line,operator));const hits=outcomes.filter(x=>x==='hit').length,misses=outcomes.filter(x=>x==='miss').length,pushes=outcomes.filter(x=>x==='push').length;const mins=games.map(g=>g.minutes).filter((n):n is number=>n!==null);const sorted=[...values].sort((a,b)=>a-b);return {requested:games.length,n:values.length,hits,misses,pushes,missing:games.length-values.length,rate:hits+misses?hits/(hits+misses):null,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,median:sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2:null,minutes:mins.length?mins.reduce((a,b)=>a+b,0)/mins.length:null};}
export function reviewLeg(games:Game[],leg:Leg){const line=leg.line??0,operator=leg.operator??'over';const recent=summarize(games.slice(0,10),line,operator);const team=leg.playerTeam;const rival=leg.teams.length===2&&team?leg.teams.find(t=>t!==team):null;const h2h=games.filter(g=>rival&&g.opponent===rival).slice(0,5);const label=recent.n<5?'Pocos datos':recent.missing?'Datos incompletos':recent.rate===null?'Sin resultados decididos':recent.rate>=0.8?'Frecuencia reciente alta':recent.rate>=0.5?'Frecuencia reciente mixta':'Frecuencia reciente baja';return {recent,last5:summarize(games.slice(0,5),line,operator),h2h,rival,label};}
export function ticketObservations(legs:Leg[]){const notes:string[]=[];const groups=new Map<string,number>();const players=new Map<string,number>();const unique=new Set<string>();for(const l of legs){const game=[...l.teams].sort().join('-');if(game)groups.set(game,(groups.get(game)??0)+1);const name=normalize(l.playerName);if(name)players.set(name,(players.get(name)??0)+1);const key=[name,l.scope,l.market,l.operator,l.line,game].join('|');if(unique.has(key))notes.push(`Selección repetida: ${l.playerName}.`);unique.add(key);}for(const [game,n]of groups)if(n>1)notes.push(`${n} selecciones de ${game}: sus resultados pueden estar relacionados.`);for(const [name,n]of players)if(n>1)notes.push(`${n} selecciones del mismo jugador (${name}).`);return [...new Set(notes)];}
