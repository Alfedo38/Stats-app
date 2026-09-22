CREATE TABLE IF NOT EXISTS nba_api_data.player_game_logs_v2 (
    season              text NOT NULL,
    season_type         text NOT NULL,
    game_id             text NOT NULL,
    game_date           date,
    player_id           bigint NOT NULL,
    player_name         text,
    team_id             bigint,
    team_abbreviation   text,
    team_name           text,
    matchup             text,
    home_away           text,
    opponent_abbr       text,
    wl                  text,

    min                 double precision,
    pts                 double precision,
    reb                 double precision,
    ast                 double precision,
    stl                 double precision,
    blk                 double precision,
    tov                 double precision,
    pf                  double precision,

    fgm                 double precision,
    fga                 double precision,
    fg_pct              double precision,
    fg3m                double precision,
    fg3a                double precision,
    fg3_pct             double precision,
    ftm                 double precision,
    fta                 double precision,
    ft_pct              double precision,
    plus_minus          double precision,

    usage_pct           double precision,

    touches             double precision,
    passes_made         double precision,
    potential_ast       double precision,
    rebound_chances     double precision,
    rebound_off         double precision,
    rebound_def         double precision,

    source_base         boolean DEFAULT false,
    source_advanced     boolean DEFAULT false,
    source_usage        boolean DEFAULT false,
    source_tracking     boolean DEFAULT false,

    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),

    PRIMARY KEY (season, season_type, game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pgl_v2_player_date
ON nba_api_data.player_game_logs_v2(player_id, game_date);

CREATE INDEX IF NOT EXISTS idx_pgl_v2_game
ON nba_api_data.player_game_logs_v2(game_id);

CREATE INDEX IF NOT EXISTS idx_pgl_v2_team_date
ON nba_api_data.player_game_logs_v2(team_abbreviation, game_date);

CREATE INDEX IF NOT EXISTS idx_pgl_v2_season_type
ON nba_api_data.player_game_logs_v2(season, season_type);
