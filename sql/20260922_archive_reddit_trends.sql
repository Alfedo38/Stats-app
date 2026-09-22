-- Radar Social fue retirado de la aplicación el 2026-09-22.
-- Se archiva la tabla en lugar de borrar datos de forma irreversible.
DO $$
BEGIN
  IF to_regclass('public.reddit_trends') IS NOT NULL
     AND to_regclass('public.reddit_trends_archived_20260922') IS NULL THEN
    ALTER TABLE public.reddit_trends
      RENAME TO reddit_trends_archived_20260922;
  END IF;
END $$;
