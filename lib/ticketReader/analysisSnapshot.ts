import {outcome, reviewLeg, seasonOf, summarize, ticketObservations} from './analysis';
import {reportData, validId} from './diagnosticModel';
import {isDate, MARKETS, SCOPES, TEAMS, type Game, type IdentityReview, type Leg, type PlayerOption, type Result, type Settings, type TicketDocument} from './model';

export const ANALYSIS_BYTES = 192 * 1024;
export const ANALYSIS_DAYS = 14;
export const ANALYSIS_LIMIT = 100;
export const ANALYSIS_TOTAL_BYTES = 2 * 1024 * 1024;
export type AnalysisEntry = {identity?:IdentityReview; result?:Result; candidates?:PlayerOption[]; error?:string; code?:string; needsTeam?:boolean; needsPlayer?:boolean};
type Row = Record<string, unknown>;
type Summary = ReturnType<typeof summarize>;
const issueCodes = ['INPUT_INCOMPLETE','PLAYER_REVIEW','TEAM_REVIEW','ANALYSIS_ERROR','NETWORK_ERROR','ARCHIVE_CONFIG','ARCHIVE_INVALID','ARCHIVE_EMPTY','ARCHIVE_HASH','ARCHIVE_HTTP','ARCHIVE_ACCESS','ARCHIVE_CONNECTION','ARCHIVE_COUNT','ARCHIVE_NETWORK','ARCHIVE_TIMEOUT','PERIODS_UNAVAILABLE','NO_HISTORY','FILTERED_OUT','MISSING_PERIOD','MISSING_VALUES','QUOTE_UNAVAILABLE','QUOTE_NOT_FOUND','QUOTE_INACTIVE','QUOTE_CONFLICT','SMALL_RECENT_SAMPLE','SMALL_OPPONENT_SAMPLE','UNSUPPORTED_MARKET','MULTIPLE_ARCHIVE_VERSIONS'] as const;
function object(value:unknown):Row {if(!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_ANALYSIS'); return value as Row;}
function choice<T extends string>(value:unknown, values:readonly T[]):T {if(typeof value !== 'string' || !values.includes(value as T)) throw Error('INVALID_ANALYSIS'); return value as T;}
function number(value:unknown, max:number, nullable=false):number|null {if(nullable && value === null)return null; if(typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)throw Error('INVALID_ANALYSIS'); return value;}
function integer(value:unknown,max:number):number {const n=number(value,max)!;if(!Number.isInteger(n))throw Error('INVALID_ANALYSIS');return n;}
function team(value:unknown):string|null {return typeof value === 'string' && TEAMS.includes(value) ? value : null;}
function name(value:unknown):string {return reportData({playerName:value}).playerName as string || '';}
function price(value:unknown):number|null {const n=number(value ?? null,1_000_000,true);if(n!==null && n<=1)throw Error('INVALID_ANALYSIS');return n;}
function stamp(value:unknown):string {if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('INVALID_ANALYSIS');return new Date(value).toISOString();}
function cleanSettings(value:unknown):Settings {const s=object(value);if(!isDate(s.eventDate))throw Error('INVALID_ANALYSIS');return {eventDate:s.eventDate,phase:choice(s.phase,['ALL','Regular Season','Playoffs']),seasons:choice(s.seasons,['last2','current','all']),minMinutes:number(s.minMinutes,60,true)};}

function selection(value:unknown, id:string, settings:Settings):Leg {
 const s=object(value);
 if(!Array.isArray(s.teams)||s.teams.length>2||s.teams.some(t=>!team(t))||new Set(s.teams).size!==s.teams.length)throw Error('INVALID_ANALYSIS');
 if(s.eventDate!==settings.eventDate)throw Error('INVALID_ANALYSIS');
 return {id,book:choice(s.book,['stake','betano','bet365','unknown']),group:typeof s.group==='string'&&/^\d+(?:\.\d+)*$/.test(s.group)&&s.group.length<=20?s.group:'1',playerName:name(s.playerName),playerId:s.playerId===undefined||s.playerId===null?undefined:integer(s.playerId,2147483647)||undefined,playerTeam:team(s.playerTeam)||undefined,teamConfirmed:s.teamConfirmed===true,teams:s.teams as string[],matchup:(s.teams as string[]).join(' – '),market:s.market===null?null:choice(s.market,Object.keys(MARKETS)) as Leg['market'],operator:s.operator===null?null:choice(s.operator,['over','under','at_least','at_most']) as Leg['operator'],line:number(s.line,300,true),scope:choice(s.scope,Object.keys(SCOPES)) as Leg['scope'],eventDate:settings.eventDate,odds:price(s.odds),groupOdds:price(s.groupOdds),raw:'',confirmed:false};
}
function incomplete(leg:Leg) {return !leg.playerName || !leg.market || !leg.operator || leg.line===null || leg.teams.length!==2;}
function cleanGames(value:unknown,max:number,settings:Settings):Game[] {
 if(!Array.isArray(value)||value.length>max)throw Error('INVALID_ANALYSIS');
 const seen=new Set<string>();
 return value.map(item=>{
  const g=object(item);
  if(typeof g.id!=='string'||!/^\d{1,15}$/.test(g.id)||!isDate(g.date)||g.date>=settings.eventDate)throw Error('INVALID_ANALYSIS');
  const id=g.id.replace(/^0+/,'');if(!id||seen.has(id))throw Error('INVALID_ANALYSIS');seen.add(id);
  const season=seasonOf(g.date),current=seasonOf(settings.eventDate),previous=seasonOf(`${Number(current.slice(0,4))-1}-10-01`);
  const phase=choice(g.phase,['Regular Season','Playoffs']);
  const minutes=number(g.minutes,100,true);
  if(g.season!==season || settings.phase!=='ALL'&&phase!==settings.phase || settings.seasons==='current'&&season!==current || settings.seasons==='last2'&&season!==current&&season!==previous || minutes===0 || settings.minMinutes!==null&&(minutes===null||minutes<settings.minMinutes))throw Error('INVALID_ANALYSIS');
  return {id,date:g.date,season,phase,team:team(g.team),opponent:team(g.opponent),minutes,value:number(g.value,500,true)};
 }).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
function aggregate(value:unknown):Summary {
 const s=object(value),requested=integer(s.requested,50000),n=integer(s.n,50000),hits=integer(s.hits,50000),misses=integer(s.misses,50000),pushes=integer(s.pushes,50000),missing=integer(s.missing,50000);
 if(n+missing!==requested||hits+misses+pushes!==n)throw Error('INVALID_ANALYSIS');
 const average=number(s.average,500,true),median=number(s.median,500,true),minutes=number(s.minutes,100,true);
 if(n===0&&(average!==null||median!==null)||n>0&&(average===null||median===null))throw Error('INVALID_ANALYSIS');
 return {requested,n,hits,misses,pushes,missing,rate:hits+misses?hits/(hits+misses):null,average,median,minutes};
}
function cleanQuote(value:unknown, leg:Leg) {
 const q=object(value),status=choice(q.status,['matched','not_found','unavailable','inactive','conflict']);
 if(status!=='matched')return {status,price:null,book:null,capturedAt:null,eventDate:null,line:null,side:null};
 const book=choice(q.book,['stake','betano','bet365','unknown']);
 if(book!==leg.book||!isDate(q.eventDate)||q.eventDate!==leg.eventDate)throw Error('INVALID_ANALYSIS');
 const matchedPrice=price(q.price);if(matchedPrice===null)throw Error('INVALID_ANALYSIS');
 return {status,price:matchedPrice,book,capturedAt:stamp(q.capturedAt),eventDate:q.eventDate,line:number(q.line,300),side:choice(q.side,['over','under','at_least','at_most'])};
}
function legSnapshot(value:unknown,position:number,settings:Settings) {
 const input=object(value);if(!validId(input.id))throw Error('INVALID_ANALYSIS');
 const leg=selection(input.selection,input.id,settings),identity=object(input.identity);
 const identityStatus=choice(identity.status,['exact','suggested','ambiguous','not_found','invalid','not_checked']);
 const candidates=Array.isArray(identity.candidates)?identity.candidates.slice(0,3).map(value=>{const p=object(value);return {id:integer(p.id,2147483647),name:name(p.name),team:team(p.team)};}):[];
 const codes:string[]=Array.isArray(input.issues)?input.issues.filter((c):c is string=>typeof c==='string'&&(issueCodes as readonly string[]).includes(c)):[];
 let history=null;
 if(input.history!==null && input.history!==undefined){
  if(incomplete(leg)||!leg.playerId||!leg.playerTeam||!leg.teams.includes(leg.playerTeam)||identityStatus!=='exact')throw Error('INVALID_ANALYSIS');
  const h=object(input.history);
  if(h.cutoffDate!==settings.eventDate||typeof h.archiveId!=='string'||!/^[a-f0-9]{64}$/.test(h.archiveId))throw Error('INVALID_ANALYSIS');
  const coverage=choice(h.coverage,['ready','no_history','filtered_out','missing_period']);
  const recentGames=cleanGames(object(h.recent).games,10,settings),opponent=leg.teams.find(t=>t!==leg.playerTeam)!;
  const opponentGames=cleanGames(object(h.versusOpponent).games,5,settings);
  if(opponentGames.some(g=>g.opponent!==opponent))throw Error('INVALID_ANALYSIS');
  const all=new Map(recentGames.map(g=>[g.id,g]));
  for(const g of opponentGames){const old=all.get(g.id);if(old&&JSON.stringify(old)!==JSON.stringify(g))throw Error('INVALID_ANALYSIS');all.set(g.id,g);}
  const availableGames=integer(h.availableGames,50000),currentSeason=aggregate(h.currentSeason);
  if(availableGames<all.size||currentSeason.requested>availableGames || recentGames.length!==Math.min(10,availableGames) || coverage==='no_history'&&availableGames!==0 || coverage==='filtered_out'&&availableGames!==0 || coverage==='ready'&&!availableGames || coverage==='missing_period'&&[...all.values()].some(g=>g.value!==null))throw Error('INVALID_ANALYSIS');
  const withOutcome=(games:Game[])=>games.map(g=>({...g,outcome:outcome(g.value,leg.line!,leg.operator!),distanceToLine:g.value===null?null:g.value-leg.line!}));
  const recent=summarize(recentGames,leg.line!,leg.operator!);
  if(coverage!=='ready')codes.push(coverage==='no_history'?'NO_HISTORY':coverage==='filtered_out'?'FILTERED_OUT':'MISSING_PERIOD');
  if(recent.missing)codes.push('MISSING_VALUES');
  if(recent.n<5)codes.push('SMALL_RECENT_SAMPLE');
  if(opponentGames.filter(g=>g.value!==null).length<5)codes.push('SMALL_OPPONENT_SAMPLE');
  history={cutoffDate:settings.eventDate,source:'NBA archive reported by reader',archiveId:h.archiveId,coverage,availableGames,recent:{target:10,summary:recent,games:withOutcome(recentGames)},last5:summarize(recentGames.slice(0,5),leg.line!,leg.operator!),versusOpponent:{opponent,target:5,summary:summarize(opponentGames,leg.line!,leg.operator!),games:withOutcome(opponentGames)},currentSeason,nearbyLines:[leg.line!-1,leg.line!,leg.line!+1].filter(n=>n>=0).map(line=>({line,operator:leg.operator,summary:summarize(recentGames,line,leg.operator!)}))};
 }
 if(incomplete(leg))codes.push('INPUT_INCOMPLETE');
 if(identityStatus!=='exact')codes.push('PLAYER_REVIEW');
 const quote=cleanQuote(input.quote??{status:'not_found'},leg);
 if(quote.status!=='matched')codes.push(({unavailable:'QUOTE_UNAVAILABLE',not_found:'QUOTE_NOT_FOUND',inactive:'QUOTE_INACTIVE',conflict:'QUOTE_CONFLICT'} as const)[quote.status]);
 const selectedPrice=leg.odds??quote.price;
 const status=history?'analyzed':codes.some(c=>c==='NETWORK_ERROR'||c==='ANALYSIS_ERROR'||c.startsWith('ARCHIVE_')||c==='PERIODS_UNAVAILABLE')?'error':'review';
 return {id:leg.id,position,selection:{book:leg.book,group:leg.group,playerName:leg.playerName,playerId:leg.playerId??null,playerTeam:leg.playerTeam??null,teamConfirmed:!!leg.teamConfirmed,teams:leg.teams,market:leg.market,operator:leg.operator,line:leg.line,scope:leg.scope,eventDate:leg.eventDate,odds:leg.odds,groupOdds:leg.groupOdds},identity:{status:identityStatus,inputName:name(identity.inputName),canonicalName:identityStatus==='exact'?leg.playerName:null,candidates},status,issues:[...new Set(codes)],history,quote,breakEven:{individualPrice:selectedPrice,source:leg.odds!==null?'ticket':quote.status==='matched'?'market':null,decidedRate:selectedPrice?1/selectedPrice:null,assumption:'standard settlement; pushes excluded; no commission'}};
}

/** A bounded observation of one click on Analyze. It contains no image or raw OCR. */
export function sanitizeAnalysis(value:unknown,now=new Date()) {
 try{
  const input=object(value);
  if(input.schema!=='nba-ticket-analysis'||input.version!==1||input.readerVersion!==6||!validId(input.id)||!validId(input.traceId))return null;
  const startedAt=stamp(input.startedAt),completedAt=stamp(input.completedAt),start=Date.parse(startedAt),end=Date.parse(completedAt);
  if(start>end||end>now.getTime()+300000||start<now.getTime()-ANALYSIS_DAYS*86400000)return null;
  const settings=cleanSettings(input.settings);
  if(!Array.isArray(input.legs)||!input.legs.length||input.legs.length>40)return null;
  const legs=input.legs.map((value,i)=>legSnapshot(value,i+1,settings));
  if(new Set(legs.map(l=>l.id)).size!==legs.length)return null;
  const unsupported=integer(input.unsupportedSelections??0,100),rootIssues=Array.isArray(input.issues)?input.issues.filter((c):c is string=>typeof c==='string'&&(issueCodes as readonly string[]).includes(c)):[];
  if(unsupported)rootIssues.push('UNSUPPORTED_MARKET');
  const archiveIds=[...new Set(legs.flatMap(l=>l.history?[l.history.archiveId]:[]))];
  if(archiveIds.length>1)rootIssues.push('MULTIPLE_ARCHIVE_VERSIONS');
  const counts={total:legs.length,analyzed:legs.filter(l=>l.status==='analyzed').length,ready:legs.filter(l=>l.history?.coverage==='ready').length,review:legs.filter(l=>l.status==='review').length,error:legs.filter(l=>l.status==='error').length};
  const status=counts.analyzed===0?(counts.error===legs.length?'error':'review'):counts.ready===legs.length&&!rootIssues.length?'complete':'partial';
  const report={schema:'nba-ticket-analysis' as const,version:1 as const,readerVersion:6 as const,id:input.id,traceId:input.traceId,startedAt,completedAt,collection:{source:'authenticated_browser_capture',sampleStatistics:'recomputed_from_included_games',seasonStatistics:'aggregate_reported_by_reader',aiUsed:false},settings,totalOdds:price(input.totalOdds),unsupportedSelections:unsupported,status,counts,archiveIds,issues:[...new Set(rootIssues)],observations:ticketObservations(legs.map(l=>selection(l.selection,l.id,settings))),context:{injuries:'not_queried',projectedMinutes:'not_estimated',nextGameProbabilities:'not_estimated'},interpretation:{historicalFrequenciesArePredictions:false,combinedProbability:null,hitRateDefinition:'hits / (hits + misses)',missingValues:'excluded; never replaced with zero',cutoff:'games strictly before eventDate',minutes:'full-game minutes, including for Q1/H1/H2_REG',opponentSample:'up to five games under the same filters; no minimum forced'},legs};
  return new TextEncoder().encode(JSON.stringify(report)).length<=ANALYSIS_BYTES?report:null;
 }catch{return null;}
}
export type AnalysisSnapshot=NonNullable<ReturnType<typeof sanitizeAnalysis>>;

export function buildAnalysisSnapshot(document:TicketDocument,entries:Record<string,AnalysisEntry>,settings:Settings,meta:{id:string;traceId:string;startedAt:string;completedAt?:string;code?:string}):AnalysisSnapshot|null {
 const legs=document.legs.map(leg=>{
  const entry=entries[leg.id]??{},result=entry.result;
  const validPrice=(value:number|null)=>typeof value==='number'&&Number.isFinite(value)&&value>1&&value<=1_000_000?value:null;
  const resolved={...leg,teams:[...new Set(leg.teams.filter(t=>TEAMS.includes(t)))],line:leg.line!==null&&Number.isFinite(leg.line)&&leg.line>=0&&leg.line<=300?leg.line:null,odds:validPrice(leg.odds),groupOdds:validPrice(leg.groupOdds),...(result?{playerId:result.player.id,playerName:result.player.name,playerTeam:result.player.team??undefined}:{})};
  const review=result?reviewLeg(result.games,resolved):null;
  const current=result?.games.filter(g=>g.season===seasonOf(settings.eventDate))??[];
  return {id:leg.id,selection:resolved,identity:{status:result?'exact':entry.identity?.status??'not_checked',inputName:entry.identity?.originalName??leg.playerName,candidates:entry.identity?.candidates??entry.candidates??[]},issues:[...(entry.code?[entry.code]:[]),...(entry.needsTeam?['TEAM_REVIEW']:[]),...(entry.needsPlayer?['PLAYER_REVIEW']:[]),...(entry.error&&!entry.needsTeam&&!entry.needsPlayer?[entry.code??'ANALYSIS_ERROR']:[]),...(meta.code&&!result?[meta.code]:[])],history:result?{cutoffDate:result.asOf,archiveId:result.archiveId,coverage:result.coverage,availableGames:result.games.length,recent:{games:result.games.slice(0,10)},versusOpponent:{games:review!.h2h},currentSeason:summarize(current,resolved.line!,resolved.operator!)}:null,quote:result?.quote??{status:'not_found'}};
 });
 const totalOdds=typeof document.totalOdds==='number'&&Number.isFinite(document.totalOdds)&&document.totalOdds>1&&document.totalOdds<=1_000_000?document.totalOdds:null;
 return sanitizeAnalysis({schema:'nba-ticket-analysis',version:1,readerVersion:6,id:meta.id,traceId:meta.traceId,startedAt:meta.startedAt,completedAt:meta.completedAt??new Date().toISOString(),settings,totalOdds,unsupportedSelections:document.warnings.filter(w=>w.startsWith('Mercado sin análisis:')).length,issues:meta.code?[meta.code]:[],legs});
}
