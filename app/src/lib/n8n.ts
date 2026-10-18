import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

// Header the app sends to n8n (n8n: Webhook → Authentication → Header Auth)
export const N8N_SECRET_HEADER = 'x-mek-secret';

export class N8nError extends Error {}

// POST to an n8n webhook. Returns the JSON response, or null when it is empty.
export async function callN8nWebhook(url: string, body: unknown, timeoutMs = 20_000): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.n8nSecret ? { [N8N_SECRET_HEADER]: env.n8nSecret } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new N8nError(`n8n antwoordde met ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Checks "Authorization: Bearer <N8N_SECRET>" on requests from n8n to the app
export function isAuthorizedN8nRequest(request: Request): boolean {
  if (!env.n8nSecret) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const expected = Buffer.from(env.n8nSecret);
  const received = Buffer.from(token);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Callback base URL for n8n: APP_URL, else the request origin
export function callbackBase(origin?: string): string {
  return env.appUrl ?? origin ?? 'http://localhost:3000';
}
