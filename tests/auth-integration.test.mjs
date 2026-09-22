import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword, tokenDigest, newToken } from '../lib/auth/password.mjs';
import { login, logout, readSession, changePassword, manageUser, listUsers } from '../lib/auth/service.mjs';

// Never run against the application database. Use a fresh, disposable local DB
// with sql/20260916_private_auth.sql already applied. No cleanup of user tables.
const url = process.env.AUTH_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || process.env.AUTH_TEST_DISPOSABLE !== 'yes')) {
  throw new Error('Use only a disposable LOCAL database and AUTH_TEST_DISPOSABLE=yes.');
}
test('ciclo completo: acceso, permisos, revocación, expiración y límites', { skip: !url }, async (t) => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => db.$disconnect());
  const adminId = randomUUID();
  const firstPassword = 'Temporary Admin Password 2026';
  const hash = await hashPassword(firstPassword);
  await db.$executeRaw`INSERT INTO app_private.users (id, username, password_hash, role)
    VALUES (${adminId}::uuid, 'owner_test', ${hash}, 'admin')`;

  await t.test('contraseña incorrecta, usuario inexistente y token falso no dan acceso', async () => {
    await assert.rejects(login(db, 'owner_test', 'wrong'), e => e.status === 401);
    await assert.rejects(login(db, 'nobody_test', 'wrong'), e => e.status === 401);
    assert.equal(await readSession(db, newToken()), null);
    assert.equal(await readSession(db, undefined), null);
  });
  let admin = await login(db, 'OWNER_TEST', firstPassword);
  await t.test('contraseña temporal bloquea administración; cambio rota sesión', async () => {
    assert.equal(admin.user.mustChangePassword, true);
    await assert.rejects(manageUser(db, admin.token, { action: 'create', username: 'viewer_test' }), e => e.status === 403);
    const old = admin.token;
    admin = await changePassword(db, old, firstPassword, 'Permanent Admin Password 2026');
    assert.equal(await readSession(db, old), null);
    assert.equal((await readSession(db, admin.token)).mustChangePassword, false);
  });
  let account;
  await t.test('solo administrador crea cuentas normales; duplicados y auto-desactivación rechazados', async () => {
    account = await manageUser(db, admin.token, { action: 'create', username: 'Viewer_Test', role: 'admin' });
    await assert.rejects(manageUser(db, admin.token, { action: 'create', username: 'viewer_test' }), e => e.status === 409);
    await assert.rejects(manageUser(db, admin.token, { action: 'disable', username: 'owner_test' }), e => e.status === 403);
    const users = await listUsers(db, admin.token);
    assert.equal(users.find(u => u.username === 'viewer_test').role, 'user');
    assert.equal('password_hash' in users[0], false);
  });
  let viewer = await login(db, 'viewer_test', account.temporaryPassword);
  viewer = await changePassword(db, viewer.token, account.temporaryPassword, 'Private Viewer Password 2026');
  await t.test('usuario no puede listar ni crear cuentas', async () => {
    await assert.rejects(listUsers(db, viewer.token), e => e.status === 403);
    await assert.rejects(manageUser(db, viewer.token, { action: 'create', username: 'intruder' }), e => e.status === 403);
  });
  await t.test('desactivar revoca inmediatamente; habilitar no resucita sesiones', async () => {
    await manageUser(db, admin.token, { action: 'disable', username: 'viewer_test' });
    assert.equal(await readSession(db, viewer.token), null);
    await assert.rejects(login(db, 'viewer_test', 'Private Viewer Password 2026'), e => e.status === 401);
    await manageUser(db, admin.token, { action: 'enable', username: 'viewer_test' });
    assert.equal(await readSession(db, viewer.token), null);
    viewer = await login(db, 'viewer_test', 'Private Viewer Password 2026');
  });
  await t.test('restablecer revoca y obliga a cambiar contraseña', async () => {
    const reset = await manageUser(db, admin.token, { action: 'reset', username: 'viewer_test' });
    assert.equal(await readSession(db, viewer.token), null);
    await assert.rejects(login(db, 'viewer_test', 'Private Viewer Password 2026'), e => e.status === 401);
    viewer = await login(db, 'viewer_test', reset.temporaryPassword);
    assert.equal(viewer.user.mustChangePassword, true);
    viewer = await changePassword(db, viewer.token, reset.temporaryPassword, 'New Private Viewer Password 2026');
  });
  await t.test('sesiones expiradas y logout no autorizan; tokens no se guardan en claro', async () => {
    const rows = await db.$queryRaw`SELECT token_hash FROM app_private.sessions WHERE user_id = ${adminId}::uuid`;
    assert.equal(rows[0].token_hash, tokenDigest(admin.token));
    await db.$executeRaw`UPDATE app_private.sessions SET expires_at = now() - interval '1 second'
      WHERE token_hash = ${tokenDigest(viewer.token)}`;
    assert.equal(await readSession(db, viewer.token), null);
    const session = await login(db, 'viewer_test', 'New Private Viewer Password 2026');
    await logout(db, session.token);
    assert.equal(await readSession(db, session.token), null);
  });
  await t.test('máximo cinco sesiones activas por persona', async () => {
    for (let i = 0; i < 7; i++) await login(db, 'viewer_test', 'New Private Viewer Password 2026');
    const rows = await db.$queryRaw`SELECT count(*)::integer AS n FROM app_private.sessions
      WHERE user_id = (SELECT id FROM app_private.users WHERE username = 'viewer_test')`;
    assert.equal(rows[0].n, 5);
  });
  await t.test('cinco fallos bloquean cuenta; el límite global también persiste', async () => {
    for (let i = 0; i < 5; i++) await assert.rejects(login(db, 'viewer_test', 'bad'), e => e.status === 401);
    await assert.rejects(login(db, 'viewer_test', 'New Private Viewer Password 2026'), e => e.status === 401);
    await db.$executeRaw`UPDATE app_private.users SET attempt_window = now() - interval '16 minutes' WHERE username = 'viewer_test'`;
    await login(db, 'viewer_test', 'New Private Viewer Password 2026');
    await db.$executeRaw`UPDATE app_private.login_budget SET attempts = 60, window_start = now() WHERE id = 1`;
    await assert.rejects(login(db, 'owner_test', 'Permanent Admin Password 2026'), e => e.status === 429);
    await db.$executeRaw`UPDATE app_private.login_budget SET attempts = 0 WHERE id = 1`;
  });
  await t.test('roles públicos no tienen permisos sobre el esquema', async () => {
    const rows = await db.$queryRaw`SELECT has_schema_privilege('anon', 'app_private', 'USAGE') AS anon,
      has_schema_privilege('authenticated', 'app_private', 'USAGE') AS authenticated`;
    assert.equal(rows[0].anon, false);
    assert.equal(rows[0].authenticated, false);
  });
  await t.test('mínimo de seis caracteres se aplica también en el servidor', async () => {
    const current = await login(db, 'viewer_test', 'New Private Viewer Password 2026');
    await assert.rejects(changePassword(db, current.token, 'New Private Viewer Password 2026', 'cinco'), e => e.status === 400);
    viewer = await changePassword(db, current.token, 'New Private Viewer Password 2026', 'pibes6');
    assert.ok(await readSession(db, viewer.token));
    assert.ok((await login(db, 'viewer_test', 'pibes6')).token);
  });
  await t.test('eliminar exige administrador, identidad y confirmación; borra sesiones', async () => {
    const target = (await listUsers(db, admin.token)).find(u => u.username === 'viewer_test');
    const input = { action: 'delete', username: target.username, userId: target.id, confirmUsername: target.username };
    await assert.rejects(manageUser(db, viewer.token, input), e => e.status === 403);
    await assert.rejects(manageUser(db, admin.token, { ...input, confirmUsername: '' }), e => e.status === 400);
    await assert.rejects(manageUser(db, admin.token, { ...input, userId: randomUUID() }), e => e.status === 400);
    await assert.rejects(manageUser(db, admin.token, { action: 'delete', username: 'owner_test',
      userId: adminId, confirmUsername: 'owner_test' }), e => e.status === 403);
    assert.ok(await readSession(db, viewer.token));
    assert.equal((await manageUser(db, admin.token, input)).deleted, true);
    assert.equal(await readSession(db, viewer.token), null);
    const sessions = await db.$queryRaw`SELECT count(*)::integer AS n FROM app_private.sessions WHERE user_id = ${target.id}::uuid`;
    assert.equal(sessions[0].n, 0);
    assert.equal((await listUsers(db, admin.token)).some(u => u.id === target.id), false);
    await assert.rejects(login(db, 'viewer_test', 'pibes6'), e => e.status === 401);
    await manageUser(db, admin.token, { action: 'create', username: 'viewer_test' });
    await assert.rejects(manageUser(db, admin.token, input), e => e.status === 400);
  });
});
