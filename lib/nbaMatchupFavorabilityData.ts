import 'server-only';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {CURRENT_ROSTER_UPDATED_AT,getCurrentRosterPlayer} from './currentRosters';
import {nbaHistoryCutoff} from './injuryReport';
import {defenseSeason} from './nbaDefense';
import {gamePhase} from './nbaGameFilters';
import {matchupFavorability,matchupTeam,type MatchupFavorability} from './nbaMatchupFavorability';
import {ticketSchedule} from './ticketReader/calendar';
import {isDate,TEAMS} from './ticketReader/model';

export type FavorabilityQuery = {playerId: number; away: string; home: string; date: string};
export type FavorabilityResponse = {
  ok: true; available: true; data: MatchupFavorability; cutoff: string; start: string;
  playerId: number; team: string; opponent: string; gameId: string; phase: 'Regular Season'|'Playoffs';
} | {ok: true; available: false; reason: 'calendar'|'team'|'archive'|'phase'};

export function favorabilityQuery(params: URLSearchParams): FavorabilityQuery|null {
  const id=params.get('playerId')??'', date=params.get('date'), away=params.get('away')??'', home=params.get('home')??'';
  if(!/^[1-9]\d{0,9}$/.test(id)||!TEAMS.includes(away)||!TEAMS.includes(home)||away===home||
     !isDate(date)||date<'2015-10-01'||date>'2040-01-01') return null;
  return {playerId:Number(id),away,home,date};
}

const cache=new Map<string,{until:number;value:Promise<FavorabilityResponse>}>();
export function getMatchupFavorability(query: FavorabilityQuery): Promise<FavorabilityResponse> {
  const key=JSON.stringify([query.playerId,query.date,query.away,query.home]), prior=cache.get(key);
  if(prior && prior.until>Date.now()) return prior.value;
  const value=load(query), entry={until:Date.now()+60000,value};
  if(cache.size>=48) cache.delete(cache.keys().next().value!);
  cache.set(key,entry);
  value.then(r=>{if(!r.available&&cache.get(key)===entry)cache.delete(key);},()=>{if(cache.get(key)===entry)cache.delete(key);});
  return value;
}

async function load({playerId,away,home,date}: FavorabilityQuery): Promise<FavorabilityResponse> {
  const schedule=await ticketSchedule(date);
  const exact=schedule.games.filter(g=>g.away===away&&g.home===home);
  if(!schedule.available||exact.length!==1||!exact[0].start) return {ok:true,available:false,reason:'calendar'};
  const game=exact[0], start=exact[0].start;
  const cutoff=nbaHistoryCutoff({date,start}), phase=gamePhase({game_id:game.id});
  if(phase!=='Regular Season'&&phase!=='Playoffs') return {ok:true,available:false,reason:'phase'};
  if(!archiveEnabled()) return {ok:true,available:false,reason:'archive'};
  const manifest=await archiveManifest(), factsKey='facts/'+playerId;
  if(!manifest.parts[factsKey]) return {ok:true,available:false,reason:'archive'};
  const facts=await archivePart(factsKey,manifest);
  const roster=getCurrentRosterPlayer(playerId);
  const team=matchupTeam(facts,playerId,cutoff,roster?.team_abbreviation??null,CURRENT_ROSTER_UPDATED_AT.slice(0,10));
  if(!team||(team!==away&&team!==home)) return {ok:true,available:false,reason:'team'};
  const season=defenseSeason(cutoff), year=Number(season.slice(0,4));
  const lookups=[season, `${year-1}-${String(year).slice(-2)}`];
  const snapshots=(await Promise.allSettled(lookups.filter(s=>manifest.parts['defense/'+s]).map(s=>archivePart('defense/'+s,manifest))))
    .flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  const opponent=team===away?home:away, position=roster?.team_abbreviation===team?roster.position:null;
  return {ok:true,available:true,playerId,team,opponent,cutoff,start,phase,gameId:game.id,
    data:matchupFavorability({playerId,team,opponent,cutoff,phase,position},facts,snapshots)};
}
