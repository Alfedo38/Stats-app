import { ROLE_METRICS, roleNumber, roleValue, summarizeRole, type RoleRow } from './nbaRole';
import { periodMetricValue, type PeriodScope } from './nbaPeriodStats';
import { contextSeason } from './nbaContextNormalize';
export type AnalysisSample={playerId:string;rows:RoleRow[];trainingRows:RoleRow[];scope:PeriodScope;market:string;line:number;opponent:string|null;homeAway:string|null;minMinutes:number|null;labels:string[];outcomeFiltered:boolean;coverage:{total:number;available:number;seasons:{season:string;full:number;available:number}[]};loading:boolean;error:string|null};
export function keyGame(row:RoleRow){return String(row.game_id??'').replace(/^0+/,'')||String(row.game_date??'').slice(0,10);}
export function validHistory(rows:RoleRow[]){const seen=new Set<string>();return [...rows].sort((a,b)=>String(a.game_date).localeCompare(String(b.game_date))).filter(row=>{const key=keyGame(row);if(seen.has(key)||!key||!Number.isFinite(Date.parse(String(row.game_date))))return false;seen.add(key);return true;});}
export function sampleCoverage(raw:RoleRow[],partial:RoleRow[]){const available=new Set(partial.map(keyGame));const unique=validHistory(raw),seasons=new Map<string,{season:string;full:number;available:number}>();for(const row of unique){const season=contextSeason(row);const total=seasons.get(season)??{season,full:0,available:0};total.full++;total.available+=available.has(keyGame(row))?1:0;seasons.set(season,total);}return {total:unique.length,available:unique.filter(row=>available.has(keyGame(row))).length,seasons:[...seasons.values()].sort((a,b)=>b.season.localeCompare(a.season))};}
const avg=(values:number[])=>values.reduce((sum,v)=>sum+v,0)/values.length;
export function marketValue(row:RoleRow,market:string,scope:PeriodScope){return periodMetricValue(row,market,scope);}
export function forecastPast(rows:RoleRow[],market:string,scope:PeriodScope){const values=validHistory(rows).map(row=>marketValue(row,market,scope)).filter((v):v is number=>v!==null);if(values.length<10)return null;return .6*avg(values.slice(-10))+.4*avg(values);}
function quantile(values:number[],q:number){const sorted=[...values].sort((a,b)=>a-b);const index=(sorted.length-1)*q,lo=Math.floor(index),hi=Math.ceil(index);return sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo);}
export function evaluateForecast(rows:RoleRow[],market:string,scope:PeriodScope){
 const ordered=validHistory(rows).filter(row=>marketValue(row,market,scope)!==null),results:{date:string;prediction:number;actual:number;baseline:number;error:number}[]=[];
 let covered=0,intervals=0;
 for(let index=10;index<ordered.length;index++){
   const date=String(ordered[index].game_date).slice(0,10);
   // Use strictly earlier dates, including when input contains multiple rows for a date.
   const prior=ordered.slice(0,index).filter(row=>String(row.game_date).slice(0,10)<date);
   const prediction=forecastPast(prior,market,scope);if(prediction===null)continue;
   const actual=marketValue(ordered[index],market,scope)!;
   if(results.length>=20){const residuals=results.map(r=>r.error);const lo=Math.max(0,prediction+quantile(residuals,.1)),hi=Math.max(lo,prediction+quantile(residuals,.9));intervals++;if(actual>=lo&&actual<=hi)covered++;}
   const last=prior.slice(-10).map(row=>marketValue(row,market,scope)!);
   results.push({date,prediction,actual,baseline:avg(last),error:actual-prediction});
 }
 const next=forecastPast(ordered,market,scope),errors=results.map(row=>row.error);
 const interval=next!==null&&errors.length>=20?{low:Math.max(0,next+quantile(errors,.1)),high:Math.max(0,next+quantile(errors,.9))}:null;
 return {next,results,valid:ordered.length,mae:results.length?avg(errors.map(Math.abs)):null,bias:results.length?avg(errors):null,baselineMae:results.length?avg(results.map(r=>Math.abs(r.actual-r.baseline))):null,interval,intervalCount:intervals,coverage:intervals?covered/intervals*100:null};
}
export function roleExplanation(rows:RoleRow[],window=5){
 const sorted=[...validHistory(rows)].reverse(),recent=sorted.slice(0,window),previous=sorted.slice(window,window*2);
 if(recent.length<window||previous.length<window)return ['Faltan partidos para comparar ventanas consecutivas.'];
 const read=(group:RoleRow[],id:string,mode:'game'|'per36'='game')=>{const sample=summarizeRole(group,ROLE_METRICS.find(m=>m.id===id)!,mode);return sample.count===window?sample.value:null;};
 const ratio=(a:number|null,b:number|null)=>a!==null&&b!==null&&b>0?(a-b)/b:null;
 const messages:string[]=[];
 const min=ratio(read(recent,'minutes'),read(previous,'minutes')),volume=ratio(read(recent,'fga'),read(previous,'fga')),rate=ratio(read(recent,'fga','per36'),read(previous,'fga','per36'));
 if(min!==null&&volume!==null&&rate!==null){
   if(min>=.1&&volume>=.1&&Math.abs(rate)<.1)messages.push('Suben los minutos y los tiros por partido, con tiros por 36 estables: el cambio coincide principalmente con jugar más.');
   if(rate>=.1)messages.push('Aumentan los tiros por 36 minutos: hay más volumen de tiro durante el tiempo en cancha.');
   if(rate<=-.1)messages.push('Bajan los tiros por 36 minutos: el volumen de tiro durante el tiempo en cancha disminuye.');
 }
 const conversion=(group:RoleRow[])=>{const pairs=group.filter(row=>roleNumber(row.fga)!==null&&roleNumber(row.fgm)!==null);if(pairs.length!==window)return null;const attempts=pairs.reduce((sum,row)=>sum+Number(row.fga),0);return attempts>0?pairs.reduce((sum,row)=>sum+Number(row.fgm),0)/attempts:null;};
 const a=conversion(recent),b=conversion(previous);
 if(a!==null&&b!==null&&a-b>=.05&&volume!==null&&Math.abs(volume)<.1)messages.push('Mejora el acierto de campo con tiros por partido estables; no hay evidencia de más volumen de tiro en estas ventanas.');
 return messages.length?messages:['No se detecta un patrón de rol con cobertura completa y estos umbrales.'];
}
export function leagueDelta(rival:{attempts:number;made:number},league:{attempts:number;made:number}){return rival.attempts>=50&&league.attempts>=200?(rival.made/rival.attempts-league.made/league.attempts)*100:null;}
