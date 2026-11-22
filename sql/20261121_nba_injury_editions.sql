CREATE SCHEMA IF NOT EXISTS nba_api_data;
CREATE TABLE IF NOT EXISTS nba_api_data.nba_injury_editions (
  game_date date NOT NULL,
  matchup text NOT NULL CHECK (matchup ~ '^[A-Z]{2,3}@[A-Z]{2,3}$'),
  team text NOT NULL CHECK (char_length(team) BETWEEN 1 AND 60),
  state text NOT NULL CHECK (state IN ('listed', 'pending', 'clear')),
  players jsonb NOT NULL CHECK (jsonb_typeof(players)='array' AND jsonb_array_length(players) <= 30),
  report_ts timestamptz NOT NULL,
  PRIMARY KEY (game_date, matchup, team),
  CHECK ((state = 'listed') = (jsonb_array_length(players) > 0))
);
ALTER TABLE nba_api_data.nba_injury_editions ENABLE ROW LEVEL SECURITY;
