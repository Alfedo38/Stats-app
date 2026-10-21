import {archiveEnabled,archivePart,archivedRest} from '@/lib/nbaArchive';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/server';
import prisma from '@/lib/prisma';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const defenseCache = new Map<string, { expires: number; value: unknown }>();
const TEAMS=new Set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '));
export const GET=withAuth(async (req:NextRequest)=>{
  const params=req.nextUrl.searchParams, player=Number(params.get('playerId')), season=params.get('season')??'', phase=params.get('phase')??'ALL', kind=params.get('kind');
  if(!Number.isSafeInteger(player)||player<=0||!/^\d{4}-\d{2}$/.test(season)||!['ALL','Regular Season','Playoffs'].includes(phase)||!['defense','rest','stints'].includes(kind??'')) return NextResponse.json({ok:false,error:'Parámetros inválidos'},{status:400});
  try {
    if(kind==='defense'){
      const opponent=params.get('opponent')??'';
      if(!TEAMS.has(opponent))return NextResponse.json({ok:false,error:'Elegí un rival válido'},{status:400});
      if(archiveEnabled()) {
        const summary=await archivePart('summaries');
        return NextResponse.json({ok:true,zones:summary.defense?.[`${season}/${phase}/${opponent}`]??[]});
      }
      const cacheKey=`${season}:${phase}:${opponent}`;
      const cached=defenseCache.get(cacheKey);
      if(cached && cached.expires>Date.now())return NextResponse.json(cached.value);
      const zones=await prisma.$queryRawUnsafe<any[]>(`
        with sample as (
          select game_id, opponent_abbr, coalesce(shot_zone_basic,'Sin zona') as zone, shot_made_flag
          from public.nba_shots where season=$2 and ($3='ALL' or season_type=$3) and shot_attempted_flag=1 and opponent_abbr is not null
        ), league as (
          select zone, count(*)::int as league_attempts,
            count(*) filter(where shot_made_flag=1)::int as league_made from sample group by zone
        ), rival as (
          select zone, count(*)::int as attempts, count(*) filter(where shot_made_flag=1)::int as made
          from sample where opponent_abbr=$1 group by zone
        ) select league.zone, coalesce(rival.attempts,0)::int as attempts, coalesce(rival.made,0)::int as made,
          (select count(distinct game_id)::int from sample where opponent_abbr=$1) as games,
          league_attempts, league_made,
          (select count(distinct (game_id,opponent_abbr))::int from sample) as league_team_games
          from league left join rival on rival.zone=league.zone order by attempts desc`,opponent,season,phase);
      const value={ok:true,zones};
      if(defenseCache.size>=60)defenseCache.delete(defenseCache.keys().next().value!);
      defenseCache.set(cacheKey,{expires:Date.now()+300000,value});
      return NextResponse.json(value);
    }
    if(kind==='rest'){
      if(archiveEnabled())return NextResponse.json({ok:true,teamDates:await archivedRest(player,season)});
      const start=`${season.slice(0,4)}-10-01`,end=`${Number(season.slice(0,4))+1}-10-01`;
      let teamDates:{team:string;date:string}[]=[], successfulSources=0;
      for(const source of ['public.player_page_game_fact_cache','public.player_game_logs']){
        try{
          teamDates=await prisma.$queryRawUnsafe<{team:string;date:string}[]>(`
            select distinct team_abbreviation as team, to_char(game_date,'YYYY-MM-DD') as date
            from ${source} where game_date >= $2::date and game_date < $3::date and game_id is not null
              and team_abbreviation in (select distinct team_abbreviation from ${source} where player_id=$1::bigint and game_date >= $2::date and game_date < $3::date)
            order by date`,player,start,end);
          successfulSources++;
          if(teamDates.length)break;
        }catch{continue;}
      }
      if(!successfulSources)throw new Error('REST_SOURCES_UNAVAILABLE');
      return NextResponse.json({ok:true,teamDates});
    }
    const exists=await prisma.$queryRawUnsafe<{present:boolean}[]>(`select to_regclass('public.nba_pro_player_stints') is not null as present`);
    if(!exists[0]?.present)return NextResponse.json({ok:true,available:false,stints:[],players:[]});
    const stints=await prisma.$queryRawUnsafe<any[]>(`
      select game_id, to_char(game_date,'YYYY-MM-DD') as game_date, start_seconds::float8, end_seconds::float8,
        game_seconds::float8, lineup, pts::float8, reb::float8, ast::float8, fga::float8
      from public.nba_pro_player_stints where player_id=$1::int and season=$2
        and ($3='ALL' or season_type=$3) and validated=true order by game_date desc,start_seconds`,player,season,phase);
    const ids=[...new Set<number>(stints.flatMap(row=>row.lineup as number[]))];
    const players=ids.length?await prisma.$queryRawUnsafe<{id:number;name:string}[]>(`select id::int, coalesce(full_name,'Jugador '||id::text) as name from public.players where id=any($1::int[])`,ids):[];
    return NextResponse.json({ok:true,available:true,stints,players});
  } catch {
    console.error('NBA_PRO_CONTEXT_QUERY_FAILED',kind);
    return NextResponse.json({ok:false,error:'No se pudieron cargar los datos del módulo.'},{status:503});
  }
});
