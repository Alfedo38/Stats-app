import {isDate,TEAMS} from './ticketReader/model';

export type RotationSpan=[period:number,inMs:number,outMs:number];
export type RotationGame={
 gameId:string;date:string;team:string;starter:boolean;played:boolean;boxMs:number;playedMs:number;periods:number;spans:RotationSpan[];
};
export const rotationPeriodMs=(period:number)=>period<=4?720000:300000;
export function rotationGameId(value:unknown){
 if(!['string','number'].includes(typeof value)||!/^\d{1,10}$/.test(String(value)))return null;
 const id=String(value).padStart(10,'0');return /^00[24]\d{7}$/.test(id)?id:null;
}
export function verifiedRotationRows(raw:unknown):RotationGame[]{
 if(!Array.isArray(raw)||raw.length>160)throw Error('ROTATION_FORMAT');
 const seen=new Set<string>(), rows:RotationGame[]=[];
 for(const r of raw){
  if(!r||!rotationGameId(r.gameId)||r.gameId!==rotationGameId(r.gameId)||seen.has(r.gameId)||!isDate(r.date)||!TEAMS.includes(r.team)
     ||typeof r.starter!=='boolean'||typeof r.played!=='boolean'||!Number.isInteger(r.periods)||r.periods<4||r.periods>10
     ||![r.boxMs,r.playedMs].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=4800000)||Math.abs(r.boxMs-r.playedMs)>1000
     ||!Array.isArray(r.spans)||r.spans.length>100||(!r.played&&(r.starter||r.boxMs||r.playedMs)))throw Error('ROTATION_GAME');
  let total=0,prev:RotationSpan|null=null;
  for(const segment of r.spans){
   if(!Array.isArray(segment)||segment.length!==3||!segment.every(Number.isSafeInteger))throw Error('ROTATION_SPAN');
   const [p,a,b]=segment;
   if(p<1||p>r.periods||a<0||a>=b||b>rotationPeriodMs(p)||prev&&(p<prev[0]||p===prev[0]&&a<=prev[2]))throw Error('ROTATION_SPAN');
   total+=b-a;prev=[p,a,b];
  }
  if(total!==r.playedMs)throw Error('ROTATION_MINUTES');
  seen.add(r.gameId);rows.push(r);
 }
 return rows;
}
export function rotationMinutes(g:RotationGame,period?:number){
 return g.spans.reduce((sum,[p,a,b])=>sum+(!period||p===period?b-a:0),0)/60000;
}
export function rotationSample(rows:RotationGame[],gameIds:readonly string[],team?:string){
 const wanted=new Set(gameIds.map(rotationGameId).filter(Boolean));
 return rows.filter(r=>wanted.has(r.gameId)&&r.played&&(!team||r.team===team))
  .sort((a,b)=>b.date.localeCompare(a.date)||b.gameId.localeCompare(a.gameId));
}
export function summarizeRotation(rows:RotationGame[],gameIds:readonly string[],team?:string){
 const sample=rotationSample(rows,gameIds,team);
 const covered=sample.length,requested=new Set(gameIds.map(rotationGameId).filter(Boolean)).size;
 const avg=(period?:number)=>covered?sample.reduce((s,r)=>s+rotationMinutes(r,period),0)/covered:null;
 return {requested,covered,starts:sample.filter(r=>r.starter).length,minutes:avg(),q1Minutes:avg(1)};
}
