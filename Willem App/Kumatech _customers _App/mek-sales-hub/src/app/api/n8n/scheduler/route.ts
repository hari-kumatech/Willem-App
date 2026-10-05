import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedN8nRequest } from '@/lib/n8n';
import { createAdminClient } from '@/lib/supabase/admin';
import { startRun } from '@/modules/radar/startRun';
import { nextRunAt, parseSchedule } from '@/modules/radar/filters';

export const maxDuration = 300;

// POST /api/n8n/scheduler — n8n calls this every 30 minutes (Schedule Trigger → HTTP Request).
// Closes stale runs, purges old data, and starts every active profile that is due.
export async function POST(request: NextRequest) {
  if (!isAuthorizedN8nRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const [{ data: expired }, { data: purged }] = await Promise.all([admin.rpc('expire_stale_runs'), admin.rpc('purge_old_data')]);

  const { data: profiles } = await admin
    .from('search_profiles')
    .select('id, name, schedule, next_run_at')
    .eq('active', true)
    .neq('schedule->>mode', 'off')
    .limit(50);

  const now = Date.now();
  const results: { profile: string; runId?: string; error?: string }[] = [];
  for (const profile of profiles ?? []) {
    const schedule = parseSchedule(profile.schedule);
    if (!profile.next_run_at) {
      // Newly scheduled profile: set its first start time, do not run immediately
      await admin.from('search_profiles').update({ next_run_at: nextRunAt(schedule)?.toISOString() ?? null }).eq('id', profile.id);
      continue;
    }
    if (new Date(profile.next_run_at).getTime() > now) continue;
    const result = await startRun({ profileId: profile.id, trigger: 'scheduled', userId: null, origin: request.nextUrl.origin });
    if (!result.ok) {
      // Not started (budget, already running): try again at the next slot
      await admin.from('search_profiles').update({ next_run_at: nextRunAt(schedule)?.toISOString() ?? null }).eq('id', profile.id);
    }
    results.push(result.ok ? { profile: profile.name, runId: result.runId } : { profile: profile.name, error: result.error });
  }

  return NextResponse.json({ ok: true, started: results.filter((r) => r.runId).length, expiredRuns: expired ?? 0, purged, results });
}
