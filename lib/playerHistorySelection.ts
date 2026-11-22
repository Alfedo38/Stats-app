import {selectionOutcome,selectionSummary,type SelectionSide} from './selectionStats';

// El histórico se identifica por jugador, mercado y filtros de partidos.
// La posición de la línea y el lado son operaciones sobre el resultado.
export function playerHistoryRowsRequest(filters:Record<string,unknown>){
 return {...filters,line:0,side:'over' as const};
}
type Game={value:number|null;season_id?:string;[key:string]:unknown};
type StatBlock=Record<string,unknown>;
type History={
 games:Game[];summary:StatBlock;opponentSummary?:StatBlock|null;
 recent?:Record<string,StatBlock>;seasonBreakdown?:Array<StatBlock & {season:string}>;
 [key:string]:unknown;
};
export function rescorePlayerHistory(data:any,line:number,side:SelectionSide){
 if(!data||!Array.isArray(data.games))return data;
 const source:History=data,games=source.games.map(row=>{
  const outcome=selectionOutcome(row.value,line,side);
  return {...row,outcome,hit:outcome==='hit'?true:outcome==='miss'?false:null};
 });
 const summary=(base:StatBlock,rows:Game[])=>{
  const s=selectionSummary(rows.map(g=>g.value),line,side);
  return {...base,games:rows.length,hits:s.hits,misses:s.misses,pushes:s.pushes,missing:s.missing,
   decided:s.decided,valid:s.valid,hitRate:s.rate===null?null:s.rate/100,
   hitRatePct:s.rate===null?null:Number(s.rate.toFixed(1))};
 };
 return {...data,games,line,side,summary:summary(source.summary??{},games),
  opponentSummary:source.opponentSummary?summary(source.opponentSummary,games):null,
  recent:source.recent&&Object.fromEntries(Object.entries(source.recent).map(([k,base])=>[k,summary(base,games.slice(0,Number(k.slice(1))))])),
  seasonBreakdown:source.seasonBreakdown?.map(base=>summary(base,games.filter(g=>g.season_id===base.season)))};
}
