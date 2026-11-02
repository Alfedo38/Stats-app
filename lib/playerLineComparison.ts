import {finiteStat,selectionSummary,type SelectionSide} from './selectionStats';
import {getDateSortValue} from './formatters';

type Row={value?:unknown;game_date?:unknown};
export function nearbyLines(line:number,step=1):number[]{
 if(!Number.isFinite(line)||line<0||!Number.isFinite(step)||step<=0)return [];
 const first=Math.max(-2,-Math.floor(line/step));
 return [...new Set(Array.from({length:5},(_,index)=>first+index).map(offset=>offset===0?line:Number((line+offset*step).toFixed(6))).filter(n=>Number.isFinite(n)&&n>=0))].sort((a,b)=>a-b);
}
function quantile(sorted:number[],fraction:number){
 if(!sorted.length)return null;
 const position=(sorted.length-1)*fraction,lower=Math.floor(position),upper=Math.ceil(position);
 return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
}
/** Calcula con la muestra recibida; no agrega partidos, temporadas ni filtros. */
export function comparePlayerLines(rows:Row[],line:number,side:SelectionSide){
 const ordered=rows.map((row,index)=>({row,index})).sort((a,b)=>getDateSortValue(a.row.game_date)-getDateSortValue(b.row.game_date)||a.index-b.index).map(x=>x.row);
 const values=ordered.map(row=>row.value),summary=selectionSummary(values,line,side);
 const valid=values.map(finiteStat).filter((n):n is number=>n!==null).sort((a,b)=>a-b);
 return {
  summary,
  windows:[5,10,20].map(requested=>{const sample=ordered.slice(-requested);return {requested,available:sample.length,summary:selectionSummary(sample.map(row=>row.value),line,side)};}),
  lines:nearbyLines(line).map(candidate=>({line:candidate,selected:candidate===line,summary:selectionSummary(values,candidate,side)})),
  range:{low:quantile(valid,.25),high:quantile(valid,.75),count:valid.length},
 };
}
