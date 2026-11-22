import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth/server';
import prisma from '@/lib/prisma';
import {isLeagueTeam} from '@/lib/teams';
import {validDate} from '@/lib/matchupFilters';
import {studioSeason} from '@/lib/nbaStudio';
import {summarizeMatchupTeam,type MatchupGameRow} from '@/lib/nbaMatchupPreview';
import {lastTeamLineups} from '@/lib/nbaRotationData';
import {nbaSlateDate} from '@/lib/nbaSlate';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=withAuth(async(req:Request)=>{
 const q=new URL(req.url).searchParams,away=q.get('away')??'',home=q.get('home')??'',date=validDate(q.get('date'));
 const headers={'Cache-Control':'private, no-store'};
 if(!isLeagueTeam(away)||!isLeagueTeam(home)||away===home||!date)return NextResponse.json({ok:false,error:'Partido o fecha inválidos.'},{status:400,headers});
 try{
  const games=await prisma.$queryRaw<{id:string;start:string|null}[]>`SELECT nba_game_id::text AS id,start_utc::text AS start FROM public.nba_daily_schedule WHERE away=${away} AND home=${home} AND NOT postponed AND COALESCE((start_utc AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,event_date)=${date}::date LIMIT 2`;
  if(games.length!==1)return NextResponse.json({ok:true,available:false,teams:[],reason:'CALENDAR_NOT_CONFIRMED'},{headers});
  const cutoff=nbaSlateDate(games[0].start,date),season=studioSeason(cutoff);
  const rows=await prisma.$queryRaw<MatchupGameRow[]>`WITH ranked AS (
   SELECT t.*,row_number() OVER(PARTITION BY team_abbreviation ORDER BY game_date DESC,game_id DESC) rn
   FROM public.nba_team_game_logs t WHERE team_abbreviation IN (${away},${home}) AND season_year=${season}
   AND game_date<${cutoff}::date AND season_type IN ('Regular Season','Playoffs')
  ) SELECT t.team_abbreviation AS team,t.game_id::text AS id,to_char(t.game_date,'YYYY-MM-DD') AS date,to_jsonb(t) AS data,to_jsonb(o) AS opponent
   FROM ranked t LEFT JOIN public.nba_team_game_logs o ON o.game_id=t.game_id AND o.team_id=t.opponent_team_id
   WHERE t.rn<=10 ORDER BY t.game_date DESC`;
  if(q.get('lineups')==='1')return NextResponse.json({ok:true,available:true,lineups:await lastTeamLineups([away,home],rows,cutoff)},{headers});
  return NextResponse.json({ok:true,available:true,gameId:games[0].id,date,season,teams:[away,home].map(team=>summarizeMatchupTeam(rows,team,cutoff))},{headers});
 }catch{return NextResponse.json({ok:false,error:'No pudimos consultar el contexto de este partido.'},{status:503,headers});}
});
