WITH normalized AS (
    SELECT
        '2025-26'::text AS season,

        CASE LEFT(LPAD(game_id::text, 10, '0'), 3)
            WHEN '002' THEN 'Regular Season'
            WHEN '004' THEN 'Playoffs'
            ELSE 'Unknown'
        END AS season_type,

        LPAD(game_id::text, 10, '0') AS game_id,
        game_date,
        player_id::bigint AS player_id,
        player_name,
        team_id::bigint AS team_id,
        team_abbreviation,
        team_name,
        matchup,
        home_away,
        opponent_abbr,
        wl,

        min::double precision AS min,
        pts::double precision AS pts,
        reb::double precision AS reb,
        ast::double precision AS ast,
        stl::double precision AS stl,
        blk::double precision AS blk,
        tov::double precision AS tov,
        pf::double precision AS pf,

        fgm::double precision AS fgm,
        fga::double precision AS fga,
        fg_pct::double precision AS fg_pct,
        fg3m::double precision AS fg3m,
        fg3a::double precision AS fg3a,
        fg3_pct::double precision AS fg3_pct,
        ftm::double precision AS ftm,
        fta::double precision AS fta,
        ft_pct::double precision AS ft_pct,
        plus_minus::double precision AS plus_minus,

        usage_pct::double precision AS usage_pct,

        touches::double precision AS touches,
        passes_made::double precision AS passes_made,
        potential_ast::double precision AS potential_ast,
        rebound_chances::double precision AS rebound_chances,
        rebound_off::double precision AS rebound_off,
        rebound_def::double precision AS rebound_def,

        true AS source_base,
        false AS source_advanced,
        usage_pct IS NOT NULL AS source_usage,
        (
            touches IS NOT NULL
            OR passes_made IS NOT NULL
            OR potential_ast IS NOT NULL
            OR rebound_chances IS NOT NULL
        ) AS source_tracking,

        ROW_NUMBER() OVER (
            PARTITION BY LPAD(game_id::text, 10, '0'), player_id
            ORDER BY
                (
                    CASE WHEN touches IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN potential_ast IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN rebound_chances IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN usage_pct IS NOT NULL THEN 1 ELSE 0 END +
                    CASE WHEN passes_made IS NOT NULL THEN 1 ELSE 0 END
                ) DESC,
                game_date DESC
        ) AS rn

    FROM public.player_game_logs
    WHERE game_date BETWEEN DATE '2025-10-01' AND DATE '2026-06-30'
      AND game_id IS NOT NULL
      AND player_id IS NOT NULL
      AND LEFT(LPAD(game_id::text, 10, '0'), 3) IN ('002', '004')
),
deduped AS (
    SELECT *
    FROM normalized
    WHERE rn = 1
)
INSERT INTO nba_api_data.player_game_logs_v2 (
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
    updated_at
)
SELECT
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
    now()
FROM deduped
WHERE season_type IN ('Regular Season', 'Playoffs')
ON CONFLICT (season, season_type, game_id, player_id)
DO UPDATE SET
    game_date = EXCLUDED.game_date,
    player_name = EXCLUDED.player_name,
    team_id = EXCLUDED.team_id,
    team_abbreviation = EXCLUDED.team_abbreviation,
    team_name = EXCLUDED.team_name,
    matchup = EXCLUDED.matchup,
    home_away = EXCLUDED.home_away,
    opponent_abbr = EXCLUDED.opponent_abbr,
    wl = EXCLUDED.wl,
    min = EXCLUDED.min,
    pts = EXCLUDED.pts,
    reb = EXCLUDED.reb,
    ast = EXCLUDED.ast,
    stl = EXCLUDED.stl,
    blk = EXCLUDED.blk,
    tov = EXCLUDED.tov,
    pf = EXCLUDED.pf,
    fgm = EXCLUDED.fgm,
    fga = EXCLUDED.fga,
    fg_pct = EXCLUDED.fg_pct,
    fg3m = EXCLUDED.fg3m,
    fg3a = EXCLUDED.fg3a,
    fg3_pct = EXCLUDED.fg3_pct,
    ftm = EXCLUDED.ftm,
    fta = EXCLUDED.fta,
    ft_pct = EXCLUDED.ft_pct,
    plus_minus = EXCLUDED.plus_minus,
    usage_pct = EXCLUDED.usage_pct,
    touches = EXCLUDED.touches,
    passes_made = EXCLUDED.passes_made,
    potential_ast = EXCLUDED.potential_ast,
    rebound_chances = EXCLUDED.rebound_chances,
    rebound_off = EXCLUDED.rebound_off,
    rebound_def = EXCLUDED.rebound_def,
    source_base = EXCLUDED.source_base,
    source_advanced = EXCLUDED.source_advanced,
    source_usage = EXCLUDED.source_usage,
    source_tracking = EXCLUDED.source_tracking,
    updated_at = now();
