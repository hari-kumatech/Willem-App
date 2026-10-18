// Minimal HS256 JSON Web Tokens with node:crypto. PostgREST verifies the same tokens with AUTH_JWT_SECRET.
// No server-only import: the seed script and the e2e test use it too.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtClaims {
  role: 'authenticated' | 'service_role';
  sub?: string;
  email?: string;
  iat?: number;
  exp?: number;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function signature(data: string, secret: string) {
  return createHmac('sha256', secret).update(data).digest();
}

export function signJwt(claims: JwtClaims, secret: string): string {
  const data = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  return `${data}.${b64url(signature(data, secret))}`;
}

// Claims of a valid, unexpired token, otherwise null
export function verifyJwt(token: string | undefined, secret: string): JwtClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = signature(`${header}.${payload}`, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256') return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JwtClaims;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
