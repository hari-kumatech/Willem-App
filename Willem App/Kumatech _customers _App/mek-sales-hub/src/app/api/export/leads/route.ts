import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { provinceBySlug, statusLabel } from '@/lib/constants';
import { toCsv } from '@/lib/csv';
import { todayIso } from '@/lib/format';
import { googleLinkedinUrl, linkedinSearchUrl } from '@/lib/text';
import { rowToLegacy } from '@/modules/leads/mapping';
import { LEAD_COLUMNS } from '@/modules/leads/types';

export const dynamic = 'force-dynamic';

const familieText = (f: string) => (f === 'groot' ? 'ja, groot' : f);

// GET /api/export/leads?format=json|csv|xlsx[&provincie=slug] — formats stay compatible (B.6)
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  const province = provinceBySlug(request.nextUrl.searchParams.get('provincie') ?? '')?.name;

  const supabase = await createClient();
  let query = supabase.from('leads').select(LEAD_COLUMNS).order('kans', { nullsFirst: false }).order('bedrijf');
  if (province) query = query.eq('provincie', province);
  const { data } = await query.limit(20000);
  const leads = (data ?? []) as unknown as Record<string, string | number | null>[];
  const stamp = todayIso();
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

  if (format === 'json') {
    return new NextResponse(JSON.stringify(leads.map(rowToLegacy), null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="mek-leads-${stamp}.json"` },
    });
  }

  if (format === 'csv') {
    const header = ['Kans', 'Bedrijf', 'Status', 'Segment', 'Adres', 'Postcode', 'Plaats', 'Provincie', 'Contactpersoon', 'Functie', 'Telefoon', 'E-mail', 'Website', 'Google Maps', 'Laatste contact', 'Volgende actie', 'Uiterlijk op', 'Aantal', 'Offertewaarde', 'Reden', 'Waarom interessant', 'Aanpak', 'Notities', 'Familiebedrijf'];
    const rows = leads.map((l) => [l.kans, l.bedrijf, statusLabel(s(l.status)), l.segment, l.adres, l.postcode, l.plaats, l.provincie, l.contact, l.functie, l.tel, l.email, l.web, l.maps, l.datum, l.volgende, l.due_date, l.aantal, l.waarde, l.reden, l.waarom, l.aanpak, l.notitie, familieText(s(l.familie))]);
    return new NextResponse(toCsv(header, rows), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="mek-leads-${stamp}.csv"` },
    });
  }

  // Excel in the MEK_Leads_crossdock.xlsx layout, so the existing import still works
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MEK Sales Hub';
  const sheet = workbook.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
  const header = ['Kans', 'Bedrijf', 'Segment', 'Adres', 'Postcode', 'Plaats', 'Telefoon', 'Website', 'Google Maps', 'Contactpersoon', 'Functie', 'E-mail', 'Waarom interessant', 'Aanpak', 'Status', 'Laatste contact', 'Volgende actie', 'Notities', 'LinkedIn: Warehouse manager', 'LinkedIn: Supply chain manager', 'LinkedIn: Crossdock manager', 'Google: alle 3 functies', 'Familiebedrijf'];
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2038' } };
  const link = (url: string, text: string) => (url ? { text, hyperlink: url } : '');
  for (const l of leads) {
    const name = s(l.bedrijf);
    sheet.addRow([
      s(l.kans),
      name,
      s(l.segment),
      s(l.adres),
      s(l.postcode),
      s(l.plaats),
      s(l.tel),
      link(s(l.web), s(l.web)),
      link(s(l.maps), 'Google Maps'),
      s(l.contact),
      s(l.functie),
      s(l.email),
      s(l.waarom),
      s(l.aanpak),
      statusLabel(s(l.status)),
      s(l.datum),
      s(l.volgende),
      s(l.notitie),
      link(linkedinSearchUrl(name, 'Warehouse manager'), 'Zoek'),
      link(linkedinSearchUrl(name, 'Supply chain manager'), 'Zoek'),
      link(linkedinSearchUrl(name, 'Crossdock manager'), 'Zoek'),
      link(googleLinkedinUrl(name), 'Zoek'),
      familieText(s(l.familie)),
    ]);
  }
  sheet.columns.forEach((col, i) => (col.width = [6, 34, 22, 26, 10, 16, 16, 30, 14, 20, 18, 26, 40, 34, 18, 14, 26, 30, 12, 12, 12, 12, 12][i] ?? 14));
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="MEK_Leads_${stamp}.xlsx"`,
    },
  });
}
