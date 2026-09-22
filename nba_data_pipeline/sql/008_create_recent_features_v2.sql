CREATE OR REPLACE VIEW public.v_ludo_player_recent_features_v2 AS
WITH base AS (
    SELECT
        season_year,
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
        rebound_def
    FROM public.v_ludo_player_game_logs_clean_v2
),
features AS (
    SELECT
        b.*,

        COUNT(*) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS games_before,

        COUNT(*) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS games_l5,

        COUNT(*) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS games_l10,

        AVG(min) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS min_l5,

        AVG(min) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS min_l10,

        AVG(pts) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS pts_l5,

        AVG(pts) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS pts_l10,

        AVG(reb) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS reb_l5,

        AVG(reb) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS reb_l10,

        AVG(ast) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS ast_l5,

        AVG(ast) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS ast_l10,

        AVG(stl) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS stl_l5,

        AVG(stl) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS stl_l10,

        AVG(blk) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS blk_l5,

        AVG(blk) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS blk_l10,

        AVG(tov) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS tov_l5,

        AVG(tov) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS tov_l10,

        AVG(fga) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS fga_l5,

        AVG(fga) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS fga_l10,

        AVG(fg3a) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS fg3a_l5,

        AVG(fg3a) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS fg3a_l10,

        AVG(fta) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS fta_l5,

        AVG(fta) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS fta_l10,

        AVG(usage_pct) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS usage_pct_l5,

        AVG(usage_pct) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS usage_pct_l10,

        AVG(touches) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS touches_l5,

        AVG(touches) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS touches_l10,

        AVG(passes_made) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS passes_made_l5,

        AVG(passes_made) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS passes_made_l10,

        AVG(rebound_chances) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
        ) AS rebound_chances_l5,

        AVG(rebound_chances) OVER (
            PARTITION BY player_id
            ORDER BY game_date, game_id
            ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
        ) AS rebound_chances_l10

    FROM base b
)
SELECT *
FROM features;
