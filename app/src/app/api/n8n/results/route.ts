import { after, NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedN8nRequest } from '@/lib/n8n';
import { failRun, ingestBatch, markPending } from '@/modules/radar/ingest';
import { envelopeSchema } from '@/modules/radar/schema';

// Qualifying with Claude can take a while; processing continues after the reply to n8n
export const maxDuration = 800;

// POST /api/n8n/results: n8n delivers places, enrichment or errors for a run (spec B.10).
// Auth: "Authorization: Bearer <N8N_SECRET>". Replies 202 at once; work happens in the background.
export async function POST(request: NextRequest) {
  if (!isAuthorizedN8nRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: envelope.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    );
  }

  const data = envelope.data;
  // A places batch counts as pending work BEFORE we answer n8n. n8n sends "done" only after this reply,
  // so the run can never be closed while this batch is still being processed in the background.
  // The same holds for LinkedIn / news results: they start a Google Maps lookup that must finish first.
  const prePending = (data.kind === 'places' || data.kind === 'web') && data.items.length > 0;
  if (prePending) await markPending(data.runId);

  after(async () => {
    try {
      const result = await ingestBatch(data, { prePending });
      console.info(`[n8n] run ${data.runId} batch ${data.batchId} (${data.kind}): ${result.duplicate ? 'duplicate, ignored' : `${result.accepted} accepted, ${result.rejected} rejected`}`);
    } catch (error) {
      console.error(`[n8n] processing ${data.runId}/${data.batchId} failed`, error);
      if (data.kind === 'places') await failRun(data.runId, error instanceof Error ? error.message : 'Verwerking mislukt');
    }
  });

  return NextResponse.json({ ok: true, accepted: data.items.length }, { status: 202 });
}
