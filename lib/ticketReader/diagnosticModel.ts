import {sanitizeQuoteDiagnostic,QUOTE_REASONS} from './quoteDiagnostic';
import {isDate,MARKETS,SCOPES,TEAMS} from './model';

export const READER_VERSION=5;
export const REPORT_BYTES=2048;
export const REPORT_DAYS=14;
export const REPORT_LIMIT=1000;
export type ReportStage='read'|'identity'|'analyze'|'health'|'client';
export type ReportOutcome='ok'|'review'|'error';
export type ReaderReport={id:string;traceId:string;version:5;at:string;stage:ReportStage;outcome:ReportOutcome;code:string;data:Record<string,unknown>};
const codes=new Set(['READ_OK','READ_REVIEW','READ_EMPTY','READ_FAILED','OCR_FAILED','INPUT_INVALID','IDENTITY_OK','NAME_REVIEW','PLAYER_REVIEW','TEAM_REVIEW','ANALYSIS_OK','NO_HISTORY','FILTERED_OUT','MISSING_PERIOD','QUOTE_UNAVAILABLE','HEALTH_OK','HEALTH_PARTIAL','NETWORK_ERROR','UI_ERROR','CLIENT_ERROR','USER_REPORTED','INTERNAL_ERROR','ARCHIVE_CONFIG','ARCHIVE_INVALID','ARCHIVE_EMPTY','ARCHIVE_HASH','ARCHIVE_HTTP','ARCHIVE_ACCESS','ARCHIVE_CONNECTION','ARCHIVE_COUNT','ARCHIVE_NETWORK','ARCHIVE_TIMEOUT','PERIODS_UNAVAILABLE','ARCHIVE_CHANGED','QUOTE_NOT_FOUND']);
export const validId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const number=(v:unknown,max=1_000_000)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:undefined;
const choice=(v:unknown,values:readonly string[])=>typeof v==='string'&&values.includes(v)?v:undefined;
function name(v:unknown){if(typeof v!=='string')return undefined;const s=v.trim().slice(0,70);return /^[\p{L} .,'’\-]+$/u.test(s)&&!/(?:bearer|password|secret|token|apikey|https?|postgres)/i.test(s)?s:undefined;}
function sample(value:unknown){const s=object(value);return {playerName:name(s.playerName??s.name),canonicalName:name(s.canonicalName),playerId:number(s.playerId,2147483647),teams:Array.isArray(s.teams)?s.teams.filter(x=>TEAMS.includes(x)).slice(0,2):undefined,market:choice(s.market,Object.keys(MARKETS)),operator:choice(s.operator,['over','under','at_least','at_most']),line:number(s.line,300),scope:choice(s.scope,Object.keys(SCOPES)),teamStatus:choice(s.teamStatus,['matched','conflict','ambiguous','not_found','unavailable','not_checked']),referenceTeam:typeof s.referenceTeam==='string'&&TEAMS.includes(s.referenceTeam)?s.referenceTeam:undefined,identityStatus:choice(s.identityStatus??s.status,['exact','suggested','ambiguous','not_found','invalid']),candidateIds:Array.isArray(s.candidateIds)?s.candidateIds.filter(v=>number(v,2147483647)!==undefined).slice(0,3):undefined};}
export function reportData(value:unknown):Record<string,unknown>{
 const s=object(value),data:Record<string,unknown>={...sample(s),source:choice(s.source,['image','text','manual','json']),book:choice(s.book,['stake','betano','bet365','unknown']),eventDate:isDate(s.eventDate)?s.eventDate:undefined,phase:choice(s.phase,['ALL','Regular Season','Playoffs']),seasons:choice(s.seasons,['last2','current','all']),quoteReason:choice(s.quoteReason,QUOTE_REASONS),coverage:choice(s.coverage,['ready','no_history','filtered_out','missing_period']),quoteStatus:choice(s.quoteStatus,['matched','not_found','unavailable','inactive','conflict']),archiveId:typeof s.archiveId==='string'&&/^[a-f0-9]{64}$/.test(s.archiveId)?s.archiveId:undefined};
 for(const key of ['filesCount','legCount','textLength','confidence','gamesCount','missingCount','facts','reviewCount','quotePlayerRows','quoteDateRows','quoteEventRows','quoteMarketRows','quoteScopeRows','quoteLineRows']){const n=number(s[key]);if(n!==undefined)data[key]=n;}
 for(const key of ['healthy','periodsOk','quotesOk','periodsRows','quotesRows'])if(typeof s[key]==='boolean')data[key]=s[key];
 if(Array.isArray(s.last10Values))data.last10Values=s.last10Values.slice(0,10).map(v=>v===null?null:number(v,500)??null);
 if(Array.isArray(s.items))data.items=s.items.slice(0,4).map(sample);
 data.errorKind=choice(s.errorKind,['Error','TypeError','ReferenceError','RangeError','SyntaxError','AggregateError','UnknownError']);
 const clean=JSON.parse(JSON.stringify(data));
 while(new TextEncoder().encode(JSON.stringify(clean)).length>REPORT_BYTES&&clean.items?.length)clean.items.pop();
 if(new TextEncoder().encode(JSON.stringify(clean)).length>REPORT_BYTES)delete clean.items;
 return clean;
}
export function sanitizeReport(value:unknown,now=new Date()):ReaderReport|null {
 const s=object(value);if(!validId(s.id)||!validId(s.traceId))return null;
 const stage=choice(s.stage,['read','identity','analyze','health','client']) as ReportStage|undefined,outcome=choice(s.outcome,['ok','review','error']) as ReportOutcome|undefined;
 const at=typeof s.at==='string'?Date.parse(s.at):NaN;
 if(!stage||!outcome||!Number.isFinite(at)||at>now.getTime()+300000||at<now.getTime()-REPORT_DAYS*86400000)return null;
 return {id:s.id,traceId:s.traceId,version:5,at:new Date(at).toISOString(),stage,outcome,code:typeof s.code==='string'&&codes.has(s.code)?s.code:'INTERNAL_ERROR',data:reportData(s.data)};
}
export function apiReport(body:Record<string,unknown>,response:Record<string,unknown>):ReaderReport {
 const stage:ReportStage=!body.action?'client':body.action==='resolve'||body.action==='players'?'identity':body.action==='health'?'health':'analyze';
 const leg=object(body.leg),settings=object(body.settings),result=object(response.result),connection=object(response.connection),archive=object(connection.archive);
 const reviews=Array.isArray(response.reviews)?response.reviews.map(object):[];
 const issues=reviews.filter(r=>r.status!=='exact'||object(r.teamContext).status==='conflict');
 const partialHealth=stage==='health'&&(!object(connection.periods).ok||!object(connection.quotes).ok||!object(connection.periods).hasRows||!object(connection.quotes).hasRows);
 const emptySearch=body.action==='players'&&Array.isArray(response.candidates)&&response.candidates.length===0;
 const code=response.code||(!response.ok?'INTERNAL_ERROR':stage==='health'?(partialHealth?'HEALTH_PARTIAL':'HEALTH_OK'):stage==='identity'?(reviews.some(r=>object(r.teamContext).status==='conflict')?'TEAM_REVIEW':issues.length||emptySearch?'NAME_REVIEW':'IDENTITY_OK'):result.coverage==='no_history'?'NO_HISTORY':result.coverage==='filtered_out'?'FILTERED_OUT':result.coverage==='missing_period'?'MISSING_PERIOD':object(result.quote).status==='unavailable'?'QUOTE_UNAVAILABLE':object(result.quote).status==='not_found'?'QUOTE_NOT_FOUND':'ANALYSIS_OK');
 const actualCode=response.needsPlayer?'PLAYER_REVIEW':response.needsTeam?'TEAM_REVIEW':code;
 const games=Array.isArray(result.games)?result.games.map(object):[];
 const data={...leg,...settings,playerName:leg.playerName??body.name,teams:leg.teams??body.teams,canonicalName:object(result.player).name,playerId:object(result.player).id??leg.playerId,coverage:result.coverage,archiveId:result.archiveId??archive.id,quoteStatus:object(result.quote).status,quoteReason:sanitizeQuoteDiagnostic(object(result.quote).diagnostic).reason,quotePlayerRows:object(object(object(result.quote).diagnostic).counts).player,quoteDateRows:object(object(object(result.quote).diagnostic).counts).date,quoteEventRows:object(object(object(result.quote).diagnostic).counts).event,quoteMarketRows:object(object(object(result.quote).diagnostic).counts).market,quoteScopeRows:object(object(object(result.quote).diagnostic).counts).scope,quoteLineRows:object(object(object(result.quote).diagnostic).counts).line,gamesCount:Array.isArray(result.games)?games.length:undefined,missingCount:games.slice(0,10).filter(g=>g.value===null).length,last10Values:games.slice(0,10).map(g=>g.value),healthy:archive.ok,periodsOk:object(connection.periods).ok,quotesOk:object(connection.quotes).ok,periodsRows:object(connection.periods).hasRows,quotesRows:object(connection.quotes).hasRows,facts:archive.facts,reviewCount:issues.length,items:[...issues,...reviews.filter(r=>r.status==='exact')].slice(0,4).map(r=>({name:r.originalName,status:r.status,teamStatus:object(r.teamContext).status,referenceTeam:object(r.teamContext).team,teams:Array.isArray(body.items)?object(body.items.find(x=>object(x).id===r.id)).teams:undefined,canonicalName:object(r.player).name,playerId:object(r.player).id,candidateIds:Array.isArray(r.candidates)?r.candidates.map(c=>object(c).id):[]}))};
 return sanitizeReport({id:validId(body.reportId)?body.reportId:crypto.randomUUID(),traceId:validId(body.traceId)?body.traceId:crypto.randomUUID(),at:new Date().toISOString(),stage,outcome:response.needsPlayer||response.needsTeam||issues.length||emptySearch||['NO_HISTORY','FILTERED_OUT','MISSING_PERIOD','QUOTE_UNAVAILABLE','QUOTE_NOT_FOUND','HEALTH_PARTIAL'].includes(String(actualCode))?'review':response.ok?'ok':'error',code:actualCode,data})!;
}
