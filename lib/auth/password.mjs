import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

const COST = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = (password, salt) => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, COST, (error, key) => error ? reject(error) : resolve(key));
});

export function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ? username : null;
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 6 && value.length <= 128
    && Buffer.byteLength(value, 'utf8') <= 512;
}

export async function hashPassword(password) {
  if (!validPassword(password)) throw new Error('La contraseña debe tener entre 6 y 128 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt-v1$${salt}$${key.toString('hex')}`;
}

// Unknown usernames perform the same expensive derivation as existing ones.
export const DUMMY_HASH = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export async function verifyPassword(password, encoded = DUMMY_HASH) {
  if (typeof password !== 'string' || password.length > 128 || Buffer.byteLength(password) > 512) return false;
  const match = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  const actual = await derive(password, match[1]);
  return timingSafeEqual(actual, Buffer.from(match[2], 'hex'));
}

export const newToken = () => randomBytes(32).toString('base64url');
export const temporaryPassword = () => randomBytes(18).toString('base64url');
export const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');
export const validToken = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
