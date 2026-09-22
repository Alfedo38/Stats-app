import { NextResponse, type NextRequest } from 'next/server';

// Fast first barrier. Real session/role checks also run in each page and API.
// No database query on every prefetch or static asset.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === '/login' || path === '/api/auth/login';
  const token = request.cookies.get('moskprops_session')?.value;
  if (!isPublic && !/^[A-Za-z0-9_-]{43}$/.test(token || '')) {
    if (path.startsWith('/api/') || path === '/injuries/sync') {
      return NextResponse.json({ error: 'Iniciá sesión para continuar.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'same-origin');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)'],
};
