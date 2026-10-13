#!/usr/bin/env node
// Solo lectura. No imprime claves, conexiones ni contenido de tablas.
import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const report = { version: 1, servidor: {}, lecturas_wnba: [], base: null };
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
let keyType = 'ausente';
if (key?.startsWith('sb_secret_')) keyType = 'secreta';
else if (key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    keyType = payload.role === 'service_role' ? 'service_role' : 'no_administrativa';
  } catch { keyType = 'formato_no_reconocido'; }
}
report.servidor = { url_configurada: Boolean(url), tipo_clave: keyType };
if (url && ['secreta', 'service_role'].includes(keyType)) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
  for (const view of [
    'v_wnba_daily_games', 'v_wnba_games', 'v_wnba_team_roster',
    'v_wnba_teams', 'v_wnba_player_game_logs', 'v_wnba_player_season_matchups',
    'v_wnba_player_shots', 'v_wnba_current_roster',
  ]) {
    try {
      const { error } = await client.from(view).select('*').limit(1);
      report.lecturas_wnba.push({ vista: view, ok: !error, codigo: error?.code || null });
    } catch { report.lecturas_wnba.push({ vista: view, ok: false, codigo: 'CONEXION' }); }
  }
}
const db = new PrismaClient({ log: [] });
try {
  const [role] = await db.$queryRaw`
    SELECT current_user AS rol, current_database() AS base,
      r.rolsuper AS superusuario, r.rolbypassrls AS omite_rls
    FROM pg_roles r WHERE r.rolname = current_user`;
  const objects = await db.$queryRaw`
    SELECT n.nspname AS esquema, c.relname AS objeto, c.relkind::text AS tipo,
      c.relrowsecurity AS rls, c.reloptions AS opciones,
      pg_get_userbyid(c.relowner) AS propietario,
      r.rolname AS rol,
      has_schema_privilege(r.oid, n.oid, 'USAGE') AS usa_esquema,
      has_table_privilege(r.oid, c.oid, 'SELECT') AS lectura,
      has_any_column_privilege(r.oid, c.oid, 'SELECT') AS lectura_columnas,
      has_table_privilege(r.oid, c.oid, 'INSERT') AS insertar,
      has_any_column_privilege(r.oid, c.oid, 'INSERT') AS insertar_columnas,
      has_table_privilege(r.oid, c.oid, 'UPDATE') AS actualizar,
      has_any_column_privilege(r.oid, c.oid, 'UPDATE') AS actualizar_columnas,
      has_table_privilege(r.oid, c.oid, 'DELETE') AS borrar,
      has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS vaciar
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN pg_roles r
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'v', 'm')
      AND r.rolname IN ('anon', 'authenticated', 'service_role')
    ORDER BY n.nspname, c.relname, r.rolname`;
  const functions = await db.$queryRaw`
    SELECT n.nspname AS esquema, p.proname AS funcion,
      pg_get_function_identity_arguments(p.oid) AS argumentos,
      p.prosecdef AS security_definer, p.proconfig AS configuracion,
      has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usa_esquema,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ejecuta,
      has_schema_privilege('authenticated', n.oid, 'USAGE') AS auth_usa_esquema,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ejecuta,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS servicio_ejecuta
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    ORDER BY n.nspname, p.proname, argumentos`;
  report.base = { conexion: role, objetos: objects, funciones: functions };
} catch {
  report.base = { error: 'No se pudo leer la configuración usando DATABASE_URL. No se muestran detalles para proteger la conexión.' };
  process.exitCode = 1;
} finally { await db.$disconnect(); }
console.log(JSON.stringify(report, null, 2));
if (!['secreta', 'service_role'].includes(keyType) || report.lecturas_wnba.some(x => !x.ok)) process.exitCode = 1;
