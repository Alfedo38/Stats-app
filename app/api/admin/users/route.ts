import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { listUsers, manageUser } from '@/lib/auth/service.mjs';
import { COOKIE_NAME, withAuth, readBody, privateJson } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = withAuth(async (request: NextRequest) => {
  return privateJson({ users: await listUsers(prisma, request.cookies.get(COOKIE_NAME)?.value) });
}, true);
export const POST = withAuth(async (request: NextRequest) => {
  const body = await readBody(request);
  return privateJson(await manageUser(prisma, request.cookies.get(COOKIE_NAME)?.value, body));
}, true);
