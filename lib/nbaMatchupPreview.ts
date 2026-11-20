import {finiteStat} from './selectionStats';
export type MatchupGameRow={team:string;id:string;date:string;data:Record<string,unknown>;opponent:Record<string,unknown>|null};
export type TeamMatchupPreview={team:string;games:number;points:number|null;possessions:number|null;paceGames:number;lastDate:string|null;restDays:number|null;backToBack:boolean|null};
export function summarizeMatchupTeam(raw:MatchupGameRow[],team:string,date:string):TeamMatchupPreview{
 const unique=new Map<string,MatchupGameRow>();
 for(const row of [...raw].sort((a,b)=>b.date.localeCompare(a.date))){if(row.team!==team||row.date>=date||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!/^\d{1,15}$/.test(row.id)||unique.has(String(Number(row.id))))continue;unique.set(String(Number(row.id)),row);}
 const rows=[...unique.values()].slice(0,10),points=rows.map(row=>finiteStat(row.data.pts)).filter((n):n is number=>n!==null),pace:number[]=[];
 for(const row of rows){if(!row.opponent)continue;const terms=[row.data,row.opponent].map(r=>['fga','fta','oreb','tov'].map(k=>finiteStat(r[k])));if(terms.some(values=>values.some(n=>n===null)))continue;const possessions=terms.reduce((sum,t)=>sum+t[0]!+.44*t[1]!-t[2]!+t[3]!,0)/2;if(possessions>0)pace.push(possessions);}
 const lastDate=rows[0]?.date??null,gap=lastDate?(Date.parse(date+'T12:00:00Z')-Date.parse(lastDate+'T12:00:00Z'))/86400000:null,restDays=gap!==null&&gap>=1?Math.floor(gap)-1:null;
 return {team,games:rows.length,points:points.length?points.reduce((s,n)=>s+n,0)/points.length:null,possessions:pace.length?pace.reduce((s,n)=>s+n,0)/pace.length:null,paceGames:pace.length,lastDate,restDays,backToBack:restDays===null?null:restDays===0};
}
