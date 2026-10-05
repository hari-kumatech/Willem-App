import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/csv';
import { todayIso } from '@/lib/format';
import { compareProspects, ruleTier } from '@/modules/radar/prefilter';

export const dynamic = 'force-dynamic';

// GET /api/export/companies — CSV with the Prospect zoeker columns (A.2), formula-injection safe
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  const supabase = await createClient();
  let query = supabase.from('companies').select('name, address, segment, distance_km, reviews, phone, website, maps_url, kans, fit_score, rule_score, province');
  if (state) query = query.eq('state', state);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%_,()"\\]/g, ' ')}%,city.ilike.%${q.replace(/[%_,()"\\]/g, ' ')}%`);
  const { data } = await query.limit(20000);
  const rows = [...(data ?? [])].sort(compareProspects);
  const csv = toCsv(
    ['Score', 'Bedrijf', 'Adres', 'Segment', 'Afstand', 'Google-reviews', 'Telefoon', 'Website', 'Google Maps', 'Fit-score', 'Provincie'],
    rows.map((c) => [c.kans ?? ruleTier(c.rule_score), c.name, c.address, c.segment, c.distance_km ?? '', c.reviews, c.phone, c.website, c.maps_url, c.fit_score ?? '', c.province]),
  );
  return new NextResponse(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="MEK-prospects-${todayIso()}.csv"` },
  });
}
