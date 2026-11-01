import {finiteStat} from './selectionStats';
import {isDate,TEAMS} from './ticketReader/model';
import {getOpponent} from './playerUtils';

export const DEFENSE_MARKETS={pts:'Puntos',reb:'Rebotes',ast:'Asistencias',fg3m:'Triples anotados',fga:'Tiros de campo intentados',fg3a:'Triples intentados',fta:'Tiros libres intentados',fgm:'Tiros de campo anotados',ftm:'Tiros libres anotados',oreb:'Rebotes ofensivos',dreb:'Rebotes defensivos',stl:'Robos',blk:'Tapones',tov:'Pérdidas',pf:'Faltas',pra:'PRA',pr:'Puntos + rebotes',pa:'Puntos + asistencias',ra:'Rebotes + asistencias'} as const;
export type DefenseMarket=keyof typeof DEFENSE_MARKETS;
export type DefenseGroup='ALL'|'G'|'F'|'C';
export type DefenseBand='all'|'high'|'middle'|'low';
export const DEFENSE_GROUPS:Record<DefenseGroup,string>={ALL:'Todos',G:'Bases y escoltas',F:'Aleros y ala-pívots',C:'Pívots'};
export const DEFENSE_BANDS:Record<DefenseBand,string>={all:'Todas',high:'Permiten más · 1–10',middle:'Intermedias · 11–20',low:'Permiten menos · 21–30'};
export type DefenseSettings={market:DefenseMarket;season:string;asOfDate:string;phase:'ALL'|'Regular Season'|'Playoffs';window:'season'|'10'|'20';opponent:string|null;position:DefenseGroup};
type Row=Record<string,any>;
export type DefenseRank={team:string;allowed:number|null;games:number;total:number;missing:number;leagueAverage:number|null;diffPct:number|null;rank:number|null;rankedTeams:number;first:string|null;last:string|null};
export type DefenseRecent={id:string;playerId:number;name:string;team:string;position:DefenseGroup|null;date:string;minutes:number;value:number|null;baseline:number|null;venue:string|null};
export type DefenseReport={ok:true;available:boolean;reason?:string;archiveId:string|null;settings:DefenseSettings;seasons:string[];through:string|null;source:string;positionSource:string;minGames:number;rankings:Record<DefenseGroup,DefenseRank[]>;recent:DefenseRecent[];recentAvailable:boolean};

export function defenseMarket(value:unknown):DefenseMarket|null{
 const text=String(value??'').toLowerCase(),alias:Record<string,string>={'3pt':'fg3m','3pm':'fg3m','3pa':'fg3a','3pta':'fg3a'};
 const key=Object.hasOwn(alias,text)?alias[text]:text;
 return Object.hasOwn(DEFENSE_MARKETS,key)?key as DefenseMarket:null;
}
export function defensePosition(value:unknown):DefenseGroup|null{
 const p=String(value??'').trim().toUpperCase(),words:Record<string,DefenseGroup>={PG:'G',SG:'G',SF:'F',PF:'F',GUARD:'G',FORWARD:'F',CENTER:'C',CENTRE:'C','POINT GUARD':'G','SHOOTING GUARD':'G','SMALL FORWARD':'F','POWER FORWARD':'F'};
 if(p==='ALL')return 'ALL';if(Object.hasOwn(words,p))return words[p];
 const parts=p.split(/[-/]/).map(v=>v.trim()).map(v=>Object.hasOwn(words,v)?words[v]:['G','F','C'].includes(v)?v as DefenseGroup:null);
 return parts.length<=2&&parts.every(Boolean)?parts[0]:null;
}
export function defenseSeason(date:string){const year=Number(date.slice(0,4))-(Number(date.slice(5,7))<10?1:0);return `${year}-${String(year+1).slice(-2)}`;}
export function defenseSettings(raw:Record<string,unknown>,defaultDate:string):DefenseSettings|null{
 const market=defenseMarket(raw.market??'pts'),asOfDate=raw.asOfDate??defaultDate,position=defensePosition(raw.position??'ALL');
 if(!market||!position||!isDate(asOfDate)||asOfDate<'2010-01-01'||asOfDate>'2040-01-01')return null;
 const season=raw.season??defenseSeason(asOfDate),phase=raw.phase??'Regular Season',window=raw.window??'season';
 if(typeof season!=='string'||!/^20\d{2}-\d{2}$/.test(season)||String(Number(season.slice(0,4))+1).slice(-2)!==season.slice(-2)||!['ALL','Regular Season','Playoffs'].includes(String(phase))||!['season','10','20'].includes(String(window)))return null;
 const opponent=raw.opponent===undefined||raw.opponent===null||raw.opponent===''?null:String(raw.opponent).toUpperCase();
 if(opponent&&!TEAMS.includes(opponent))return null;
 return {market,position,season,phase:phase as DefenseSettings['phase'],window:window as DefenseSettings['window'],asOfDate,opponent};
}
export function defenseValue(values:unknown,market:DefenseMarket):number|null{
 if(!values||typeof values!=='object'||Array.isArray(values))return null;
 const fields:Record<string,string[]>={pra:['pts','reb','ast'],pr:['pts','reb'],pa:['pts','ast'],ra:['reb','ast']};
 const parts=(fields[market]??[market]).map(k=>finiteStat((values as Row)[k]));
 return parts.every(n=>n!==null)?parts.reduce<number>((s,n)=>s+n!,0):null;
}
export function defenseRankings(raw:unknown,settings:DefenseSettings):Record<DefenseGroup,DefenseRank[]>{
 const source=Array.isArray(raw)?raw:[],unique=new Map<string,Row>(),conflicts=new Set<string>();
 for(const row of source){
  if(!row||typeof row!=='object'||!TEAMS.includes(row.team)||!isDate(row.date)||row.date>=settings.asOfDate||row.season!==settings.season||!['Regular Season','Playoffs'].includes(row.phase)||settings.phase!=='ALL'&&row.phase!==settings.phase||!/^\d{1,10}$/.test(String(row.id))||Number(row.id)<=0)continue;
  const k=row.team+':'+Number(row.id),normalized={...row,id:String(Number(row.id))},prior=unique.get(k);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(normalized))conflicts.add(k);else unique.set(k,normalized);
 }
 const groups={} as Record<DefenseGroup,DefenseRank[]>;
 for(const group of Object.keys(DEFENSE_GROUPS) as DefenseGroup[]){
  let leagueSum=0,leagueCount=0;
  const rows=TEAMS.map(team=>{
   const games=[...unique.entries()].filter(([key,r])=>!conflicts.has(key)&&r.team===team).map(([,r])=>r).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.id)-Number(a.id));
   const chosen=settings.window==='season'?games:games.slice(0,Number(settings.window)),valid=chosen.map(r=>defenseValue(r.groups?.[group],settings.market)).filter((v):v is number=>v!==null);
   leagueSum+=valid.reduce((s,n)=>s+n,0);leagueCount+=valid.length;
   return {team,allowed:valid.length?valid.reduce((s,n)=>s+n,0)/valid.length:null,games:valid.length,total:chosen.length,missing:chosen.length-valid.length,leagueAverage:null,diffPct:null,rank:null,rankedTeams:0,first:chosen.at(-1)?.date??null,last:chosen[0]?.date??null} as DefenseRank;
  });
  const league=leagueCount?leagueSum/leagueCount:null,eligible=rows.filter(r=>r.games>=5&&r.allowed!==null).sort((a,b)=>b.allowed!-a.allowed!||a.team.localeCompare(b.team));
  for(const row of rows){row.leagueAverage=league;row.diffPct=row.allowed!==null&&league!==null&&league>0?(row.allowed/league-1)*100:null;row.rankedTeams=eligible.length;if(row.games>=5&&row.allowed!==null)row.rank=1+eligible.filter(r=>r.allowed!>row.allowed!+1e-8).length;}
  groups[group]=rows;
 }return groups;
}
export function rankFor(report:DefenseReport|null|undefined,team:string,position:unknown){const group=defensePosition(position);return group&&report?.available?report.rankings?.[group]?.find(r=>r.team===team)??null:null;}
export function rankBand(row:DefenseRank|null|undefined):Exclude<DefenseBand,'all'>|null{
 if(!row||row.rank===null||row.rankedTeams!==30)return null;return row.rank<=10?'high':row.rank<=20?'middle':'low';
}
export function filterDefense<T extends Row>(rows:T[],report:DefenseReport|null|undefined,position:DefenseGroup,band:DefenseBand):T[]{
 if(band==='all')return rows;
 if(!report?.available)return [];
 return rows.filter(row=>rankBand(rankFor(report,getOpponent(row),position))===band);
}
export function recentDefenders(raw:unknown,settings:DefenseSettings):DefenseRecent[]{
 if(!Array.isArray(raw))return [];
 const unique=new Map<string,DefenseRecent>(),conflicts=new Set<string>();
 for(const row of raw){
  if(!row||row.opponent!==settings.opponent||row.season!==settings.season||!isDate(row.date)||row.date>=settings.asOfDate||!['Regular Season','Playoffs'].includes(row.phase)||settings.phase!=='ALL'&&row.phase!==settings.phase||!TEAMS.includes(row.team)||!Number.isSafeInteger(row.playerId)||row.playerId<=0||!/^\d{1,10}$/.test(String(row.id)))continue;
  const position=defensePosition(row.position),minutes=finiteStat(row.minutes);if(minutes===null||minutes<15||settings.position!=='ALL'&&position!==settings.position)continue;
  const item:DefenseRecent={id:String(Number(row.id)),playerId:row.playerId,name:String(row.name).slice(0,100),team:row.team,position,date:row.date,minutes,value:defenseValue(row.values,settings.market),baseline:['pra','pr','pa','ra'].includes(settings.market)?finiteStat(row.baseline?.[settings.market]):defenseValue(row.baseline,settings.market),venue:row.venue==='HOME'||row.venue==='AWAY'?row.venue:null};
  const key=item.id+':'+item.playerId,prior=unique.get(key);if(prior&&JSON.stringify(prior)!==JSON.stringify(item))conflicts.add(key);else unique.set(key,item);
 }
 return [...unique.entries()].filter(([key])=>!conflicts.has(key)).map(([,v])=>v).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.id)-Number(a.id)||b.minutes-a.minutes).slice(0,30);
}

export function defenseUrlChoice(q:URLSearchParams):{season:string|null;window:'season'|'10'|'20'|null;position:DefenseGroup|null;band:DefenseBand}{
 const season=q.get('defSeason'),window=q.get('defWindow'),position=defensePosition(q.get('defPosition')),band=q.get('defBand');
 return {season:season&&/^20\d{2}-\d{2}$/.test(season)&&String(Number(season.slice(0,4))+1).slice(-2)===season.slice(-2)?season:null,window:window==='10'||window==='20'||window==='season'?window:null,position,band:band&&Object.hasOwn(DEFENSE_BANDS,band)?band as DefenseBand:'all' as DefenseBand};
}
