-- Ludo v34 — checks previos para entrenar todos los mercados.
-- No modifica datos.

-- 1) Confirmar columnas clave en la fuente recomendada.
SELECT
  table_schema,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'nba_api_data'
  AND table_name IN ('v_player_page_game_fact', 'v_ludo_player_page_history_unified')
  AND column_name IN (
    'player_id','player_name','game_id','game_date','matchup','team_abbreviation','opponent_abbr',
    'min','minutes','usage_pct','usg','touches','tch','rebound_chances','potential_ast','passes_made',
    'pts','reb','ast','fgm','fga','fg3m','fg3a','ftm','fta','stl','blk','tov','pf',
    'pra','pr','pa','ra'
  )
ORDER BY table_schema, table_name, column_name;

-- 2) Rango y volumen de la fuente recomendada.
SELECT
  MIN(game_date)::date AS date_min,
  MAX(game_date)::date AS date_max,
  COUNT(*) AS filas,
  COUNT(DISTINCT player_id) AS jugadores,
  COUNT(DISTINCT game_id) AS juegos
FROM nba_api_data.v_player_page_game_fact;

-- 3) Cobertura de mercados nuevos.
SELECT
  COUNT(*) FILTER (WHERE stl IS NOT NULL) AS stl_rows,
  COUNT(*) FILTER (WHERE blk IS NOT NULL) AS blk_rows,
  COUNT(*) FILTER (WHERE tov IS NOT NULL) AS tov_rows,
  COUNT(*) FILTER (WHERE pf IS NOT NULL)  AS pf_rows
FROM nba_api_data.v_player_page_game_fact;

-- 4) Muestra rápida de targets nuevos.
SELECT
  player_name,
  COUNT(*) AS games,
  ROUND(AVG(stl)::numeric, 2) AS stl_avg,
  ROUND(AVG(blk)::numeric, 2) AS blk_avg,
  ROUND(AVG((COALESCE(stl,0)+COALESCE(blk,0)))::numeric, 2) AS stl_blk_avg,
  ROUND(AVG(tov)::numeric, 2) AS tov_avg,
  ROUND(AVG(pf)::numeric, 2) AS pf_avg
FROM nba_api_data.v_player_page_game_fact
WHERE game_date >= CURRENT_DATE - INTERVAL '2 years'
GROUP BY player_name
HAVING COUNT(*) >= 30
ORDER BY games DESC, player_name
LIMIT 50;
