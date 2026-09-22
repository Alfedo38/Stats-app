CREATE TABLE IF NOT EXISTS nba_api_data.missing_tracking_games (
    game_id text PRIMARY KEY,
    season text NOT NULL,
    season_type text NOT NULL,
    game_date date,

    missing_touches integer DEFAULT 0,
    missing_passes_made integer DEFAULT 0,
    missing_potential_ast integer DEFAULT 0,
    missing_rebound_chances integer DEFAULT 0,
    missing_usage_pct integer DEFAULT 0,

    status text DEFAULT 'pending',
    attempts integer DEFAULT 0,
    last_error text,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

INSERT INTO nba_api_data.missing_tracking_games (
    game_id,
    season,
    season_type,
    game_date,
    missing_touches,
    missing_passes_made,
    missing_potential_ast,
    missing_rebound_chances,
    missing_usage_pct,
    status,
    updated_at
)
SELECT
    game_id,
    season,
    season_type,
    game_date,
    COUNT(*) FILTER (WHERE touches IS NULL) AS missing_touches,
    COUNT(*) FILTER (WHERE passes_made IS NULL) AS missing_passes_made,
    COUNT(*) FILTER (WHERE potential_ast IS NULL) AS missing_potential_ast,
    COUNT(*) FILTER (WHERE rebound_chances IS NULL) AS missing_rebound_chances,
    COUNT(*) FILTER (WHERE usage_pct IS NULL) AS missing_usage_pct,
    'pending' AS status,
    now() AS updated_at
FROM nba_api_data.player_game_logs_v2
WHERE touches IS NULL
   OR passes_made IS NULL
   OR potential_ast IS NULL
   OR rebound_chances IS NULL
   OR usage_pct IS NULL
GROUP BY game_id, season, season_type, game_date
ON CONFLICT (game_id)
DO UPDATE SET
    season = EXCLUDED.season,
    season_type = EXCLUDED.season_type,
    game_date = EXCLUDED.game_date,
    missing_touches = EXCLUDED.missing_touches,
    missing_passes_made = EXCLUDED.missing_passes_made,
    missing_potential_ast = EXCLUDED.missing_potential_ast,
    missing_rebound_chances = EXCLUDED.missing_rebound_chances,
    missing_usage_pct = EXCLUDED.missing_usage_pct,
    status = 'pending',
    updated_at = now();

SELECT
    *
FROM nba_api_data.missing_tracking_games
ORDER BY game_date, game_id;
