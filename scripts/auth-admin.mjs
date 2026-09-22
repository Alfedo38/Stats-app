#!/usr/bin/env node
// Local-only bootstrap / owner recovery. Never expose this script through HTTP.
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { normalizeUsername, temporaryPassword, hashPassword } from '../lib/auth/password.mjs';

loadEnvConfig(process.cwd());
const [action, name] = process.argv.slice(2);
const username = normalizeUsername(name);
if (!['create', 'reset'].includes(action) || !username) {
  console.error('Uso: node scripts/auth-admin.mjs create maxi\nRecuperar administrador: node scripts/auth-admin.mjs reset maxi');
  process.exit(1);
}
const db = new PrismaClient();
try {
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE app_private.users IN SHARE ROW EXCLUSIVE MODE`;
    if (action === 'create') {
      const existing = await tx.$queryRaw`SELECT id FROM app_private.users WHERE role = 'admin'`;
      if (existing.length) throw new Error('Ya existe un administrador. Usá reset para recuperar su acceso.');
      const names = await tx.$queryRaw`SELECT id FROM app_private.users WHERE username = ${username}`;
      if (names.length) throw new Error('Ese nombre ya pertenece a otra cuenta.');
      await tx.$executeRaw`INSERT INTO app_private.users (id, username, password_hash, role)
        VALUES (${randomUUID()}::uuid, ${username}, ${hash}, 'admin')`;
    } else {
      const rows = await tx.$queryRaw`UPDATE app_private.users SET password_hash = ${hash},
        active = true, must_change_password = true, attempts = 0, attempt_window = now()
        WHERE username = ${username} AND role = 'admin' RETURNING id`;
      if (!rows.length) throw new Error('No existe ese administrador.');
      await tx.$executeRaw`DELETE FROM app_private.sessions WHERE user_id = ${rows[0].id}::uuid`;
    }
    await tx.$executeRaw`UPDATE app_private.login_budget SET attempts = 0, window_start = now() WHERE id = 1`;
  });
  console.log(`\nAdministrador: ${username}\nContraseña temporal: ${password}\n\nGuardala en privado. Al entrar deberás cambiarla. No la pegues en chats ni capturas.`);
} catch (e) {
  // Avoid printing Prisma errors containing database URLs / credentials.
  if (e.constructor === Error) console.error(e.message);
  else console.error('No se pudo preparar la cuenta. Verificá DATABASE_URL y ejecutá primero sql/20260916_private_auth.sql.');
  process.exitCode = 1;
} finally { await db.$disconnect(); }
