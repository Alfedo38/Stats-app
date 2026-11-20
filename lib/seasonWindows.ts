import {normalizeDateOnly} from './formatters';
import {historyReferenceDate,historySeasons} from './nbaHistoryWindow';
import {isDate} from './ticketReader/model';
import {finiteStat} from './selectionStats';
export type SeasonWindow={season:string;values:(number|null)[];seasonValues?:(number|null)[]};
export function seasonWindowValues(rows:Record<string,any>[],asOf?:string|null):SeasonWindow[]{
 const date=historyReferenceDate(asOf),seasons=historySeasons(date);
 const newest=rows.flatMap(row=>{const at=normalizeDateOnly(row.game_date),id=String(row.game_id??row.id??'').trim().replace(/^0+(?=\d)/,'');return isDate(at)&&at<date&&id?[{id,at,value:finiteStat(row.value)}]:[];}).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id,'en',{numeric:true}));
 const seen=new Set<string>(),unique=newest.filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
 return seasons.map(season=>{const seasonValues=unique.filter(r=>historySeasons(r.at)[0]===season).map(r=>r.value);return {season,values:seasonValues.slice(0,10),seasonValues};});
}
