import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getCurrentRosterTeam } from '@/lib/currentRosters';
import type { MatchupFilters } from '@/lib/matchupFilters';

export type TeamAverage = {
  team_abbreviation: string; gp: number; wins: number; first_date: string; last_date: string;
  pts: number | null; reb: number | null; ast: number | null; stl: number | null;
  blk: number | null; tov: number | null; fgm: number | null; fga: number | null;
  fg3m: number | null; fg3a: number | null; ftm: number | null; fta: number | null;
  fg_pct: number | null; fg3_pct: number | null; ft_pct: number | null;
  opp_pts: number | null; opp_reb: number | null; opp_ast: number | null; opp_fg3m: number | null;
};
export type PlayerAverage = {
  player_id: number; gp: number; first_date: string; last_date: string; historical_teams: string;
  min: number | null; pts: number | null; reb: number | null; ast: number | null;
  fg3m: number | null; fgm: number | null; fga: number | null; stl: number | null;
  blk: number | null; tov: number | null; pra: number | null; pr: number | null;
  pa: number | null; ra: number | null;
};

export async function getMatchupSeasons(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ season_year: string }[]>`
    SELECT DISTINCT season_year FROM public.nba_team_game_logs ORDER BY season_year DESC
  `;
  return rows.map(row => row.season_year);
}

export async function getMatchupData(away: string, home: string, f: MatchupFilters) {
  const awayRoster = getCurrentRosterTeam(away);
  const homeRoster = getCurrentRosterTeam(home);
  const ids = [...new Set([...awayRoster, ...homeRoster].map(p => p.player_id))];
  const phase = f.phase === 'ALL' ? Prisma.empty : Prisma.sql`AND season_type = ${f.phase}`;
  // History stops before the selected game day, also when viewing a past fixture.
  const teamVenue = f.venue === 'ALL' ? Prisma.empty : f.venue === 'MATCH'
    ? Prisma.sql`AND ((team_abbreviation = ${away} AND home_away = 'AWAY') OR (team_abbreviation = ${home} AND home_away = 'HOME'))`
    : Prisma.sql`AND home_away = ${f.venue}`;
  const playerVenue = f.venue === 'ALL' ? Prisma.empty : f.venue === 'MATCH'
    ? Prisma.sql`AND ((player_id IN (${Prisma.join(awayRoster.length ? awayRoster.map(p => p.player_id) : [-1])}) AND matchup LIKE '%@%') OR (player_id IN (${Prisma.join(homeRoster.length ? homeRoster.map(p => p.player_id) : [-1])}) AND matchup LIKE '%vs.%'))`
    : f.venue === 'HOME' ? Prisma.sql`AND matchup LIKE '%vs.%'` : Prisma.sql`AND matchup LIKE '%@%'`;
  const teamLimit = f.last ? Prisma.sql`WHERE rn <= ${f.last}` : Prisma.empty;
  const playerLimit = f.last ? Prisma.sql`WHERE rn <= ${f.last}` : Prisma.empty;

  const [teams, players] = await Promise.all([
    prisma.$queryRaw<TeamAverage[]>(Prisma.sql`
      WITH ranked AS (
        SELECT *, row_number() OVER (PARTITION BY team_abbreviation ORDER BY game_date DESC, game_id DESC) AS rn
        FROM public.nba_team_game_logs
        WHERE season_year = ${f.season} AND team_abbreviation IN (${away}, ${home})
          AND game_date < ${f.date}::date ${phase} ${teamVenue}
      ), chosen AS (SELECT * FROM ranked ${teamLimit})
      SELECT t.team_abbreviation, count(*)::int AS gp, count(*) FILTER (WHERE t.wl = 'W')::int AS wins,
        min(t.game_date)::text AS first_date, max(t.game_date)::text AS last_date,
        avg(t.pts)::float8 AS pts, avg(t.reb)::float8 AS reb, avg(t.ast)::float8 AS ast,
        avg(t.stl)::float8 AS stl, avg(t.blk)::float8 AS blk, avg(t.tov)::float8 AS tov,
        avg(t.fgm)::float8 AS fgm, avg(t.fga)::float8 AS fga, avg(t.fg3m)::float8 AS fg3m,
        avg(t.fg3a)::float8 AS fg3a, avg(t.ftm)::float8 AS ftm, avg(t.fta)::float8 AS fta,
        (100.0 * sum(t.fgm) / nullif(sum(t.fga), 0))::float8 AS fg_pct,
        (100.0 * sum(t.fg3m) / nullif(sum(t.fg3a), 0))::float8 AS fg3_pct,
        (100.0 * sum(t.ftm) / nullif(sum(t.fta), 0))::float8 AS ft_pct,
        avg(o.pts)::float8 AS opp_pts, avg(o.reb)::float8 AS opp_reb,
        avg(o.ast)::float8 AS opp_ast, avg(o.fg3m)::float8 AS opp_fg3m
      FROM chosen t LEFT JOIN public.nba_team_game_logs o
        ON o.game_id = t.game_id AND o.team_id = t.opponent_team_id
      GROUP BY t.team_abbreviation
    `),
    ids.length ? prisma.$queryRaw<PlayerAverage[]>(Prisma.sql`
      WITH deduped AS (
        SELECT DISTINCT ON (player_id, game_id) player_id, game_id, game_date, team_abbreviation,
          min, pts, reb, ast, fg3m, fgm, fga, stl, blk, tov
        FROM public.player_game_logs
        WHERE season_year = ${f.season} AND player_id IN (${Prisma.join(ids)})
          AND game_date < ${f.date}::date AND game_id IS NOT NULL AND min > 0 ${phase} ${playerVenue}
        ORDER BY player_id, game_id, id DESC
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY player_id ORDER BY game_date DESC, game_id DESC) AS rn
        FROM deduped
      ), chosen AS (SELECT * FROM ranked ${playerLimit})
      SELECT player_id, count(*)::int AS gp,
        min(game_date)::text AS first_date, max(game_date)::text AS last_date,
        string_agg(DISTINCT team_abbreviation, ', ' ORDER BY team_abbreviation) AS historical_teams,
        avg(min)::float8 AS min, avg(pts)::float8 AS pts, avg(reb)::float8 AS reb,
        avg(ast)::float8 AS ast, avg(fg3m)::float8 AS fg3m, avg(fgm)::float8 AS fgm,
        avg(fga)::float8 AS fga, avg(stl)::float8 AS stl, avg(blk)::float8 AS blk, avg(tov)::float8 AS tov,
        avg(pts + reb + ast)::float8 AS pra, avg(pts + reb)::float8 AS pr,
        avg(pts + ast)::float8 AS pa, avg(reb + ast)::float8 AS ra
      FROM chosen GROUP BY player_id
    `) : Promise.resolve([] as PlayerAverage[]),
  ]);
  return { teams, players, awayRoster, homeRoster };
}
