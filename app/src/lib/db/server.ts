import 'server-only';
import { createDbClient, type DbClient } from '@/lib/db';
import { env } from '@/lib/env';
import { getSessionToken } from '@/lib/session';

// Database client for server components, server actions and route handlers.
// It runs as the logged-in user, so Row Level Security decides what they may read and write.
// The browser never talks to the database directly: colleagues on the network only need the app's port.
export async function createClient(): Promise<DbClient> {
  return createDbClient(env.postgrestUrl, await getSessionToken());
}
