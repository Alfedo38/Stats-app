-- v40 · índices recomendados para acelerar /api/team-players
-- Ejecutar una vez en Supabase/DBeaver.

CREATE INDEX IF NOT EXISTS idx_ppgfc_team_player_date_fast
ON public.player_page_game_fact_cache(team_abbreviation, player_id, game_date DESC);

CREATE INDEX IF NOT EXISTS idx_ppgfc_player_latest_fast
ON public.player_page_game_fact_cache(player_id, game_date DESC);

CREATE INDEX IF NOT EXISTS idx_latest_prop_odds_book_stat_norm_fast
ON public.latest_player_prop_odds ((lower(book)), stat_key, player_norm, scraped_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_nba_injuries_team_created_fast
ON public.nba_injuries(team_abbreviation, created_at DESC);

ANALYZE public.player_page_game_fact_cache;
ANALYZE public.latest_player_prop_odds;
ANALYZE public.nba_injuries;
