import { withAuth } from "@/lib/auth/server";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function plain(value: any): any {
  if (value == null) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    if (typeof value.toNumber === "function") return value.toNumber();
    const output: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) output[key] = plain(item);
    return output;
  }
  return value;
}

export const GET = withAuth(handleGET);

async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const playerId = Number(searchParams.get("playerId"));
  const season = String(searchParams.get("season") || "2025-26").trim();

  if (!Number.isInteger(playerId) || playerId <= 0 || !/^\d{4}-\d{2}$/.test(season)) {
    return NextResponse.json({ ok: false, shots: [], matchups: [], games: [], defenderFouls: [], error: "Parámetros inválidos" }, { status: 400 });
  }

  try {
    const [shots, matchups, games, defenderFouls] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `
          select game_id, game_event_id, game_date, season, season_type,
                 player_id, player_name, team_id, team_name, team_abbr,
                 opponent_abbr, period, minutes_remaining, seconds_remaining,
                 event_type, action_type, shot_type, shot_zone_basic,
                 shot_zone_area, shot_zone_range, shot_distance, loc_x, loc_y,
                 shot_attempted_flag, shot_made_flag, home_team_abbr, away_team_abbr
          from public.nba_shots
          where player_id = $1::bigint and season = $2::text
          order by game_date desc, game_event_id asc
        `,
        playerId,
        season,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          select m.game_id, m.game_date, m.season, m.season_type,
                 m.offensive_team_abbr, m.offensive_player_id,
                 m.defensive_team_abbr, m.defensive_player_id,
                 m.defensive_player_name,
                 coalesce(p.position, '') as defensive_position,
                 m.matchup_minutes, m.matchup_minutes_sort,
                 m.partial_possessions, m.percentage_offensive_total_time,
                 m.switches_on, m.player_points, m.team_points,
                 m.matchup_assists, m.matchup_turnovers, m.matchup_blocks,
                 m.matchup_field_goals_made, m.matchup_field_goals_attempted,
                 m.matchup_three_pointers_made, m.matchup_three_pointers_attempted,
                 m.shooting_fouls
          from public.nba_player_matchups m
          left join public.players p on p.id::bigint = m.defensive_player_id
          where m.offensive_player_id = $1::bigint and m.season = $2::text
          order by m.game_date desc, m.partial_possessions desc nulls last
        `,
        playerId,
        season,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          select lpad(game_id::text, 10, '0') as game_id, game_date,
                 season_type, team_abbreviation, opponent_abbr, matchup,
                 home_away, wl, min, pts, fgm, fga, fg3m, fg3a
          from public.player_game_logs
          where player_id = $1::int and season_year = $2::text and game_id is not null
          order by game_date desc
        `,
        playerId,
        season,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          select l.player_id, count(*)::int as games, avg(coalesce(l.pf, 0))::real as pf_avg
          from public.player_game_logs l
          where l.season_year = $2::text
            and l.player_id::bigint in (
              select distinct m.defensive_player_id
              from public.nba_player_matchups m
              where m.offensive_player_id = $1::bigint and m.season = $2::text
            )
          group by l.player_id
        `,
        playerId,
        season,
      ),
    ]);

    return NextResponse.json(
      { ok: true, season, shots: plain(shots), matchups: plain(matchups), games: plain(games), defenderFouls: plain(defenderFouls) },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (error: any) {
    console.error("GET /api/nba-context error:", error);
    return NextResponse.json(
      { ok: false, shots: [], matchups: [], games: [], defenderFouls: [], error: "Todavía no están disponibles los datos de tiros y defensores." },
      { status: 200 },
    );
  }
}
