import {isDate,TEAMS} from './ticketReader/model';
import {rotationGameId} from './nbaRotations';

export const ASSIST_ZONES=['Aro','Otros dobles','Triple esquina','Triple frontal','Sin zona'] as const;
export const ASSIST_GAME_LIMIT=30;
export const ASSIST_PART='assist_connections_v1';

type Pair=[passer:number,shooter:number,zone:number,count:number];
type Roster=[team:string,played:number[]];
type Game={id:string;date:string;rosters:Roster[];pairs:Pair[]};
export type AssistSnapshot={version:1;team:string;season:string;names:Record<string,string>;games:Game[]};
type Connection={id:number;name:string;total:number;games:number;zones:number[]};

export function assistGameIds(values:readonly unknown[]){
 return [...new Set(values.map(rotationGameId).filter((id):id is string=>id!==null))];
}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const playerId=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;

export function verifiedAssistSnapshot(raw:unknown):AssistSnapshot {
 if(!object(raw)||raw.version!==1||typeof raw.team!=='string'||!TEAMS.includes(raw.team)
  ||typeof raw.season!=='string'||!/^20\d{2}-\d{2}$/.test(raw.season)||!object(raw.names)
  ||!Array.isArray(raw.games)||raw.games.length<1||raw.games.length>6)throw Error('ASSIST_SNAPSHOT');
 if(Object.keys(raw.names).length>250||Object.entries(raw.names).some(([id,name])=>!/^[1-9]\d{0,9}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>100))throw Error('ASSIST_NAMES');
 const seen = new Set<string>();
 for(const g of raw.games){
  if(!g||typeof g.id!=='string'||g.id!==rotationGameId(g.id)||g.id.slice(3,5)!==raw.season.slice(2,4)
   ||seen.has(g.id)||!isDate(g.date)||!Array.isArray(g.rosters)||g.rosters.length!==2||!Array.isArray(g.pairs)||g.pairs.length>250)throw Error('ASSIST_GAME');
  seen.add(g.id);
  const teams=new Set<string>(),teamById=new Map<number,string>();
  for(const entry of g.rosters){
   if(!Array.isArray(entry)||entry.length!==2)throw Error('ASSIST_ROSTER');
   const [team,roster]=entry;
   if(typeof team!=='string'||!TEAMS.includes(team)||teams.has(team)||!Array.isArray(roster)||roster.length<5||roster.length>30)throw Error('ASSIST_ROSTER');
   teams.add(team);
   for(const pid of roster){
    if(!playerId(pid)||!Object.hasOwn(raw.names,String(pid))||teamById.has(pid))throw Error('ASSIST_ID');
    teamById.set(pid,team);
   }
  }
  if(!teams.has(raw.team))throw Error('ASSIST_TEAM');
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
 return raw as AssistSnapshot;
}

export function summarizeAssistConnections(snapshot:AssistSnapshot|null,pid:number,ids:readonly string[]){
 const wanted=new Set(assistGameIds(ids));
 const games=snapshot?.games.filter(g=>wanted.has(g.id)&&g.rosters.some(([,players])=>players.includes(pid)))??[];
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
 const list=(m:Map<number,Acc>):Connection[]=>[...m].map(([id,item])=>({
  id,name:snapshot!.names[String(id)],total:item.total,games:item.games.size,zones:item.zones
 })).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'es')||a.id-b.id);
 return {
  requested:wanted.size,covered:games.length,dates:games.map(g=>g.date).sort(),
  given:list(made),received:list(received),unknownZone,
 };
}
export type AssistSummary=ReturnType<typeof summarizeAssistConnections>;
