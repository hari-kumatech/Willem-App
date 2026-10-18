'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { requireAdmin, requireWriter, ForbiddenError } from '@/lib/auth';
import { createClient } from '@/lib/db/server';
import { geocodePostcode, provinceFromPostcode } from '@/lib/geo';
import { STATUS_CODES } from '@/lib/constants';
import { extractPostcode, nameKey, safeUrl } from '@/lib/text';
import { todayIso } from '@/lib/format';
import { getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';
import { leadsMsg } from '@/i18n/messages/leads';
import { legacyToRow, mapFamilie, mapStatus, type LeadRow } from './mapping';
import { upsertLeads } from './persist';
import { notifyLeadChanged, notifyLeadDeleted, notifyLeadsReload } from '../movers/sync';

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function guard<R>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (error) {
    const t = await getMessages(common);
    if (error instanceof ForbiddenError) return { ok: false, error: t.forbidden };
    console.error('[leads] action failed', error);
    return { ok: false, error: t.genericError };
  }
}

const urlField = z
  .string()
  .trim()
  .max(500)
  .transform((v, ctx) => {
    if (!v) return '';
    const safe = safeUrl(v);
    if (!safe) ctx.addIssue({ code: 'custom', message: 'url' });
    return safe;
  });

const leadFields = z.object({
  bedrijf: z.string().trim().min(1, 'bedrijf').max(200),
  kans: z.enum(['A', 'B', 'C', '']).transform((v) => (v ? v : null)),
  segment: z.string().trim().max(100),
  familie: z.enum(['', 'ja', 'groot', 'nee']),
  adres: z.string().trim().max(200),
  postcode: z.string().trim().max(10),
  plaats: z.string().trim().max(100),
  contact: z.string().trim().max(120),
  functie: z.string().trim().max(120),
  tel: z.string().trim().max(40),
  email: z.union([z.literal(''), z.string().trim().email('email').max(200)]),
  web: urlField,
  maps: urlField,
  status: z.enum(STATUS_CODES as [string, ...string[]]),
  datum: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) => v || null),
  volgende: z.string().trim().max(300),
  due_date: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) => v || null),
  aantal: z.coerce.number().int().min(0).max(500),
  waarde: z.coerce.number().min(0).max(100_000_000),
  reden: z.string().trim().max(300),
  waarom: z.string().trim().max(2000),
  aanpak: z.string().trim().max(2000),
  notitie: z.string().trim().max(5000),
});

export type LeadInput = z.input<typeof leadFields>;

async function provinceFor(postcode: string): Promise<string> {
  if (!postcode) return '';
  const geo = await geocodePostcode(postcode);
  return geo?.province || provinceFromPostcode(postcode);
}

function issueToMessage(issue: z.core.$ZodIssue, t: Awaited<ReturnType<typeof getMessages<typeof leadsMsg.nl>>>) {
  const key = issue.message as keyof typeof t.errors;
  return t.errors[key] ?? `${issue.path.join('.')}: ${issue.message}`;
}

// Create or update a lead. Updates send only the changed fields plus the version they were based on:
// if someone else saved first, the update is refused (optimistic locking, A.8 last-writer-wins fix).
export async function saveLead(input: {
  id?: string;
  version?: number;
  fields: Partial<LeadInput>;
}): Promise<ActionResult<{ id: string; version: number; provincie: string; previousProvincie?: string }>> {
  return guard(async () => {
    const user = await requireWriter();
    const t = await getMessages(leadsMsg);
    const tc = await getMessages(common);
    const db = await createClient();
    const schema = input.id ? leadFields.partial() : leadFields;
    const parsed = schema.safeParse(input.fields);
    if (!parsed.success) return { ok: false, error: issueToMessage(parsed.error.issues[0], t) };
    const fields = parsed.data as Partial<z.output<typeof leadFields>>;
    if (fields.status === 'verloren' && fields.reden !== undefined && !fields.reden) return { ok: false, error: t.errors.reden };

    const patch: Record<string, unknown> = { ...fields };
    if (fields.postcode !== undefined) {
      patch.postcode = extractPostcode(fields.postcode) || fields.postcode.toUpperCase();
      patch.provincie = await provinceFor(patch.postcode as string);
    }

    if (!input.id) {
      if (fields.status === 'verloren' && !fields.reden) return { ok: false, error: t.errors.reden };
      patch.name_key = nameKey(fields.bedrijf ?? '', (patch.postcode as string) ?? '');
      patch.owner = user.id;
      patch.datum ??= todayIso();
      const { data, error } = await db.from('leads').insert(patch).select('id, version, provincie').single();
      if (error) return { ok: false, error: error.code === '23505' ? t.errors.duplicate : tc.genericError };
      await db.from('activities').insert({ lead_id: data.id, type: 'created', text: fields.bedrijf ?? '', user_id: user.id });
      await notifyLeadChanged(data.id);
      revalidatePath('/leads');
      revalidatePath('/overzicht');
      return { ok: true, id: data.id, version: data.version, provincie: data.provincie };
    }

    const { data: current } = await db.from('leads').select('version, status, provincie, bedrijf, postcode').eq('id', input.id).maybeSingle();
    if (!current) return { ok: false, error: t.errors.notFound };
    if (fields.bedrijf !== undefined || fields.postcode !== undefined) {
      patch.name_key = nameKey(fields.bedrijf ?? current.bedrijf, (patch.postcode as string) ?? current.postcode);
    }
    const { data, error } = await db
      .from('leads')
      .update(patch)
      .eq('id', input.id)
      .eq('version', input.version ?? -1)
      .select('id, version, provincie')
      .maybeSingle();
    if (error) return { ok: false, error: error.code === '23505' ? t.errors.duplicate : tc.genericError };
    if (!data) return { ok: false, error: tc.conflict };

    const changes = Object.keys(fields).filter((k) => k !== 'status');
    if (fields.status && fields.status !== current.status) {
      await db.from('activities').insert({
        lead_id: input.id,
        type: 'status',
        // Stored as codes ("prospect>benaderd|reason") so the log is shown in the reader's language
        text: `${current.status}>${fields.status}${fields.reden ? `|${fields.reden}` : ''}`,
        user_id: user.id,
      });
    }
    if (changes.length) {
      await db.from('activities').insert({ lead_id: input.id, type: 'edit', text: changes.join(', '), user_id: user.id });
    }
    await notifyLeadChanged(input.id);
    revalidatePath('/leads');
    revalidatePath(`/leads/${input.id}`);
    revalidatePath('/overzicht');
    return {
      ok: true,
      id: data.id,
      version: data.version,
      provincie: data.provincie,
      ...(current.provincie && data.provincie !== current.provincie ? { previousProvincie: current.provincie } : {}),
    };
  });
}

// Inline status change from the table. Logs an activity; no longer overwrites "laatste contact" (A.8).
export async function changeStatus(id: string, version: number, status: string, reden?: string) {
  return saveLead({ id, version, fields: { status, ...(status === 'verloren' ? { reden: reden ?? '' } : {}) } });
}

export async function deleteLead(id: string): Promise<ActionResult> {
  return guard(async () => {
    await requireWriter();
    const db = await createClient();
    const { data: lead } = await db.from('leads').select('company_id, legacy_id').eq('id', id).maybeSingle();
    const { error } = await db.from('leads').delete().eq('id', id);
    if (error) return { ok: false, error: (await getMessages(common)).genericError };
    notifyLeadDeleted(lead?.legacy_id || id);
    if (lead?.company_id) await db.from('companies').update({ state: 'seen' }).eq('id', lead.company_id);
    revalidatePath('/leads');
    revalidatePath('/overzicht');
    return { ok: true };
  });
}

const activitySchema = z.object({
  leadId: z.string().uuid(),
  type: z.enum(['note', 'call', 'mail', 'meeting']),
  text: z.string().trim().min(1).max(2000),
});

export async function addActivity(input: z.input<typeof activitySchema>): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireWriter();
    const parsed = activitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: (await getMessages(common)).genericError };
    const db = await createClient();
    await db.from('activities').insert({ lead_id: parsed.data.leadId, type: parsed.data.type, text: parsed.data.text, user_id: user.id });
    // A call, mail or meeting counts as contact: update "datum laatste contact"
    if (parsed.data.type !== 'note') {
      const { data } = await db.from('leads').select('version').eq('id', parsed.data.leadId).single();
      if (data) await db.from('leads').update({ datum: todayIso() }).eq('id', parsed.data.leadId).eq('version', data.version);
      await notifyLeadChanged(parsed.data.leadId);
    }
    revalidatePath(`/leads/${parsed.data.leadId}`);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Excel import (server-side with exceljs, size limit) — replaces SheetJS 0.18.5 with known CVEs (A.8)
// ---------------------------------------------------------------------------
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { hyperlink?: string; text?: unknown; richText?: { text: string }[]; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    if (o.text !== undefined) return typeof o.text === 'object' && o.text && 'richText' in (o.text as object) ? ((o.text as { richText: { text: string }[] }).richText.map((r) => r.text).join('')) : String(o.text).trim();
    if (o.result !== undefined) return String(o.result).trim();
  }
  return String(v).trim();
}

// Hyperlink targets are preferred over cell text (A.1)
function cellLink(cell: ExcelJS.Cell): string {
  const v = cell.value as { hyperlink?: string } | null;
  return v && typeof v === 'object' && v.hyperlink ? v.hyperlink : cellText(cell);
}

export async function importLeadsFile(form: FormData): Promise<ActionResult<{ inserted: number; skipped: number; provinces: Record<string, number> }>> {
  return guard(async () => {
    const user = await requireWriter();
    const t = (await getMessages(leadsMsg)).import;
    const file = form.get('file');
    if (!(file instanceof File)) return { ok: false, error: t.failed('no file') };
    if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: t.tooBig };

    const rows: LeadRow[] = [];
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.json')) {
      const json = JSON.parse(await file.text());
      for (const item of Array.isArray(json) ? json : []) {
        const row = legacyToRow(item);
        if (row) rows.push(row);
      }
    } else {
      const workbook = new ExcelJS.Workbook();
      const buffer = Buffer.from(await file.arrayBuffer());
      if (lower.endsWith('.csv')) {
        const { Readable } = await import('node:stream');
        await workbook.csv.read(Readable.from(buffer.toString('utf8').replace(/^﻿/, '')), { parserOptions: { delimiter: buffer.toString('utf8').includes(';') ? ';' : ',' } });
      } else {
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      }
      const sheet = workbook.getWorksheet('Leads') ?? workbook.worksheets[0];
      if (!sheet) return { ok: false, error: t.noColumn };
      const head: Record<string, number> = {};
      sheet.getRow(1).eachCell((cell, col) => (head[cellText(cell).toLowerCase()] = col));
      if (!head['bedrijf']) return { ok: false, error: t.noColumn };
      const get = (row: ExcelJS.Row, name: string, link = false) => (head[name] ? (link ? cellLink(row.getCell(head[name])) : cellText(row.getCell(head[name]))) : '');
      sheet.eachRow((row, index) => {
        if (index === 1) return;
        const bedrijf = get(row, 'bedrijf');
        if (!bedrijf) return;
        const statusText = get(row, 'status');
        const mapped = mapStatus(statusText);
        const lead = legacyToRow({
          bedrijf,
          kans: get(row, 'kans'),
          status: mapped.status,
          segment: get(row, 'segment'),
          familie: mapFamilie(get(row, 'familiebedrijf')),
          adres: get(row, 'adres'),
          plaats: [get(row, 'postcode'), get(row, 'plaats')].filter(Boolean).join(' '),
          contact: get(row, 'contactpersoon'),
          functie: get(row, 'functie'),
          tel: get(row, 'telefoon'),
          email: get(row, 'e-mail'),
          web: get(row, 'website', true),
          maps: get(row, 'google maps', true),
          datum: get(row, 'laatste contact') || todayIso(),
          volgende: get(row, 'volgende actie'),
          reden: mapped.reden,
          waarom: get(row, 'waarom interessant'),
          aanpak: get(row, 'aanpak'),
          notitie: get(row, 'notities'),
        });
        if (lead) rows.push(lead);
      });
    }

    for (const row of rows) if (row.postcode) row.provincie = (await provinceFor(row.postcode)) || row.provincie;
    if (!rows.length) return { ok: false, error: t.none };
    const db = await createClient();
    const result = await upsertLeads(db, rows, { mode: 'skip-existing', userId: user.id, source: file.name });
    const provinces: Record<string, number> = {};
    for (const row of rows) provinces[row.provincie || '–'] = (provinces[row.provincie || '–'] ?? 0) + 1;
    notifyLeadsReload();
    revalidatePath('/leads');
    revalidatePath('/overzicht');
    if (result.inserted === 0 && result.errors.length === 0) return { ok: false, error: t.none };
    return { ok: true, inserted: result.inserted, skipped: result.skipped, provinces };
  });
}

// JSON restore (Instellingen, admin only): overwrites leads with the same id or name + postcode
export async function restoreLeadsJson(form: FormData): Promise<ActionResult<{ inserted: number; updated: number; errors: number }>> {
  return guard(async () => {
    const user = await requireAdmin();
    const t = (await getMessages(leadsMsg)).import;
    const file = form.get('file');
    if (!(file instanceof File)) return { ok: false, error: t.failed('no file') };
    if (file.size > MAX_IMPORT_BYTES * 4) return { ok: false, error: t.tooBig };
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return { ok: false, error: t.failed('JSON') };
    }
    const rows = (Array.isArray(json) ? json : []).map(legacyToRow).filter((r): r is LeadRow => Boolean(r));
    const db = await createClient();
    const result = await upsertLeads(db, rows, { mode: 'overwrite', userId: user.id, source: file.name });
    notifyLeadsReload();
    revalidatePath('/leads');
    return { ok: true, inserted: result.inserted, updated: result.updated, errors: result.errors.length };
  });
}
