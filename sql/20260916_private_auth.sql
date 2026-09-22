-- Run once in DBeaver / Supabase SQL Editor as the database owner.
-- No sports tables are altered. Do NOT add app_private to exposed API schemas.
BEGIN;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_private.users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  attempts integer NOT NULL DEFAULT 0,
  attempt_window timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- The owner is the only administrator in this first release.
CREATE UNIQUE INDEX IF NOT EXISTS auth_one_admin ON app_private.users (role) WHERE role = 'admin';

CREATE TABLE IF NOT EXISTS app_private.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_private.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON app_private.sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON app_private.sessions (expires_at);

-- One fixed row, never one row per attacker-controlled username or IP.
CREATE TABLE IF NOT EXISTS app_private.login_budget (
  id integer PRIMARY KEY CHECK (id = 1),
  attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_private.login_budget (id) VALUES (1) ON CONFLICT DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
ALTER TABLE app_private.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.login_budget ENABLE ROW LEVEL SECURITY;
-- The server connects as the table owner through DATABASE_URL.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app_private FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM %I', r);
    END IF;
  END LOOP;
END $$;
COMMIT;
