import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let admin: SupabaseClient | null = null;

// Service-role client: bypasses Row Level Security.
// Only for system work (n8n callbacks, agents, scheduler, seeding), never with unchecked user input.
export function createAdminClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not configured. Add it to .env.local (server-only).');
  }
  admin ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
