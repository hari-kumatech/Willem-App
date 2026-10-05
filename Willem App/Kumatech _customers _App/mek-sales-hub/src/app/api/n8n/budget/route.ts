import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedN8nRequest } from '@/lib/n8n';
import { createAdminClient } from '@/lib/supabase/admin';
import { budgetForRun } from '@/modules/radar/budget';
import { loadSettings } from '@/modules/settings/load';

export const dynamic = 'force-dynamic';

// GET /api/n8n/budget?runId=… — n8n asks this before every Apify call (B.7 "Budgets")
export async function GET(request: NextRequest) {
  if (!isAuthorizedN8nRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const runId = request.nextUrl.searchParams.get('runId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const admin = createAdminClient();
  const status = await budgetForRun(admin, runId, await loadSettings());
  if (!status) return NextResponse.json({ error: 'Unknown run' }, { status: 404 });
  // n8n asks before every Apify actor: that is a sign of life, so long runs are not closed as stale
  if (status.allowed) await admin.rpc('bump_run', { p_run: runId, p_deltas: { callback: true } });
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } });
}
