import {canonicalTeam} from './matchupFilters';
import {getOpponent} from './playerUtils';
import {sampleGameKey} from './playerSample';
import {finiteStat,selectionSummary} from './selectionStats';

type RivalRow = {game_id?:string|number;id?:string|number;game_date?:string;value?:unknown};
export type RivalSelection = ReturnType<typeof selectionSummary> & {line:number;side:'over'|'under'};

/** Rows are already bounded by the active date, period and filters. Pick the
 * last five games against the actual rival independently of the chart's L5/L10. */
export function recentRivalSelection(rows:readonly RivalRow[], rival:string, line:number, side:'over'|'under'):RivalSelection|null{
 const team=canonicalTeam(rival);
 if(!team||!Number.isFinite(line)||line<0)return null;
 const seen=new Set<string>(),values:(number|null)[]=[];
 const ordered=[...rows].sort((a,b)=>String(b.game_date??'').localeCompare(String(a.game_date??''))||String(b.game_id??b.id??'').localeCompare(String(a.game_id??a.id??''),'en',{numeric:true}));
 for(const row of ordered){
  if(canonicalTeam(getOpponent(row))!==team)continue;
  const id=sampleGameKey(row.game_id??row.id);
  if(!id||seen.has(id))continue;
  seen.add(id);
  values.push(finiteStat(row.value));
  if(values.length===5)break;
 }
 return values.length?{...selectionSummary(values,line,side),line,side}:null;
}
