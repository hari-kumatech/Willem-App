import 'server-only';
import { env } from '@/lib/env';
import { createDbClient, serviceToken, type DbClient } from '@/lib/db';

let admin: DbClient | null = null;

// Service-role client: bypasses Row Level Security.
// Only for system work (n8n callbacks, agents, scheduler, seeding), never with unchecked user input.
export function createAdminClient(): DbClient {
  if (!env.authJwtSecret) {
    throw new Error('AUTH_JWT_SECRET is not configured. Run npm run db:start once to generate it in .env.local.');
  }
  admin ??= createDbClient(env.postgrestUrl, serviceToken(env.authJwtSecret));
  return admin;
}
