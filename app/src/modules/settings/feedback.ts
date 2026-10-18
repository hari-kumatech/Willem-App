import 'server-only';
import { createAdminClient } from '@/lib/db/admin';
import type { WeightSettings } from './types';

const KEYS: (keyof WeightSettings)[] = ['palletFlows', 'volume', 'multiDrop', 'growth', 'family', 'dataQuality'];

// Weight suggestion from the review queue (B.8: weights are tuned from approve/reject feedback).
// A criterion that separates approved from rejected companies gets more weight, one that does not gets less.
export async function suggestWeights(current: WeightSettings): Promise<{ approved: number; rejected: number; suggestion: WeightSettings | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('review_queue')
    .select('state, companies!inner(criteria)')
    .in('state', ['approved', 'rejected'])
    .limit(2000);
  const rows = (data ?? []).map((r) => ({ state: r.state, criteria: (r.companies as unknown as { criteria: Record<string, { score: number }> }).criteria ?? {} }));
  const approved = rows.filter((r) => r.state === 'approved');
  const rejected = rows.filter((r) => r.state === 'rejected');
  if (approved.length + rejected.length < 10 || !approved.length || !rejected.length) {
    return { approved: approved.length, rejected: rejected.length, suggestion: null };
  }
  const mean = (list: typeof rows, key: string) => list.reduce((s, r) => s + (Number(r.criteria[key]?.score) || 0), 0) / list.length;

  const raw: Record<string, number> = {};
  for (const key of KEYS) {
    const separation = mean(approved, key) - mean(rejected, key); // -1 … 1
    // Move at most 50% away from the current weight, never below 1
    raw[key] = Math.max(1, current[key] * (1 + Math.max(-0.5, Math.min(0.5, separation))));
  }
  raw.distance = current.distance; // computed by the app, not learned
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  const suggestion = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((v / total) * 100)])) as unknown as WeightSettings;
  return { approved: approved.length, rejected: rejected.length, suggestion };
}
