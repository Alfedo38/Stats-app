import {finiteStat} from './selectionStats';
type Row=Record<string,unknown>;
export type ShotProfile={zones:number[];games:number;attempts:number};
export type PlayerComparableProfile={minutes:number|null;points:number|null;usage:number|null;games:number;usageGames:number;shot:ShotProfile|null};
export const SHOT_ZONES=['Aro','Pintura sin aro','Media distancia','Triples'] as const;
const zoneNames:Record<string,number>={'Restricted Area':0,'In The Paint (Non-RA)':1,'Mid-Range':2,'Left Corner 3':3,'Right Corner 3':3,'Above the Break 3':3};
const id=(x:unknown)=>String(x??'').trim().replace(/^0+/,'');
export function usableShotProfile(zones:unknown,games:unknown):ShotProfile|null{
 if(!Array.isArray(zones)||zones.length!==4||zones.some(n=>typeof n!=='number'||!Number.isSafeInteger(n)||n<0)||typeof games!=='number'||!Number.isSafeInteger(games)||games<5)return null;
 const attempts=zones.reduce((a,b)=>a+b,0);
 return attempts>=30?{zones,games,attempts}:null;
}
export function usagePercent(value:unknown){const v=finiteStat(value);return v===null||v<0||v>100?null:v<=1?v*100:v;}
function minutes(row:Row){
 const raw=row.min_clean??row.minutes_clean??row.min_decimal??row.minutes_decimal??row.minutes??row.min??row.min_text??row.minutes_played;
 const parsed=typeof raw==='string'?/^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(raw.trim()):null;
 return parsed?(Number(parsed[2])<60?Number(parsed[1])+Number(parsed[2])/60:null):finiteStat(raw);
}
export function playerComparableProfile(facts:Row[],shots:Row[],season:string,phase:string,cutoff:string):PlayerComparableProfile {
 const seen=new Map<string,Row>(),conflicts=new Set<string>();
 for(const row of facts){
  const gid=id(row.game_id),date=String(row.game_date??'').slice(0,10),type=String(row.season_type??row.seasonType??row.game_type??'').toLowerCase().trim();
  const actualPhase=['regular season','regular','rs','temporada regular'].includes(type)||!type&&gid.padStart(10,'0').startsWith('002')?'Regular Season':['playoffs','playoff','postseason'].includes(type)||!type&&gid.padStart(10,'0').startsWith('004')?'Playoffs':null;
  const year=Number(date.slice(0,4))-(Number(date.slice(5,7))<10?1:0);
  const min=minutes(row);
  if(!/^\d+$/.test(gid)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=cutoff||String(year)!==season.slice(0,4)||actualPhase!==phase||min===null||min<=0||min>80||!['FULL','FULL_GAME'].includes(String(row.period_scope??'FULL').toUpperCase()))continue;
  const prior=seen.get(gid);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(row))conflicts.add(gid);
  else seen.set(gid,row);
 }
 for(const gid of conflicts)seen.delete(gid);
 const avg=(values:(number|null)[])=>{const valid=values.filter((n):n is number=>n!==null&&n>=0);return {n:valid.length,value:valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null};};
 const rows=[...seen.values()],usage=avg(rows.map(r=>usagePercent(r.usage_pct??r.usg_pct)));
 const zones=[0,0,0,0],games=new Set<string>(),events=new Set<string>();
 for(const row of shots){
  const gid=id(row.game_id),event=row.game_event_id,z=zoneNames[String(row.shot_zone_basic??'')];
  const key=gid+':'+String(event);
  if(!seen.has(gid)||event==null||!Number.isInteger(z)||row.shot_attempted_flag!==1||events.has(key))continue;
  events.add(key);games.add(gid);zones[z]++;
 }
 return {minutes:avg(rows.map(minutes)).value,points:avg(rows.map(r=>finiteStat(r.pts))).value,usage:usage.n>=5?usage.value:null,usageGames:usage.n,games:rows.length,shot:usableShotProfile(zones,games.size)};
}
export function zoneDistance(a:ShotProfile,b:ShotProfile){return a.zones.reduce((total,n,i)=>total+Math.abs(n/a.attempts-b.zones[i]/b.attempts),0)/2;}
