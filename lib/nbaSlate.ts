// La jornada NBA usa fecha del Este; cada evento conserva su fecha argentina.
import type {JornadaGame} from './nbaJornada';
import {nbaHistoryCutoff} from './injuryReport';
export function nbaSlateDate(start:string|null,eventDate:string){
 return nbaHistoryCutoff({start,date:eventDate});
}
export function mergeNbaSlate(date:string,days:ReadonlyArray<{date:string;games:readonly JornadaGame[]}>){
 const games=new Map<string,JornadaGame>();
 for(const day of days)for(const game of day.games)
  if(nbaSlateDate(game.start,day.date)===date)games.set(game.id,{...game,eventDate:day.date});
 return [...games.values()].sort((a,b)=>(a.start??'~').localeCompare(b.start??'~')||a.id.localeCompare(b.id));
}
