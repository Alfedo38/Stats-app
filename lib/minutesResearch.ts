import {getMinutesValue} from './formatters';
import {minutesDistribution,MINUTES_MIN_GAMES} from './minutesDistribution';
import {sampleGameKey} from './playerSample';
import {isDate} from './ticketReader/model';

export function expectedMinutes(rows:Record<string,any>[],cutoff:string,team:string){
 const games=new Map<string,{date:string;minutes:number}>();
 for(const row of rows){
  const id=sampleGameKey(row.game_id??row.id),date=String(row.game_date??'').slice(0,10),minutes=getMinutesValue(row);
  if(id&&isDate(date)&&date<cutoff&&(row.team_abbreviation??row.team_abbr)===team
   &&(!row.period_scope||row.period_scope==='FULL')&&(!row.split_code||row.split_code==='FULL')&&minutes!==null&&minutes>0&&minutes<=72&&!games.has(id))games.set(id,{date,minutes});
 }
 const values=[...games].sort((a,b)=>a[1].date.localeCompare(b[1].date)||Number(a[0])-Number(b[0])).slice(-55).map(([,row])=>row.minutes);
 const median=(v:number[])=>minutesDistribution(v).median!;
 const candidate=(v:number[])=>.65*median(v.slice(-5))+.35*median(v.slice(-10));
 const errors=values.slice(10).map((v,i)=>{
  const history=values.slice(0,i+10);
  return [Math.abs(v-median(history.slice(-10))),Math.abs(v-candidate(history))];
 });
 const mae=(i:number)=>errors.length?errors.reduce((sum,e)=>sum+e[i],0)/errors.length:null;
 const baseline=mae(0),tested=mae(1),validated=errors.length>=20&&baseline!==null&&tested!==null&&tested+0.1<baseline;
 const history=minutesDistribution(values.slice(-10));
 return {history,estimate:validated?candidate(values):null,validated:validated&&history.count>=MINUTES_MIN_GAMES,
  observations:errors.length,baseline,tested};
}
