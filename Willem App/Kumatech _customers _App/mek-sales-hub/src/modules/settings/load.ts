import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/db/admin';
import { mergeSettings, type AppSettings } from './types';

// Settings are not secret (prices, thresholds, weights), so the system client reads them.
// Cached per request; every module uses this one source of truth.
export const loadSettings = cache(async (): Promise<AppSettings> => {
  const { data, error } = await createAdminClient().from('settings').select('key, value');
  if (error) console.error('[settings] load failed, using defaults', error.message);
  return mergeSettings(data ?? []);
});
