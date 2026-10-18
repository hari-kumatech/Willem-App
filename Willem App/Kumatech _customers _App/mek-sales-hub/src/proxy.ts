import { NextResponse, type NextRequest } from 'next/server';
import { signJwt, verifyJwt } from '@/lib/jwt';
import { SESSION_COOKIE, SESSION_DAYS, SESSION_RENEW_AFTER_SECONDS } from '@/lib/session-cookie';

const PUBLIC_PATHS = ['/login', '/api/n8n', '/api/health', '/auth'];

// Checks the session cookie on every request, renews it for active users and redirects based on login state.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret) return response;

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = verifyJwt(cookie, secret);
  const loggedIn = claims?.role === 'authenticated' && Boolean(claims.sub);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (cookie && !loggedIn) response.cookies.delete(SESSION_COOKIE);
  if (loggedIn && claims) {
    const now = Math.floor(Date.now() / 1000);
    if (now - (claims.iat ?? 0) > SESSION_RENEW_AFTER_SECONDS) {
      const token = signJwt({ ...claims, iat: now, exp: now + SESSION_DAYS * 86400 }, secret);
      const secure = request.headers.get('x-forwarded-proto') === 'https';
      response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_DAYS * 86400 });
    }
  }

  if (!loggedIn && !isPublic) return redirectTo(request, response, '/login');
  if (loggedIn && pathname === '/login') return redirectTo(request, response, '/overzicht');
  return response;
}

function redirectTo(request: NextRequest, response: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|files/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)'],
};
