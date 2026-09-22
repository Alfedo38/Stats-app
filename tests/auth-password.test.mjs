import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, validPassword, hashPassword, verifyPassword, newToken,
  validToken, tokenDigest, temporaryPassword } from '../lib/auth/password.mjs';

test('normaliza el usuario y rechaza nombres ambiguos o inyección', () => {
  assert.equal(normalizeUsername(' Maxi.Acosta '), 'maxi.acosta');
  for (const name of ['aa', '../admin', 'juan pérez', "admin' OR 1=1", '@mail', null, 'x'.repeat(33)]) assert.equal(normalizeUsername(name), null);
});
test('contraseñas largas; hash con sal aleatoria y verificación', async () => {
  const password = 'Mi frase privada para NBA 2026';
  assert.equal(validPassword('corta'), false);
  assert.equal(validPassword('pibes6'), true);
  const shortHash = await hashPassword('pibes6');
  assert.equal(await verifyPassword('pibes6', shortHash), true);
  await assert.rejects(hashPassword('cinco'));
  assert.equal(validPassword('x'.repeat(129)), false);
  const hash = await hashPassword(password);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('Otra frase distinta 2026', hash), false);
  assert.equal(await verifyPassword(password, 'formato-invalido'), false);
  assert.equal(await verifyPassword(undefined, hash), false);
  assert.equal(validPassword(temporaryPassword()), true);
});
test('sesiones opacas y almacenamiento solo del digest', () => {
  const token = newToken();
  assert.equal(validToken(token), true);
  assert.equal(validToken(token + '!'), false);
  assert.equal(validToken(undefined), false);
  assert.notEqual(token, newToken());
  assert.equal(tokenDigest(token).length, 64);
  assert.notEqual(tokenDigest(token), token);
});
