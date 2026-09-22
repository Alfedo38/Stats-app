-- Cantidad de filas por temporada y tipo
SELECT
    season_year,
    season,
    season_type,
    COUNT(*) AS rows,
    COUNT(DISTINCT game_id) AS games,
    COUNT(DISTINCT player_id) AS players
FROM public.player_game_logs
GROUP BY season_year, season, season_type
ORDER BY season_year DESC, season DESC, season_type;

-- Campos tracking faltantes
SELECT
    season_year,
    season,
    season_type,
    COUNT(*) AS rows,
    COUNT(*) FILTER (WHERE touches IS NOT NULL) AS rows_with_touches,
    COUNT(*) FILTER (WHERE potential_ast IS NOT NULL) AS rows_with_potential_ast,
    COUNT(*) FILTER (WHERE rebound_chances IS NOT NULL) AS rows_with_rebound_chances,
    COUNT(*) FILTER (WHERE usage_pct IS NOT NULL) AS rows_with_usage
FROM public.player_game_logs
GROUP BY season_year, season, season_type
ORDER BY season_year DESC, season DESC, season_type;

-- Fechas disponibles
SELECT
    MIN(game_date) AS min_game_date,
    MAX(game_date) AS max_game_date,
    COUNT(DISTINCT game_date) AS total_dates,
    COUNT(DISTINCT game_id) AS total_games,
    COUNT(*) AS total_rows
FROM public.player_game_logs;

-- Comparar staging vs final
SELECT
    'staging' AS table_name,
    COUNT(*) AS rows,
    COUNT(DISTINCT game_id) AS games,
    COUNT(DISTINCT player_id) AS players
FROM public.player_game_log_staging

UNION ALL

SELECT
    'final' AS table_name,
    COUNT(*) AS rows,
    COUNT(DISTINCT game_id::text) AS games,
    COUNT(DISTINCT player_id) AS players
FROM public.player_game_logs;
