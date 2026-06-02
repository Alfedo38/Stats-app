-- Ludo v35 — checks de la gold view.

SELECT
  MIN(game_date)::date AS date_min,
  MAX(game_date)::date AS date_max,
  COUNT(*) AS filas,
  COUNT(DISTINCT player_id) AS jugadores,
  COUNT(DISTINCT game_id) AS juegos
FROM nba_api_data.v_ludo_train_all_markets_gold;

SELECT
  COUNT(*) FILTER (WHERE position IS NOT NULL) AS position_rows,
  COUNT(*) FILTER (WHERE position_group IS NOT NULL) AS position_group_rows,
  COUNT(*) FILTER (WHERE q1_pts IS NOT NULL) AS q1_rows,
  COUNT(*) FILTER (WHERE passes_made IS NOT NULL) AS passes_rows,
  COUNT(*) FILTER (WHERE has_full_tracking = 1) AS tracking_rows,
  COUNT(*) FILTER (WHERE has_ast_tracking = 1) AS ast_tracking_rows,
  COUNT(*) FILTER (WHERE has_dvp_rolling = 1) AS dvp_rows,
  COUNT(*) FILTER (WHERE stl IS NOT NULL) AS stl_rows,
  COUNT(*) FILTER (WHERE blk IS NOT NULL) AS blk_rows,
  COUNT(*) FILTER (WHERE tov IS NOT NULL) AS tov_rows,
  COUNT(*) FILTER (WHERE pf IS NOT NULL) AS pf_rows
FROM nba_api_data.v_ludo_train_all_markets_gold;

SELECT
  player_name,
  position,
  position_group,
  COUNT(*) AS games,
  ROUND(AVG(min)::numeric, 1) AS avg_min,
  ROUND(AVG(pts)::numeric, 1) AS avg_pts,
  ROUND(AVG(stl)::numeric, 2) AS avg_stl,
  ROUND(AVG(blk)::numeric, 2) AS avg_blk,
  ROUND(AVG(tov)::numeric, 2) AS avg_tov,
  ROUND(AVG(pf)::numeric, 2) AS avg_pf
FROM nba_api_data.v_ludo_train_all_markets_gold
GROUP BY player_name, position, position_group
HAVING COUNT(*) >= 20
ORDER BY games DESC, avg_min DESC
LIMIT 50;
