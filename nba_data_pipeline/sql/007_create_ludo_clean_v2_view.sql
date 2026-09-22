CREATE OR REPLACE VIEW public.v_ludo_player_game_logs_clean_v2 AS
SELECT
    season AS season_year,
    season,
    season_type,

    game_id,
    game_date,

    player_id,
    player_name,

    team_id,
    team_abbreviation,
    team_name,

    matchup,
    home_away,
    opponent_abbr,
    wl,

    min,
    pts,
    reb,
    ast,
    stl,
    blk,
    tov,
    pf,

    fgm,
    fga,
    fg_pct,
    fg3m,
    fg3a,
    fg3_pct,
    ftm,
    fta,
    ft_pct,
    plus_minus,

    usage_pct,

    touches,
    passes_made,
    potential_ast,
    rebound_chances,
    rebound_off,
    rebound_def,

    source_base,
    source_advanced,
    source_usage,
    source_tracking,

    created_at,
    updated_at
FROM nba_api_data.player_game_logs_v2
WHERE season = '2025-26'
  AND season_type IN ('Regular Season', 'Playoffs');
