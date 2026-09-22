-- =====================================================
-- AUDITORÍA DE FALTANTES EN player_game_logs_v2
-- =====================================================

-- 1) Resumen general por season_type
SELECT
    season,
    season_type,
    MIN(game_date) AS min_game_date,
    MAX(game_date) AS max_game_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT game_id) AS games,
    COUNT(DISTINCT player_id) AS players,

    COUNT(*) FILTER (WHERE touches IS NULL) AS missing_touches,
    COUNT(*) FILTER (WHERE passes_made IS NULL) AS missing_passes_made,
    COUNT(*) FILTER (WHERE potential_ast IS NULL) AS missing_potential_ast,
    COUNT(*) FILTER (WHERE rebound_chances IS NULL) AS missing_rebound_chances,
    COUNT(*) FILTER (WHERE usage_pct IS NULL) AS missing_usage_pct,

    COUNT(*) FILTER (
        WHERE touches IS NULL
           OR passes_made IS NULL
           OR potential_ast IS NULL
           OR rebound_chances IS NULL
           OR usage_pct IS NULL
    ) AS rows_with_any_missing_tracking
FROM nba_api_data.player_game_logs_v2
GROUP BY season, season_type
ORDER BY season, season_type;


-- 2) Faltantes agrupados por partido
SELECT
    season,
    season_type,
    game_date,
    game_id,
    COUNT(*) AS rows,
    COUNT(*) FILTER (WHERE touches IS NULL) AS missing_touches,
    COUNT(*) FILTER (WHERE passes_made IS NULL) AS missing_passes_made,
    COUNT(*) FILTER (WHERE potential_ast IS NULL) AS missing_potential_ast,
    COUNT(*) FILTER (WHERE rebound_chances IS NULL) AS missing_rebound_chances,
    COUNT(*) FILTER (WHERE usage_pct IS NULL) AS missing_usage_pct
FROM nba_api_data.player_game_logs_v2
WHERE touches IS NULL
   OR passes_made IS NULL
   OR potential_ast IS NULL
   OR rebound_chances IS NULL
   OR usage_pct IS NULL
GROUP BY season, season_type, game_date, game_id
ORDER BY game_date, game_id;


-- 3) Filas exactas donde falta potential_ast
SELECT
    season,
    season_type,
    game_date,
    game_id,
    player_id,
    player_name,
    team_abbreviation,
    matchup,
    min,
    pts,
    reb,
    ast,
    touches,
    passes_made,
    potential_ast,
    rebound_chances,
    usage_pct
FROM nba_api_data.player_game_logs_v2
WHERE potential_ast IS NULL
ORDER BY game_date, game_id, team_abbreviation, player_name;


-- 4) Cantidad de partidos por fecha
SELECT
    season,
    season_type,
    game_date,
    COUNT(DISTINCT game_id) AS games,
    COUNT(*) AS rows
FROM nba_api_data.player_game_logs_v2
GROUP BY season, season_type, game_date
ORDER BY game_date;


-- 5) Control de duplicados
SELECT
    season,
    season_type,
    game_id,
    player_id,
    COUNT(*) AS repeated_rows
FROM nba_api_data.player_game_logs_v2
GROUP BY season, season_type, game_id, player_id
HAVING COUNT(*) > 1
ORDER BY repeated_rows DESC;
