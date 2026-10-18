// Database client: PostgREST in front of PostgreSQL (docker-compose.yml).
// The query builder is the same one db-js used (.from().select().eq() …, .rpc()), so module code
// did not change. No server-only import: the seed script and the e2e test use it too.
import { PostgrestClient } from '@supabase/postgrest-js';
import { signJwt } from '@/lib/jwt';

export type DbClient = PostgrestClient;

export function createDbClient(url: string, token?: string): DbClient {
  return new PostgrestClient(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

// Token for system work (n8n callbacks, agents, scheduler, seeding): role service_role bypasses RLS.
export function serviceToken(secret: string): string {
  return signJwt({ role: 'service_role' }, secret);
}
