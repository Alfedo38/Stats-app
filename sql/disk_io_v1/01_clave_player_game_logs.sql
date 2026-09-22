-- Ejecutar como script completo en DBeaver. Cron NBA pausado.
-- No borra ni corrige datos. Si hay errores, ejecutar ROLLBACK.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.player_game_logs IN SHARE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.player_game_logs WHERE player_id IS NULL OR game_id IS NULL) THEN
    RAISE EXCEPTION 'Hay claves nulas; no se crea el índice.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.player_game_logs GROUP BY player_id, game_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay pares jugador/partido duplicados; no se crea el índice.';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_game_logs_player_game
  ON public.player_game_logs (player_id, game_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indexrelid = 'public.uq_player_game_logs_player_game'::regclass
      AND i.indrelid = 'public.player_game_logs'::regclass
      AND i.indisvalid AND i.indisunique AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 2
      AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, pos)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          WHERE k.pos <= i.indnkeyatts ORDER BY a.attname) = ARRAY['game_id','player_id']
  ) THEN
    RAISE EXCEPTION 'El índice existente tiene otra definición o no es válido.';
  END IF;
END $$;
COMMIT;
SELECT MAX(game_date) AS ultima_fecha, COUNT(*) AS filas FROM public.player_game_logs;
