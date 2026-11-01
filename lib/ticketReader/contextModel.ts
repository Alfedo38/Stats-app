import {isDate,TEAMS,type Leg,type Scope,type Market} from './model';

export type MedicalState='OUT'|'QUESTIONABLE'|'DOUBTFUL'|'PROBABLE'|'AVAILABLE'|'UNKNOWN';
export type DefenseSample={season:string;position:'ALL'|'G'|'F'|'C';games:number;total:number;rank:number|null;rankedTeams:number;allowed:number|null;leagueAverage:number|null;diffPct:number|null;through:string|null};
export type MedicalItem={playerId:number;name:string;state:MedicalState;date:string;reportDate:string|null;stale:boolean};
export type SelectionContext={version:1;archiveId:string;playerId:number;team:string;opponent:string;eventDate:string;scope:Scope;market:Market;
 defense:{status:'ready'|'small_sample'|'unavailable'|'unsupported';reference:DefenseSample|null;currentSeason:string;currentGames:number;usesPrevious:boolean;reason:'OK'|'NO_SNAPSHOT'|'NO_POSITION'|'SMALL_SAMPLE'|'MARKET_UNSUPPORTED'|'READ_FAILED';source:'nba_archive'};
 injuries:{status:'known'|'not_reported'|'unavailable'|'historical'|'unverified_event';player:MedicalItem|null;teammates:MedicalItem[];additional:number;source:'nba_report_cache'};};
type Row=Record<string,unknown>;
const object=(v:unknown):Row|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Row:null;
const integer=(v:unknown,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max?v:null;
const decimal=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:null;
const season=(v:unknown):v is string=>typeof v==='string'&&/^20\d{2}-\d{2}$/.test(v)&&String(Number(v.slice(0,4))+1).slice(-2)===v.slice(-2);
function medical(value:unknown,eventDate:string):MedicalItem|null{
 const row=object(value);if(!row)return null;
 const pid=integer(row.playerId,2147483647),name=typeof row.name==='string'?row.name.trim().replace(/\s+/g,' '):'';
 if(!pid||!name||name.length>70||!/^['’\p{L} .,-]+$/u.test(name)||/(?:bearer|password|secret|token|apikey|https?|postgres)/i.test(name)||!['OUT','QUESTIONABLE','DOUBTFUL','PROBABLE','AVAILABLE','UNKNOWN'].includes(String(row.state))||row.date!==eventDate||row.reportDate!==null&&(!isDate(row.reportDate)||row.reportDate>eventDate)||typeof row.stale!=='boolean')return null;
 return {playerId:pid,name,state:row.state as MedicalState,date:eventDate,reportDate:row.reportDate as string|null,stale:row.stale};
}
/** Audit fields are allowlisted. Free-form server errors, URLs and OCR never survive. */
export function sanitizeSelectionContext(value:unknown,leg:Leg,archiveId:string):SelectionContext|null{
 const c=object(value),d=object(c?.defense),i=object(c?.injuries);
 if(!c||!d||!i||c.version!==1||c.archiveId!==archiveId||c.playerId!==leg.playerId||c.team!==leg.playerTeam||!TEAMS.includes(String(c.team))||c.opponent!==leg.teams.find(t=>t!==leg.playerTeam)||c.eventDate!==leg.eventDate||c.scope!==leg.scope||c.market!==leg.market)return null;
 if(!['ready','small_sample','unavailable','unsupported'].includes(String(d.status))||!['OK','NO_SNAPSHOT','NO_POSITION','SMALL_SAMPLE','MARKET_UNSUPPORTED','READ_FAILED'].includes(String(d.reason))||!season(d.currentSeason)||integer(d.currentGames,5000)===null||typeof d.usesPrevious!=='boolean')return null;
 let reference:DefenseSample|null=null;
 if(d.reference!==null){const r=object(d.reference);if(!r||!season(r.season)||!['ALL','G','F','C'].includes(String(r.position)))return null;
  const games=integer(r.games,5000),total=integer(r.total,5000),rankedTeams=integer(r.rankedTeams,30),rank=r.rank===null?null:integer(r.rank,30),allowed=r.allowed===null?null:decimal(r.allowed,2000),leagueAverage=r.leagueAverage===null?null:decimal(r.leagueAverage,2000);
  if(games===null||total===null||games>total||rankedTeams===null||r.rank!==null&&(!rank||rank>rankedTeams||games<5)||r.allowed!==null&&allowed===null||r.leagueAverage!==null&&leagueAverage===null||r.through!==null&&(!isDate(r.through)||r.through>=leg.eventDate)||games===0&&allowed!==null||games>0&&allowed===null)return null;
  const diffPct=allowed!==null&&leagueAverage!==null&&leagueAverage>0?(allowed/leagueAverage-1)*100:null;
  reference={season:r.season,position:r.position as DefenseSample['position'],games,total,rank,rankedTeams,allowed,leagueAverage,diffPct,through:r.through as string|null};
 }
 const year=Number(leg.eventDate.slice(0,4))-(Number(leg.eventDate.slice(5,7))<10?1:0);
 if(d.currentSeason!==`${year}-${String(year+1).slice(-2)}`)return null;
 const usesPrevious=!!reference&&reference.season!==d.currentSeason;
 if(usesPrevious!==d.usesPrevious||usesPrevious&&(d.currentGames as number)>=5||['unavailable','unsupported'].includes(String(d.status))&&reference!==null||reference&&Number(reference.season.slice(0,4))!==Number(d.currentSeason.slice(0,4))-(usesPrevious?1:0)||d.status==='ready'&&(!reference||reference.games<5)||d.status==='small_sample'&&(!reference||reference.games>=5||reference.games<1)||reference&&!usesPrevious&&reference.games!==d.currentGames)return null;
 if(!['known','not_reported','unavailable','historical','unverified_event'].includes(String(i.status))||!Array.isArray(i.teammates)||i.teammates.length>3||integer(i.additional,100)===null)return null;
 const player=i.player===null?null:medical(i.player,leg.eventDate),teammates=i.teammates.map(v=>medical(v,leg.eventDate));
 if(i.status==='known'&&!player&&!teammates.length||i.player!==null&&(!player||player.playerId!==leg.playerId)||teammates.some(p=>!p||p.playerId===leg.playerId)||new Set(teammates.map(p=>p!.playerId)).size!==teammates.length||i.status!=='known'&&(player||teammates.length||i.additional!==0))return null;
 return {version:1,archiveId,playerId:leg.playerId!,team:leg.playerTeam!,opponent:c.opponent as string,eventDate:leg.eventDate,scope:leg.scope,market:leg.market!,
  defense:{status:d.status as SelectionContext['defense']['status'],reference,currentSeason:d.currentSeason,currentGames:d.currentGames as number,usesPrevious,reason:d.reason as SelectionContext['defense']['reason'],source:'nba_archive'},
  injuries:{status:i.status as SelectionContext['injuries']['status'],player,teammates:teammates as MedicalItem[],additional:i.additional as number,source:'nba_report_cache'}};
}
