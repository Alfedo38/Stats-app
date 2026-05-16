BEGIN;

DELETE FROM public.team_dvp;

INSERT INTO public.team_dvp (
  team,
  position,
  pts_allowed,
  reb_allowed,
  ast_allowed,
  threes_allow,
  updated_at
)
WITH per_game AS (
  SELECT
    pgl.opponent_abbr AS team,
    upper(trim(pl.position)) AS position,
    pgl.game_id,
    SUM(coalesce(pgl.pts, 0)) AS pts_allowed,
    SUM(coalesce(pgl.reb, 0)) AS reb_allowed,
    SUM(coalesce(pgl.ast, 0)) AS ast_allowed,
    SUM(coalesce(pgl.fg3m, 0)) AS threes_allow
  FROM public.player_game_logs pgl
  JOIN public.players pl
    ON pl.api_id = pgl.player_id
  WHERE pgl.opponent_abbr IS NOT NULL
    AND pgl.game_id IS NOT NULL
    AND pl.position IS NOT NULL
    AND trim(pl.position) <> ''
    AND pgl.season_type IN ('Regular Season', 'Playoffs')
  GROUP BY
    pgl.opponent_abbr,
    upper(trim(pl.position)),
    pgl.game_id
),
dvp AS (
  SELECT
    team,
    position,
    AVG(pts_allowed)::double precision AS pts_allowed,
    AVG(reb_allowed)::double precision AS reb_allowed,
    AVG(ast_allowed)::double precision AS ast_allowed,
    AVG(threes_allow)::double precision AS threes_allow
  FROM per_game
  GROUP BY team, position
)
SELECT
  team,
  position,
  round(pts_allowed::numeric, 2)::double precision,
  round(reb_allowed::numeric, 2)::double precision,
  round(ast_allowed::numeric, 2)::double precision,
  round(threes_allow::numeric, 2)::double precision,
  now()::text
FROM dvp
ORDER BY team, position;

COMMIT;
