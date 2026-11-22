import {isDate,TEAMS} from './ticketReader/model';

export const PLAYTYPES={PRBallHandler:'Pick and roll con pelota',Isolation:'Uno contra uno',Transition:'Transición',
 Spotup:'Ataque tras recibir (spot up)',PRRollman:'Continuación del bloqueo'} as const;
type PlayType=keyof typeof PLAYTYPES;
type Line=[pointsPerGame:number,ppp:number,games:number,possessions:number];
type Profile=Partial<Record<PlayType,Line>>;
type Snapshot={version:1;season:string;capturedOn:string;capturedAt?:string;players:Record<string,Profile>;teams:Record<string,Profile>};
export type PlaytypeReport={available:boolean;capturedOn:string|null;rows:{name:string;points:number;ppp:number;plays:number;
 games:number;rivalPpp:number|null;rivalPlays:number|null;leaguePpp:number|null}[]};
const finite=(n:unknown,max:number):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
function checkedProfile(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('PLAYTYPES_PROFILE');
 for(const [key,row] of Object.entries(raw)){
  if(!Object.hasOwn(PLAYTYPES,key)||!Array.isArray(row)||row.length!==4||!finite(row[0],150)||!finite(row[1],5)||
   !finite(row[2],120)||!Number.isInteger(row[2])||row[2]<1||!finite(row[3],100000)||!Number.isInteger(row[3])||row[3]<10)throw Error('PLAYTYPES_ROW');
 }
 return raw as Profile;
}
export function playerPlaytypes(raw:unknown,pid:number,team:string|null,season:string,cutoff:string,start?:string|null):PlaytypeReport{
 const d=raw as Snapshot|null;
 if(!d)return {available:false,capturedOn:null,rows:[]};
 if(d.version!==1||!isDate(d.capturedOn)||d.season!==season||!d.players||Array.isArray(d.players)||!d.teams||
  Array.isArray(d.teams)||Object.keys(d.players).length>700||Object.keys(d.teams).some(t=>!TEAMS.includes(t)))throw Error('PLAYTYPES_DATA');
 const observed=d.capturedAt?Date.parse(d.capturedAt):NaN;
 const sameDay=d.capturedOn===cutoff&&start&&Number.isFinite(Date.parse(start))&&Number.isFinite(observed)
    &&d.capturedAt?.slice(0,10)===d.capturedOn&&observed<Date.parse(start);
 if((cutoff<=d.capturedOn&&!sameDay)||!Object.hasOwn(d.players,String(pid)))return {available:false,capturedOn:d.capturedOn,rows:[]};
 const own=checkedProfile(d.players[String(pid)]),rival=team&&d.teams[team]?checkedProfile(d.teams[team]):null;
 const refs=Object.values(d.teams).map(checkedProfile);
 const rows=(Object.keys(PLAYTYPES) as PlayType[]).flatMap(type=>{
  const p=own[type];if(!p)return [];
  const def=rival?.[type],average=refs.flatMap(r=>r[type]?[r[type]!]:[]);
  const total=average.reduce((sum,r)=>sum+r[3],0);
  return [{name:PLAYTYPES[type],points:p[0],ppp:p[1],games:p[2],plays:p[3],rivalPpp:def?.[1]??null,rivalPlays:def?.[3]??null,
   leaguePpp:average.length===30&&total?average.reduce((sum,r)=>sum+r[1]*r[3],0)/total:null}];
 }).sort((a,b)=>b.points-a.points);
 return {available:rows.length>0,capturedOn:d.capturedOn,rows};
}
