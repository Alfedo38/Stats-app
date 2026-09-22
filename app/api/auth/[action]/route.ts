import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { login, logout, changePassword, AuthError } from '@/lib/auth/service.mjs';
import { COOKIE_NAME, appOrigin, checkOrigin, readBody, privateJson, authFailure,
  setSessionCookie, clearSessionCookie } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    appOrigin();
    checkOrigin(request);
    const { action } = await context.params;
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (action === 'logout') {
      await logout(prisma, token);
      const response = privateJson({ ok: true });
      clearSessionCookie(response);
      return response;
    }
    if (action !== 'login' && action !== 'password') throw new AuthError('Operación no disponible.', 404);
    const body = await readBody(request);
    if (action === 'login') {
      const result = await login(prisma, body.username, body.password);
      const response = privateJson({ redirect: result.user.mustChangePassword ? '/cuenta' : '/' });
      setSessionCookie(response, result.token);
      return response;
    }
    const result = await changePassword(prisma, token, body.currentPassword, body.password);
    const response = privateJson({ ok: true, redirect: '/' });
    setSessionCookie(response, result.token);
    return response;
  } catch (error) { return authFailure(error); }
}
