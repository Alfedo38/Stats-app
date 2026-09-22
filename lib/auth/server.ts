import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { AuthError, readSession } from './service.mjs';

export const COOKIE_NAME = 'moskprops_session';
export type SessionUser = { id: string; username: string; role: string; mustChangePassword: boolean };

export function appOrigin() {
  const configured = process.env.AUTH_ORIGIN || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '');
  if (!configured) throw new AuthError('Falta configurar AUTH_ORIGIN en el servidor.', 503);
  const url = new URL(configured);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new AuthError('AUTH_ORIGIN debe ser un origen HTTPS, o HTTP en localhost.', 503);
  }
  return url.origin;
}

export function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== appOrigin()) throw new AuthError('Origen de la solicitud no permitido.', 403);
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return readSession(prisma, token);
});

export async function requirePageUser(options: { admin?: boolean; allowPasswordChange?: boolean } = {}) {
  const user = await getSession();
  if (!user) redirect('/login');
  if (user.mustChangePassword && !options.allowPasswordChange) redirect('/cuenta');
  if (options.admin && user.role !== 'admin') redirect('/');
  return user;
}

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } });
}

export function authFailure(error: unknown) {
  if (error instanceof AuthError) return privateJson({ error: error.message }, error.status);
  // Never log request bodies, credentials, connection strings or database errors.
  console.error('AUTH_OPERATION_FAILED', error instanceof Error ? error.name : 'UnknownError',
    typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '');
  return privateJson({ error: 'No se pudo completar la operación. Revisá la conexión y la instalación del acceso privado.' }, 503);
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AuthError('Se requiere JSON.', 415);
  if (!request.body) throw new AuthError('Solicitud vacía.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new AuthError('Solicitud demasiado grande.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new AuthError('Solicitud inválida.'); }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, secure: appOrigin().startsWith('https:'), sameSite: 'strict',
    path: '/', maxAge: 12 * 60 * 60,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, secure: appOrigin().startsWith('https:'),
    sameSite: 'strict', path: '/', maxAge: 0 });
}

// Every existing data endpoint calls this guard, independently of Proxy.
export function withAuth(handler: (request: NextRequest) => Promise<Response>, admin = false) {
  return async (request: NextRequest) => {
    try {
      const user = await readSession(prisma, request.cookies.get(COOKIE_NAME)?.value);
      if (!user) return privateJson({ error: 'Iniciá sesión para continuar.' }, 401);
      if (user.mustChangePassword) return privateJson({ error: 'Primero cambiá tu contraseña.', redirect: '/cuenta' }, 403);
      if (admin && user.role !== 'admin') return privateJson({ error: 'Acceso reservado al administrador.' }, 403);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) checkOrigin(request);
      const response = await handler(request);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('Vary', [response.headers.get('Vary'), 'Cookie'].filter(Boolean).join(', '));
      return response;
    } catch (error) { return authFailure(error); }
  };
}
