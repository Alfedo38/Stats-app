import {outcome} from './analysis';
import {TEAMS,type Game,type Leg} from './model';
type History={games:Game[];coverage:string;asOf:string;archiveId:string};
type Observation={id:string;outcome:'hit'|'miss'|'push'|'missing'};
export type JointGroup={event:string;teams:string[];legIds:string[];sample:Observation[];hits:number;misses:number;pushes:number;missing:number;complete:number;rate:number|null;status:'ready'|'insufficient'};
const MIN_SAMPLE=5;
function bounds(leg:Leg){
 const n=leg.line!;
 return leg.operator==='over'?{low:Math.floor(n)+1,high:Infinity}:leg.operator==='at_least'?{low:Math.ceil(n),high:Infinity}:leg.operator==='under'?{low:0,high:Math.ceil(n)-1}:{low:0,high:Math.floor(n)};
}
/** Descriptive joint frequency, never a calibrated probability for the next game. */
export function combinedHistory(legs:Leg[],histories:Record<string,History|undefined>,unsupported=0){
 const issues:string[]=[],groups:JointGroup[]=[],archives=new Set<string>();
 const base={method:'joint_recent_games_with_independence_between_events',isPrediction:false,minimumSample:MIN_SAMPLE,windowPerLeg:10,fullWinRequiresEveryLegToHit:true,groups,issues};
 if(!legs.length)return {...base,status:'unavailable',rate:null};
 if(unsupported>0)issues.push('UNSUPPORTED_SELECTIONS');
 const inputs=legs.filter(l=>{const h=histories[l.id];return h&&h.coverage==='ready'&&h.asOf===l.eventDate&&l.playerId&&l.market&&l.operator&&l.line!==null&&Number.isFinite(l.line)&&l.teams.length===2&&l.teams.every(t=>TEAMS.includes(t))&&l.teams[0]!==l.teams[1];});
 if(inputs.length!==legs.length)issues.push('INCOMPLETE_ANALYSIS');
 const fixtures=new Map<string,Leg[]>(),playerEvents=new Map<number,Set<string>>(),intervals=new Map<string,{low:number;high:number}>();
 for(const l of inputs){
  const event=[l.eventDate,...[...l.teams].sort()].join('|');
  fixtures.set(event,[...(fixtures.get(event)??[]),l]);
  const events=playerEvents.get(l.playerId!)??new Set<string>();events.add(event);playerEvents.set(l.playerId!,events);
  const key=[event,l.playerId,l.market,l.scope].join('|'),old=intervals.get(key)??{low:0,high:Infinity},next=bounds(l);
  intervals.set(key,{low:Math.max(old.low,next.low),high:Math.min(old.high,next.high)});
  archives.add(histories[l.id]!.archiveId);
 }
 if([...playerEvents.values()].some(events=>events.size>1))issues.push('PLAYER_IN_MULTIPLE_EVENTS');
 if(archives.size>1)issues.push('MULTIPLE_ARCHIVE_VERSIONS');
 if([...intervals.values()].some(b=>b.low>b.high)){
  issues.push('IMPOSSIBLE_CONDITIONS');return {...base,status:'impossible',rate:0};
 }
 if(issues.length)return {...base,status:'unavailable',rate:null};
 for(const [event,items]of fixtures){
  const samples=items.map(l=>{
   const byId=new Map<string,Game>();
   for(const g of histories[l.id]!.games){
    const id=g.id.replace(/^0+/,'');if(g.date>=l.eventDate||!id)continue;
    if(byId.has(id)){issues.push('DUPLICATE_HISTORY');continue;}
    byId.set(id,{...g,id});
   }
   return new Map([...byId.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,10).map(g=>[g.id,g]));
  });
  const common=[...samples[0].values()].filter(g=>samples.every(s=>s.has(g.id)));
  const sample:Observation[]=common.map(g=>{
   const rows=samples.map(s=>s.get(g.id)!);
   if(rows.some(r=>r.date!==g.date)){issues.push('HISTORY_DATE_CONFLICT');return {id:g.id,outcome:'missing'};}
   const states=rows.map((r,i)=>outcome(r.value,items[i].line!,items[i].operator!));
   return {id:g.id,outcome:states.includes('missing')?'missing':states.includes('miss')?'miss':states.includes('push')?'push':'hit'};
  });
  const hits=sample.filter(g=>g.outcome==='hit').length,misses=sample.filter(g=>g.outcome==='miss').length,pushes=sample.filter(g=>g.outcome==='push').length,missing=sample.filter(g=>g.outcome==='missing').length,complete=hits+misses+pushes;
  const ready=complete>=MIN_SAMPLE;
  groups.push({event,teams:[...items[0].teams].sort(),legIds:items.map(l=>l.id),sample,hits,misses,pushes,missing,complete,rate:ready?hits/complete:null,status:ready?'ready':'insufficient'});
 }
 if(issues.length)return {...base,status:'unavailable',rate:null};
 if(groups.some(g=>g.status!=='ready'))return {...base,status:'insufficient',rate:null};
 return {...base,status:'reference',rate:groups.reduce((p,g)=>p*g.rate!,1)};
}
