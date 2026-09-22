import { randomUUID } from 'node:crypto';
import { normalizeUsername, validPassword, hashPassword, verifyPassword, DUMMY_HASH,
  newToken, tokenDigest, validToken, temporaryPassword } from './password.mjs';

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const denied = () => new AuthError('Usuario o contraseña incorrectos, o acceso temporalmente bloqueado.', 401);
const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role,
  mustChangePassword: u.must_change_password });

export async function readSession(db, token) {
  if (!validToken(token)) return null;
  const rows = await db.$queryRaw`
    SELECT u.id, u.username, u.role, u.must_change_password
    FROM app_private.sessions s JOIN app_private.users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenDigest(token)} AND s.expires_at > now() AND u.active = true`;
  return rows[0] ? publicUser(rows[0]) : null;
}

async function reserveAttempt(db, username) {
  const rows = await db.$queryRaw`
    UPDATE app_private.users SET
      attempts = CASE WHEN attempt_window < now() - interval '15 minutes' THEN 1 ELSE attempts + 1 END,
      attempt_window = CASE WHEN attempt_window < now() - interval '15 minutes' THEN now() ELSE attempt_window END
    WHERE username = ${username} AND active = true
      AND (attempts < 5 OR attempt_window < now() - interval '15 minutes')
    RETURNING id, username, role, password_hash, must_change_password`;
  return rows[0];
}

async function issueSession(tx, userId) {
  // Called while the user row is locked: at most five active sessions per user.
  await tx.$executeRaw`DELETE FROM app_private.sessions WHERE expires_at <= now()`;
  await tx.$executeRaw`DELETE FROM app_private.sessions WHERE user_id = ${userId}::uuid
    AND token_hash NOT IN (SELECT token_hash FROM app_private.sessions
      WHERE user_id = ${userId}::uuid ORDER BY created_at DESC, token_hash LIMIT 4)`;
  const token = newToken();
  await tx.$executeRaw`INSERT INTO app_private.sessions (token_hash, user_id, expires_at)
    VALUES (${tokenDigest(token)}, ${userId}::uuid, now() + interval '12 hours')`;
  return token;
}

export async function login(db, name, password) {
  const username = normalizeUsername(name);
  if (!username || typeof password !== 'string' || password.length > 128 || Buffer.byteLength(password) > 512) throw denied();
  // Persistent across restarts/workers; capped writes and no trusted-IP assumptions.
  const budget = await db.$queryRaw`UPDATE app_private.login_budget SET
    attempts = CASE WHEN window_start < now() - interval '15 minutes' THEN 1 ELSE attempts + 1 END,
    window_start = CASE WHEN window_start < now() - interval '15 minutes' THEN now() ELSE window_start END
    WHERE id = 1 AND (attempts < 60 OR window_start < now() - interval '15 minutes') RETURNING id`;
  if (!budget.length) throw new AuthError('Demasiados intentos. Esperá 15 minutos antes de volver a entrar.', 429);
  const candidate = await reserveAttempt(db, username);
  const correct = await verifyPassword(password, candidate?.password_hash ?? DUMMY_HASH);
  if (!candidate || !correct) throw denied();
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT * FROM app_private.users WHERE id = ${candidate.id}::uuid FOR UPDATE`;
    const current = rows[0];
    if (!current?.active || current.password_hash !== candidate.password_hash) throw denied();
    await tx.$executeRaw`UPDATE app_private.users SET attempts = 0, attempt_window = now() WHERE id = ${current.id}::uuid`;
    const token = await issueSession(tx, current.id);
    return { token, user: publicUser(current) };
  });
}

export async function logout(db, token) {
  if (validToken(token)) await db.$executeRaw`DELETE FROM app_private.sessions WHERE token_hash = ${tokenDigest(token)}`;
}

export async function changePassword(db, token, oldPassword, password) {
  const user = await readSession(db, token);
  if (!user) throw new AuthError('Tu sesión venció. Volvé a ingresar.', 401);
  if (!validPassword(password)) throw new AuthError('Usá entre 6 y 128 caracteres.');
  if (password === oldPassword) throw new AuthError('Elegí una contraseña diferente a la actual.');
  const candidate = await reserveAttempt(db, user.username);
  if (!candidate || !await verifyPassword(oldPassword, candidate.password_hash)) throw denied();
  const hash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT * FROM app_private.users WHERE id = ${user.id}::uuid FOR UPDATE`;
    const current = rows[0];
    if (!current?.active || current.password_hash !== candidate.password_hash || !await readSession(tx, token)) throw denied();
    await tx.$executeRaw`UPDATE app_private.users SET password_hash = ${hash}, must_change_password = false,
      attempts = 0, attempt_window = now() WHERE id = ${user.id}::uuid`;
    await tx.$executeRaw`DELETE FROM app_private.sessions WHERE user_id = ${user.id}::uuid`;
    return { token: await issueSession(tx, user.id) };
  });
}

async function lockAdmin(tx, token) {
  const actor = await readSession(tx, token);
  if (!actor) throw new AuthError('Acceso requerido.', 401);
  const rows = await tx.$queryRaw`SELECT id FROM app_private.users
    WHERE id = ${actor.id}::uuid AND role = 'admin' AND active = true AND must_change_password = false FOR UPDATE`;
  if (!rows.length || !await readSession(tx, token)) throw new AuthError('Solo el administrador puede gestionar cuentas.', 403);
  return actor;
}

export async function listUsers(db, token) {
  const actor = await readSession(db, token);
  if (!actor || actor.role !== 'admin' || actor.mustChangePassword) throw new AuthError('Acceso denegado.', 403);
  return db.$queryRaw`SELECT id, username, role, active, must_change_password, created_at
    FROM app_private.users ORDER BY created_at DESC LIMIT 500`;
}

export async function manageUser(db, token, input) {
  const action = input?.action;
  if (!['create', 'reset', 'disable', 'enable', 'delete'].includes(action)) throw new AuthError('Operación inválida.');
  const username = normalizeUsername(input.username);
  if (!username) throw new AuthError('Usuario: 3 a 32 caracteres; letras sin acentos, números, punto, guion o guion bajo.');
  // Authorization precedes the expensive hash and is checked again inside the transaction.
  const actor = await readSession(db, token);
  if (!actor || actor.role !== 'admin' || actor.mustChangePassword) throw new AuthError('Acceso denegado.', 403);
  const password = ['create', 'reset'].includes(action) ? temporaryPassword() : null;
  const hash = password ? await hashPassword(password) : null;
  return db.$transaction(async (tx) => {
    await lockAdmin(tx, token);
    if (action === 'create') {
      const rows = await tx.$queryRaw`INSERT INTO app_private.users (id, username, password_hash)
        VALUES (${randomUUID()}::uuid, ${username}, ${hash}) ON CONFLICT (username) DO NOTHING RETURNING id`;
      if (!rows.length) throw new AuthError('Ese nombre de usuario ya existe.', 409);
    } else {
      const rows = await tx.$queryRaw`SELECT id, role FROM app_private.users WHERE username = ${username} FOR UPDATE`;
      const target = rows[0];
      if (!target) throw new AuthError('No se encontró la cuenta.', 404);
      if (target.role === 'admin') throw new AuthError('Tu cuenta se modifica desde Mi cuenta. No se puede desactivar ni eliminar al administrador.', 403);
      if (action === 'delete') {
        if (input.userId !== target.id || input.confirmUsername !== username) {
          throw new AuthError('Para eliminar, confirmá la cuenta escribiendo su nombre de usuario exacto.');
        }
        // Sessions are removed by the existing ON DELETE CASCADE foreign key.
        await tx.$executeRaw`DELETE FROM app_private.users WHERE id = ${target.id}::uuid AND role = 'user'`;
        return { username, deleted: true };
      }
      if (action === 'reset') {
        await tx.$executeRaw`UPDATE app_private.users SET password_hash = ${hash}, must_change_password = true,
          attempts = 0, attempt_window = now() WHERE id = ${target.id}::uuid`;
      } else {
        await tx.$executeRaw`UPDATE app_private.users SET active = ${action === 'enable'}, attempts = 0,
          attempt_window = now() WHERE id = ${target.id}::uuid`;
      }
      await tx.$executeRaw`DELETE FROM app_private.sessions WHERE user_id = ${target.id}::uuid`;
    }
    return { username, temporaryPassword: password };
  });
}
