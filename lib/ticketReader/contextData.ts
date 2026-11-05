import 'server-only';
import {readerPart,type ReaderManifest} from './archive';
import {defenseMarket,defenseReferencePosition,DEFAULT_DEFENSE_PHASE,defenseRankings,defenseSeason,type DefenseRank} from '@/lib/nbaDefense';
import {getCurrentRosterPlayer,CURRENT_ROSTER_UPDATED_AT} from '@/lib/currentRosters';
import {rosterFitsDate} from './teamContext';
import {getInjuryReport} from '@/lib/injuryReportData';
import {canonicalOddsPlayerName} from '@/lib/oddsPlayerNames';
import {type Leg,type Settings,type TeamContext} from './model';
import {sanitizeSelectionContext,type SelectionContext,type DefenseSample,type MedicalItem} from './contextModel';

type Rankings=ReturnType<typeof defenseRankings>;
const cached=new Map<string,Promise<{rankings:Rankings}|null>>();
async function ranking(manifest:ReaderManifest,season:string,settings:Settings,market:NonNullable<ReturnType<typeof defenseMarket>>){
 const key=[manifest.id,season,settings.eventDate,settings.phase,market].join('|'),old=cached.get(key);if(old)return old;
 const value=(async()=>{const name='defense/'+season;if(!manifest.parts[name])return null;
  const data=await readerPart<{format:number;scope:string;season:string;games:unknown[]}>(name,manifest);
  if(data?.format!==1||data.scope!=='FULL'||data.season!==season||!Array.isArray(data.games)||data.games.length>15000)throw Error('DEFENSE_FORMAT');
  return {rankings:defenseRankings(data.games,{market,season,asOfDate:settings.eventDate,phase:DEFAULT_DEFENSE_PHASE,window:'season',opponent:null,position:'ALL'})};})();
 if(cached.size>=48)cached.delete(cached.keys().next().value!);cached.set(key,value);value.catch(()=>{if(cached.get(key)===value)cached.delete(key);});return value;
}
async function bounded<T>(task:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('CONTEXT_TIMEOUT')),6500);})]);}finally{if(timer)clearTimeout(timer);}}
function sample(row:DefenseRank|undefined,season:string,position:DefenseSample['position']):DefenseSample|null{return row?{season,position,games:row.games,total:row.total,rank:row.rank,rankedTeams:row.rankedTeams,allowed:row.allowed,leagueAverage:row.leagueAverage,diffPct:row.diffPct,through:row.last}:null;}
async function defense(manifest:ReaderManifest,leg:Leg,settings:Settings,cutoff:string):Promise<SelectionContext['defense']>{
 const currentSeason=defenseSeason(settings.eventDate),base={status:'unavailable' as const,reference:null,currentSeason,currentGames:0,usesPrevious:false,reason:'NO_SNAPSHOT' as const,source:'nba_archive' as const};
 const market=defenseMarket(leg.market==='TO'?'tov':leg.market);if(!market)return {...base,status:'unsupported',reason:'MARKET_UNSUPPORTED'};
 const summaries=await readerPart<{positions?:Record<string,string>}>('summaries',manifest),roster=leg.playerId&&rosterFitsDate(settings.eventDate,CURRENT_ROSTER_UPDATED_AT)?getCurrentRosterPlayer(leg.playerId):null;
 const position=defenseReferencePosition(roster?.position??summaries.positions?.[String(leg.playerId)])??'ALL';
 const previous=Number(currentSeason.slice(0,4))-1,previousSeason=`${previous}-${String(previous+1).slice(-2)}`,opponent=leg.teams.find(t=>t!==leg.playerTeam)!;
 const current=await ranking(manifest,currentSeason,{...settings,eventDate:cutoff},market),currentRow=current?.rankings[position].find(r=>r.team===opponent),currentGames=currentRow?.games??0;
 if(currentRow&&currentRow.games>=5)return {...base,status:'ready',reference:sample(currentRow,currentSeason,position),currentGames,reason:'OK'};
 const past=await ranking(manifest,previousSeason,{...settings,eventDate:cutoff},market),pastRow=past?.rankings[position].find(r=>r.team===opponent);
 if(pastRow&&pastRow.games>=5)return {...base,status:'ready',reference:sample(pastRow,previousSeason,position),currentGames,usesPrevious:true,reason:'OK'};
 if(currentRow&&currentRow.total>0)return {...base,status:'small_sample',reference:sample(currentRow,currentSeason,position),currentGames,reason:'SMALL_SAMPLE'};
 return {...base,currentGames};
}
async function injuries(leg:Leg,context:TeamContext|undefined,now:Date):Promise<SelectionContext['injuries']>{
 const empty={status:'unavailable' as const,player:null,teammates:[],additional:0,source:'nba_report_cache' as const};
 if(leg.eventDate<argDate(now))return {...empty,status:'historical'};
 if(context?.status!=='matched'||!context.gameId)return {...empty,status:'unverified_event'};
 const report=await getInjuryReport(leg.eventDate);if(!report.available)return empty;
 const rows=report.items.filter(p=>p.team===leg.playerTeam&&p.date===leg.eventDate&&p.playerId!==null&&p.game?.id.replace(/^0+/,'')===context.gameId!.replace(/^0+/,'')&&p.game.away!==p.game.home&&leg.teams.includes(p.game.away)&&leg.teams.includes(p.game.home)&&(!p.game.start||!p.reportAt||Date.parse(p.reportAt)<Date.parse(p.game.start)));
 const clean=(p:typeof rows[number]):MedicalItem=>({playerId:p.playerId!,name:p.name,state:p.status,date:leg.eventDate,reportDate:p.reportAt?argDate(new Date(p.reportAt)):null,stale:p.stale});
 const own=rows.filter(p=>p.playerId===leg.playerId&&canonicalOddsPlayerName(p.name)===canonicalOddsPlayerName(leg.playerName));
 const relevant=rows.filter(p=>p.playerId!==leg.playerId&&['OUT','DOUBTFUL','QUESTIONABLE'].includes(p.status)).sort((a,b)=>Number(b.status==='OUT')-Number(a.status==='OUT')||a.name.localeCompare(b.name));
 if(own.length>1)return empty;
 return {status:own.length||relevant.length?'known':'not_reported',player:own.length===1?clean(own[0]):null,teammates:relevant.slice(0,3).map(clean),additional:Math.max(0,relevant.length-3),source:'nba_report_cache'};
}
function argDate(now:Date){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');}
export async function readSelectionContext(manifest:ReaderManifest,leg:Leg,settings:Settings,teamContext:TeamContext|undefined,now=new Date(),cutoff=settings.eventDate):Promise<SelectionContext>{
 const [d,i]=await Promise.allSettled([bounded(defense(manifest,leg,settings,cutoff)),bounded(injuries(leg,teamContext,now))]);
 const data:SelectionContext={version:1,archiveId:manifest.id,playerId:leg.playerId!,team:leg.playerTeam!,opponent:leg.teams.find(t=>t!==leg.playerTeam)!,eventDate:settings.eventDate,scope:leg.scope,market:leg.market!,
  defense:d.status==='fulfilled'?d.value:{status:'unavailable',reference:null,currentSeason:defenseSeason(settings.eventDate),currentGames:0,usesPrevious:false,reason:'READ_FAILED',source:'nba_archive'},
  injuries:i.status==='fulfilled'?i.value:{status:'unavailable',player:null,teammates:[],additional:0,source:'nba_report_cache'}};
 const safe=sanitizeSelectionContext(data,leg,manifest.id);if(!safe)throw Error('CONTEXT_INVALID');return safe;
}
