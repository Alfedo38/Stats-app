-- Opcional. Ejecutar como script completo, sin actualizaciones NBA en curso.
-- Retira solo dos copias del índice (player_id, game_date DESC).
-- Si falla, ejecutar ROLLBACK; no usar CASCADE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$
DECLARE
  keeper pg_index%ROWTYPE;
  candidate pg_index%ROWTYPE;
  index_name text;
BEGIN
  SELECT * INTO keeper FROM pg_index
    WHERE indexrelid = to_regclass('public.idx_ppgfc_player_date');
  IF NOT FOUND OR NOT keeper.indisvalid OR NOT keeper.indisready
    OR keeper.indrelid <> 'public.player_page_game_fact_cache'::regclass THEN
    RAISE EXCEPTION 'No se encontró el índice válido que debe conservarse.';
  END IF;
  FOREACH index_name IN ARRAY ARRAY['idx_ppgfc_player_id_date_fast2','idx_ppgfc_player_latest_fast'] LOOP
    SELECT * INTO candidate FROM pg_index WHERE indexrelid = to_regclass('public.' || index_name);
    IF NOT FOUND THEN CONTINUE; END IF;
    IF candidate.indrelid <> keeper.indrelid
      OR candidate.indkey <> keeper.indkey OR candidate.indclass <> keeper.indclass
      OR candidate.indcollation <> keeper.indcollation OR candidate.indoption <> keeper.indoption
      OR candidate.indnatts <> keeper.indnatts OR candidate.indnkeyatts <> keeper.indnkeyatts
      OR candidate.indisunique OR candidate.indisprimary OR candidate.indisreplident OR candidate.indisclustered
      OR candidate.indpred IS NOT NULL OR keeper.indpred IS NOT NULL
      OR candidate.indexprs IS NOT NULL OR keeper.indexprs IS NOT NULL
      OR (SELECT relam FROM pg_class WHERE oid = candidate.indexrelid)
         <> (SELECT relam FROM pg_class WHERE oid = keeper.indexrelid)
      OR EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = candidate.indexrelid)
    THEN RAISE EXCEPTION 'El índice % no es una copia prescindible; no se elimina.', index_name;
    END IF;
    EXECUTE format('DROP INDEX public.%I', index_name);
  END LOOP;
END $$;
COMMIT;
SELECT pg_size_pretty(pg_total_relation_size('public.player_page_game_fact_cache')) AS cache_total;
