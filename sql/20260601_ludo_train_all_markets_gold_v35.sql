-- Ludo v35 — Gold training view para todos los mercados.
-- Crea una fuente única para entrenar full game con:
-- bio position/position_group, season calculada, opponent_clean, Q1 real,
-- passes_made, flags de tracking y DVP básico por equipo/posición.
--
-- Ejecutar en Supabase SQL Editor antes de entrenar:
--   python3 entrenar_ludo.py --probe

DROP VIEW IF EXISTS nba_api_data.v_ludo_train_all_markets_gold;

CREATE OR REPLACE VIEW nba_api_data.v_ludo_train_all_markets_gold AS
WITH bio AS (
  SELECT DISTINCT ON (person_id)
    person_id::bigint AS player_id,
    NULLIF(TRIM(position::text), '') AS raw_position,
    CASE
      WHEN UPPER(position::text) IN ('G-F','F-G') THEN 'G-F'
      WHEN UPPER(position::text) IN ('F-C','C-F') THEN 'F-C'
      WHEN UPPER(position::text) IN ('PG','SG','G') THEN 'G'
      WHEN UPPER(position::text) IN ('SF','PF','F') THEN 'F'
      WHEN UPPER(position::text) = 'C' THEN 'C'
      WHEN position::text ILIKE '%Guard%' AND position::text ILIKE '%Forward%' THEN 'G-F'
      WHEN position::text ILIKE '%Forward%' AND position::text ILIKE '%Center%' THEN 'F-C'
      WHEN position::text ILIKE '%Guard%' THEN 'G'
      WHEN position::text ILIKE '%Forward%' THEN 'F'
      WHEN position::text ILIKE '%Center%' THEN 'C'
      ELSE 'F'
    END AS position_group
  FROM nba_historical.player_bio
  WHERE person_id IS NOT NULL
  ORDER BY person_id, to_year DESC NULLS LAST, from_year DESC NULLS LAST
),
q1 AS (
  SELECT DISTINCT ON (game_id, player_id)
    game_id::text AS game_id,
    player_id::bigint AS player_id,
    pts::numeric  AS q1_pts,
    reb::numeric  AS q1_reb,
    ast::numeric  AS q1_ast,
    oreb::numeric AS q1_oreb,
    dreb::numeric AS q1_dreb,
    stl::numeric  AS q1_stl,
    blk::numeric  AS q1_blk,
    tov::numeric  AS q1_tov,
    pf::numeric   AS q1_pf
  FROM nba_api_data.player_period_splits_v2
  WHERE split_code = 'Q1'
  ORDER BY game_id, player_id, game_date DESC
),
passing AS (
  SELECT
    NULL::text AS game_id,
    NULL::bigint AS player_id,
    NULL::numeric AS passes_made,
    NULL::numeric AS potential_ast_tracking
  WHERE false
),
base AS (
  SELECT
    b.player_id::bigint AS player_id,
    b.player_name::text AS player_name,
    COALESCE(NULLIF(b.team_abbreviation::text, ''), NULLIF(b.team_clean_from_matchup::text, '')) AS team_abbreviation,
    b.game_id::text AS game_id,
    b.game_date::date AS game_date,

    CASE
      WHEN EXTRACT(MONTH FROM b.game_date::date) >= 10
        THEN EXTRACT(YEAR FROM b.game_date::date)::int
      ELSE EXTRACT(YEAR FROM b.game_date::date)::int - 1
    END AS season,

    COALESCE(NULLIF(b.matchup_clean::text, ''), NULLIF(b.matchup::text, '')) AS matchup,
    COALESCE(NULLIF(b.opponent_clean::text, ''), NULLIF(b.opponent::text, '')) AS opponent_abbr,
    COALESCE(NULLIF(b.home_away_clean::text, ''), NULLIF(b.home_away::text, '')) AS home_away,

    COALESCE(NULLIF(b.min_clean::text, '')::numeric, NULLIF(b.min::text, '')::numeric) AS min,
    NULLIF(b.usage_pct::text, '')::numeric AS usage_pct,
    NULLIF(b.touches::text, '')::numeric AS touches,
    NULLIF(b.rebound_chances::text, '')::numeric AS rebound_chances,
    NULLIF(b.potential_ast::text, '')::numeric AS potential_ast,
    NULLIF(b.oreb::text, '')::numeric AS rebound_off,
    NULLIF(b.dreb::text, '')::numeric AS rebound_def,

    NULLIF(b.pts::text, '')::numeric AS pts,
    NULLIF(b.reb::text, '')::numeric AS reb,
    NULLIF(b.ast::text, '')::numeric AS ast,
    NULLIF(b.fgm::text, '')::numeric AS fgm,
    NULLIF(b.fga::text, '')::numeric AS fga,
    NULLIF(b.fg3m::text, '')::numeric AS fg3m,
    NULLIF(b.fg3a::text, '')::numeric AS fg3a,
    NULLIF(b.ftm::text, '')::numeric AS ftm,
    NULLIF(b.fta::text, '')::numeric AS fta,
    NULLIF(b.stl::text, '')::numeric AS stl,
    NULLIF(b.blk::text, '')::numeric AS blk,
    NULLIF(b.tov::text, '')::numeric AS tov,
    NULLIF(b.pf::text, '')::numeric AS pf
  FROM nba_api_data.v_player_page_game_fact b
  WHERE b.player_id IS NOT NULL
    AND b.game_id IS NOT NULL
    AND b.game_date IS NOT NULL
)
SELECT
  base.player_id,
  base.player_name,
  COALESCE(bio.raw_position, bio.position_group, 'F') AS position,
  COALESCE(bio.position_group, 'F') AS position_group,
  base.team_abbreviation,
  base.game_id,
  base.game_date,
  base.season,
  base.matchup,
  base.opponent_abbr,
  base.home_away,

  base.min,
  base.usage_pct,
  base.touches,
  base.rebound_chances,
  passing.passes_made,
  COALESCE(base.potential_ast, passing.potential_ast_tracking) AS potential_ast,
  base.rebound_off,
  base.rebound_def,

  base.pts,
  base.reb,
  base.ast,
  base.fgm,
  base.fga,
  base.fg3m,
  base.fg3a,
  base.ftm,
  base.fta,
  base.stl,
  base.blk,
  base.tov,
  base.pf,

  q1.q1_pts,
  q1.q1_reb,
  q1.q1_ast,
  q1.q1_oreb,
  q1.q1_dreb,
  CASE WHEN q1.game_id IS NULL THEN 0 ELSE 1 END AS has_q1_data,

  CASE
    WHEN base.touches IS NOT NULL
      OR base.rebound_chances IS NOT NULL
      OR COALESCE(base.potential_ast, passing.potential_ast_tracking) IS NOT NULL
      OR passing.passes_made IS NOT NULL
    THEN 1 ELSE 0
  END AS has_full_tracking,

  CASE
    WHEN COALESCE(base.potential_ast, passing.potential_ast_tracking) IS NOT NULL
      OR passing.passes_made IS NOT NULL
    THEN 1 ELSE 0
  END AS has_ast_tracking,

  CASE
    WHEN base.touches IS NOT NULL THEN 'TRACKING_OK'
    WHEN COALESCE(base.potential_ast, passing.potential_ast_tracking) IS NOT NULL THEN 'AST_TRACKING_OK'
    ELSE 'NO_TRACKING'
  END AS tracking_status,

  CASE WHEN dvp.team IS NULL THEN 0 ELSE 1 END AS has_dvp_rolling,
  dvp.pts_allowed::numeric    AS dvp_pts,
  dvp.reb_allowed::numeric    AS dvp_reb,
  dvp.ast_allowed::numeric    AS dvp_ast,
  dvp.threes_allow::numeric   AS dvp_3pt,
  NULL::numeric               AS dvp_fga,
  NULL::numeric               AS dvp_fg3a,
  NULL::numeric               AS dvp_fta,
  NULL::numeric               AS dvp_stl,
  NULL::numeric               AS dvp_blk,
  NULL::numeric               AS dvp_tov,
  NULL::numeric               AS dvp_pf
FROM base
LEFT JOIN bio
  ON bio.player_id = base.player_id
LEFT JOIN q1
  ON q1.game_id = base.game_id
 AND q1.player_id = base.player_id
LEFT JOIN passing
  ON passing.game_id = base.game_id
 AND passing.player_id = base.player_id
LEFT JOIN LATERAL (
  SELECT d.*
  FROM public.team_dvp d
  WHERE d.team = base.opponent_abbr
    AND d.position IN (
      COALESCE(bio.position_group, 'F'),
      CASE
        WHEN COALESCE(bio.position_group, 'F') = 'G-F' THEN 'G'
        WHEN COALESCE(bio.position_group, 'F') = 'F-C' THEN 'C'
        ELSE COALESCE(bio.position_group, 'F')
      END,
      CASE
        WHEN COALESCE(bio.position_group, 'F') = 'G-F' THEN 'F'
        WHEN COALESCE(bio.position_group, 'F') = 'F-C' THEN 'F'
        ELSE COALESCE(bio.position_group, 'F')
      END
    )
  ORDER BY CASE
    WHEN d.position = COALESCE(bio.position_group, 'F') THEN 0
    WHEN COALESCE(bio.position_group, 'F') = 'G-F' AND d.position = 'G' THEN 1
    WHEN COALESCE(bio.position_group, 'F') = 'G-F' AND d.position = 'F' THEN 2
    WHEN COALESCE(bio.position_group, 'F') = 'F-C' AND d.position = 'C' THEN 1
    WHEN COALESCE(bio.position_group, 'F') = 'F-C' AND d.position = 'F' THEN 2
    ELSE 9
  END
  LIMIT 1
) dvp ON true;

-- Checks rápidos después de crear la vista:
-- SELECT MIN(game_date), MAX(game_date), COUNT(*), COUNT(DISTINCT player_id), COUNT(DISTINCT game_id)
-- FROM nba_api_data.v_ludo_train_all_markets_gold;
--
-- SELECT COUNT(*) FILTER (WHERE position IS NOT NULL) position_rows,
--        COUNT(*) FILTER (WHERE q1_pts IS NOT NULL) q1_rows,
--        COUNT(*) FILTER (WHERE passes_made IS NOT NULL) pass_rows,
--        COUNT(*) FILTER (WHERE has_dvp_rolling = 1) dvp_rows
-- FROM nba_api_data.v_ludo_train_all_markets_gold;
