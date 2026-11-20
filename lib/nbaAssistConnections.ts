import {isDate,TEAMS} from './ticketReader/model';
import {rotationGameId} from './nbaRotations';

export const ASSIST_ZONES=['Aro','Otros dobles','Triple esquina','Triple frontal','Sin zona'] as const;
export const ASSIST_GAME_LIMIT=30;
export const ASSIST_PART='assist_connections_v1';
export const ASSIST_LEAGUE_PART='assist-league-v2';
export const assistShard=(id:string)=>String(Math.floor(Number(id)/16));

type Pair=[passer:number,shooter:number,zone:number,count:number];
type Roster=[team:string,played:number[]];
export type AssistGame={id:string;date:string;rosters:Roster[];pairs:Pair[]};
type Game=AssistGame;
export type NamedAssistGame=AssistGame & {names:Record<string,string>};
export type AssistSnapshot={version:1;team:string;season:string;names:Record<string,string>;games:Game[]};
type Connection={id:number;name:string;total:number;games:number;together:number;share:number;zones:number[]};

export function assistGameIds(values:readonly unknown[]){
 return [...new Set(values.map(rotationGameId).filter((id):id is string=>id!==null))];
}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const playerId=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;

export function verifiedAssistSnapshot(raw:unknown):AssistSnapshot {
 if(!object(raw)||raw.version!==1||typeof raw.team!=='string'||!TEAMS.includes(raw.team)
  ||typeof raw.season!=='string'||!/^20\d{2}-\d{2}$/.test(raw.season)||!object(raw.names)
  ||!Array.isArray(raw.games)||raw.games.length<1||raw.games.length>6)throw Error('ASSIST_SNAPSHOT');
 validateNames(raw.names);
 const seen=new Set<string>();
 for(const g of raw.games){
  validateGame(g,raw.names,raw.team,raw.season);
  if(seen.has(g.id))throw Error('ASSIST_GAME_DUPLICATE');
  seen.add(g.id);
 }
 return raw as AssistSnapshot;
}

function validateNames(names:Record<string,unknown>){
 if(Object.keys(names).length>250||Object.entries(names).some(([id,name])=>!/^[1-9]\d{0,9}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>100))throw Error('ASSIST_NAMES');
}
function validateGame(g:any,names:Record<string,unknown>,team?:string,season?:string): asserts g is AssistGame {
  if(!g||typeof g.id!=='string'||g.id!==rotationGameId(g.id)||(season&&g.id.slice(3,5)!==season.slice(2,4))
   ||!isDate(g.date)||!Array.isArray(g.rosters)||g.rosters.length!==2||!Array.isArray(g.pairs)||g.pairs.length>250)throw Error('ASSIST_GAME');
  const teams=new Set<string>(),teamById=new Map<number,string>();
  for(const entry of g.rosters){
   if(!Array.isArray(entry)||entry.length!==2)throw Error('ASSIST_ROSTER');
   const [team,roster]=entry;
   if(typeof team!=='string'||!TEAMS.includes(team)||teams.has(team)||!Array.isArray(roster)||roster.length<5||roster.length>30)throw Error('ASSIST_ROSTER');
   teams.add(team);
   for(const pid of roster){
    if(!playerId(pid)||!Object.hasOwn(names,String(pid))||teamById.has(pid))throw Error('ASSIST_ID');
    teamById.set(pid,team);
   }
  }
  if(team&&!teams.has(team))throw Error('ASSIST_TEAM');
  const seenPairs=new Set<string>();
  for(const pair of g.pairs){
   if(!Array.isArray(pair)||pair.length!==4)throw Error('ASSIST_PAIR');
   const [passer,shooter,zone,count]=pair;
   const team=teamById.get(passer),key=`${passer}:${shooter}:${zone}`;
   if(!team||teamById.get(shooter)!==team||passer===shooter||!Number.isInteger(zone)||zone<0||zone>=ASSIST_ZONES.length
    ||!Number.isSafeInteger(count)||count<1||count>150||seenPairs.has(key))throw Error('ASSIST_PAIR');
   seenPairs.add(key);
  }
}

export function verifiedAssistShard(raw:unknown,key:string):NamedAssistGame[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>16)throw Error('ASSIST_SHARD');
 const seen=new Set<string>();
 for(const item of raw){
  if(!object(item)||!object(item.names))throw Error('ASSIST_SHARD_NAMES');
  validateNames(item.names);
  validateGame(item,item.names);
  if(assistShard(item.id)!==key||seen.has(item.id))throw Error('ASSIST_SHARD_ID');
  seen.add(item.id);
 }
 return raw as NamedAssistGame[];
}

export type AssistDefenseGame=[date:string,id:string,zones:number[]|null];
export function assistDefense(raw:unknown,cutoff:string,season:string){
 if(!Array.isArray(raw)||raw.length>150)throw Error('ASSIST_RIVAL_DATA');
 const seen=new Set<string>();
 const selected=(raw as AssistDefenseGame[]).filter(row=>{
  if(!Array.isArray(row)||row.length!==3||!isDate(row[0])||row[1]!==rotationGameId(row[1])
   ||row[1].slice(3,5)!==season||seen.has(row[1])||(row[2]!==null&&(!Array.isArray(row[2])
    ||row[2].length!==ASSIST_ZONES.length||row[2].some(n=>!Number.isSafeInteger(n)||n<0||n>150))))throw Error('ASSIST_RIVAL_GAME');
  seen.add(row[1]);return row[0]<cutoff;
 }).sort((a,b)=>b[0].localeCompare(a[0])||b[1].localeCompare(a[1])).slice(0,20);
 const known=selected.filter(row=>row[2]!==null);
 const zones=ASSIST_ZONES.map((_,i)=>known.reduce((sum,row)=>sum+(row[2]?.[i]??0),0));
 return {covered:known.length,requested:selected.length,zones};
}

export function assistLeagueAverage(raw:unknown,cutoff:string):number[]|null{
 if(!Array.isArray(raw)||raw.length>366)throw Error('ASSIST_LEAGUE_REFERENCE');
 let last='',values:number[]|null=null;
 for(const row of raw){
  if(!Array.isArray(row)||row.length!==2||!isDate(row[0])||
   (row[1]!==null&&(!Array.isArray(row[1])||row[1].length!==ASSIST_ZONES.length||
    row[1].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>150))))throw Error('ASSIST_LEAGUE_AVERAGE');
  if(last<row[0]&&row[0]<cutoff){last=row[0];values=row[1];}
 }
 return values;
}

export function summarizeAssistConnections(snapshot:Pick<AssistSnapshot,'games'|'names'>|null,pid:number,ids:readonly string[]){
 const wanted=new Set(assistGameIds(ids));
 const games=snapshot?.games.filter(g=>wanted.has(g.id)&&g.rosters.some(([,players])=>players.includes(pid)))??[];
 const shared=new Map<number,number>();
 for(const game of games){
  for(const other of game.rosters.find(([,roster])=>roster.includes(pid))![1]){
   if(other!==pid)shared.set(other,(shared.get(other)??0)+1);
  }
 }
 type Acc={total:number;games:Set<string>;zones:number[]};
 const made=new Map<number,Acc>(),received=new Map<number,Acc>();
 let unknownZone=0;
 for(const g of games){
  for(const [passer,shooter,zone,count] of g.pairs){
   const target=passer===pid?made:shooter===pid?received:null;
   if(!target)continue;
   const other=passer===pid?shooter:passer;
   const item=target.get(other)??{total:0,games:new Set<string>(),zones:Array<number>(ASSIST_ZONES.length).fill(0)};
   item.total+=count;
   item.games.add(g.id);
   item.zones[zone]+=count;
   target.set(other,item);
   if(zone===ASSIST_ZONES.length-1)unknownZone+=count;
  }
 }
 const list=(m:Map<number,Acc>):Connection[]=>{
  const total=[...m.values()].reduce((sum,item)=>sum+item.total,0);
  return [...m].map(([id,item])=>({
   id,name:snapshot!.names[String(id)],total:item.total,games:item.games.size,together:shared.get(id)??0,
   share:item.total/total,zones:item.zones
  })).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'es')||a.id-b.id);
 };
 return {
  requested:wanted.size,covered:games.length,dates:games.map(g=>g.date).sort(),
  given:list(made),received:list(received),unknownZone,
  givenZones:ASSIST_ZONES.map((_,i)=>[...made.values()].reduce((sum,item)=>sum+item.zones[i],0))
 };
}
export type AssistSummary=ReturnType<typeof summarizeAssistConnections>;
