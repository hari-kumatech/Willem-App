import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

// Supabase client for server components, server actions and route handlers.
// It runs as the logged-in user, so Row Level Security decides what they may read and write.
// The browser never talks to Supabase directly: colleagues on the network only need the app's port.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl!, env.supabasePublishableKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components cannot set cookies; the proxy refreshes the session instead
        }
      },
    },
  });
}
