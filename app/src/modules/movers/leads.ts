// The MEK Movers apps see the Sales Hub leads table as their 'leads' collection (one leads list, INC-008).
// Document id = legacy_id (the slug the MEK Movers apps and the original leads app use), or the lead's uuid for
// leads created in the Sales Hub. Document fields = the legacy lead format (same as the mek-leads JSON export),
// plus anything else the apps store, kept in leads.extra.
// No server-only import: the seed and merge scripts use this file too.
import type { DbClient } from '@/lib/db';
import { legacyToRow, rowToLegacy, type LeadRow, type LegacyLead } from '@/modules/leads/mapping';
import { upsertLeads } from '@/modules/leads/persist';

export const LEADS_COLLECTION = 'leads';

// Keys of the legacy format that map to columns (everything else goes to extra)
const KNOWN_KEYS = new Set([
  'id', 'bedrijf', 'kans', 'status', 'segment', 'familie', 'adres', 'plaats', 'provincie', 'contact', 'functie', 'tel',
  'email', 'web', 'maps', 'datum', 'volgende', 'due_date', 'aantal', 'waarde', 'reden', 'waarom', 'aanpak', 'notitie',
  'createdAt', 'updatedAt',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbLead = Record<string, unknown> & { id: string; legacy_id: string | null; status: string; updated_at: string; extra?: Record<string, unknown> };

export const leadDocId = (row: { id: string; legacy_id: string | null }) => row.legacy_id || row.id;

export function leadToDoc(row: DbLead): Record<string, unknown> {
  const { id, ...doc } = rowToLegacy(row);
  void id;
  return { ...(row.extra ?? {}), ...doc };
}

function docToRow(docId: string, doc: Record<string, unknown>): { row: LeadRow; extra: Record<string, unknown> } {
  const row = legacyToRow({ ...(doc as LegacyLead), id: docId });
  if (!row) throw new Error('Een lead moet een bedrijfsnaam hebben');
  const extra = Object.fromEntries(Object.entries(doc).filter(([k]) => !KNOWN_KEYS.has(k)));
  return { row, extra };
}

async function findLead(db: DbClient, docId: string): Promise<DbLead | null> {
  const q = db.from('leads').select('*');
  const { data, error } = await (UUID.test(docId) ? q.or(`legacy_id.eq.${docId},id.eq.${docId}`) : q.eq('legacy_id', docId)).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as DbLead | null;
}

export async function loadLeadDocs(db: DbClient): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from('leads').select('*').order('created_at').order('id').range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const row of data as DbLead[]) out[leadDocId(row)] = leadToDoc(row);
    if (data.length < page) return out;
  }
}

export async function loadLeadDoc(db: DbClient, leadId: string): Promise<{ docId: string; doc: Record<string, unknown> } | null> {
  const { data } = await db.from('leads').select('*').eq('id', leadId).maybeSingle();
  return data ? { docId: leadDocId(data as DbLead), doc: leadToDoc(data as DbLead) } : null;
}

// Update an existing lead from a (merged) document; logs a status change like the Sales Hub does
async function updateLead(db: DbClient, existing: DbLead, doc: Record<string, unknown>, userId: string | null) {
  const { row, extra } = docToRow(leadDocId(existing), doc);
  const { legacy_id, created_at, updated_at, name_key, ...fields } = row;
  void legacy_id;
  void created_at;
  void updated_at;
  const update = { ...fields, extra };
  let { error } = await db.from('leads').update({ ...update, name_key }).eq('id', existing.id);
  // Same name + postcode as another lead: keep this one without a dedup key
  if (error?.code === '23505') ({ error } = await db.from('leads').update({ ...update, name_key: null }).eq('id', existing.id));
  if (error) throw new Error(error.message);
  if (fields.status !== existing.status) {
    await db.from('activities').insert({ lead_id: existing.id, type: 'status', text: `${existing.status}>${fields.status}${fields.reden ? `|${fields.reden}` : ''}`, user_id: userId });
  }
}

async function insertLead(db: DbClient, docId: string, doc: Record<string, unknown>, userId: string | null) {
  const { row, extra } = docToRow(docId, doc);
  // Same path as the Excel import: company row (so the Prospect Radar knows it) + lead + activity
  const result = await upsertLeads(db, [row], { mode: 'skip-existing', userId, source: 'MEK Movers' });
  if (result.errors.length) throw new Error(result.errors[0]);
  const lead = await findLead(db, docId);
  if (!lead && result.skipped) {
    // An existing lead with the same name + postcode: link this document id to it and apply the document
    const { data } = await db.from('leads').select('*').eq('name_key', row.name_key ?? '').maybeSingle();
    if (data && !(data as DbLead).legacy_id) {
      await db.from('leads').update({ legacy_id: docId }).eq('id', (data as DbLead).id);
      return updateLead(db, { ...(data as DbLead), legacy_id: docId }, doc, userId);
    }
    // Otherwise insert it as a separate lead without dedup key
    const { error } = await db.from('leads').insert({ ...row, name_key: null, extra, owner: userId });
    if (error) throw new Error(error.message);
    return;
  }
  if (lead && Object.keys(extra).length) await db.from('leads').update({ extra }).eq('id', lead.id);
}

// doc().set(): create or replace
export async function setLeadDoc(db: DbClient, docId: string, doc: Record<string, unknown>, userId: string | null) {
  const existing = await findLead(db, docId);
  if (existing) await updateLead(db, existing, doc, userId);
  else await insertLead(db, docId, doc, userId);
}

// doc().update(): merge fields; false when the lead does not exist
export async function patchLeadDoc(db: DbClient, docId: string, patch: Record<string, unknown>, userId: string | null): Promise<boolean> {
  const existing = await findLead(db, docId);
  if (!existing) return false;
  await updateLead(db, existing, { ...leadToDoc(existing), ...patch }, userId);
  return true;
}

export async function deleteLeadDoc(db: DbClient, docId: string) {
  const existing = await findLead(db, docId);
  if (!existing) return;
  const { error } = await db.from('leads').delete().eq('id', existing.id);
  if (error) throw new Error(error.message);
  if (existing.company_id) await db.from('companies').update({ state: 'seen' }).eq('id', existing.company_id as string);
}

// Many documents at once (seed, backup restore, merge). Existing leads are only overwritten when the document
// is newer (updatedAt) unless overwrite is set. Leads that are not in the documents are never deleted.
export async function upsertLeadDocs(
  db: DbClient,
  docs: Record<string, Record<string, unknown>>,
  options: { userId: string | null; overwrite: boolean; onProgress?: (done: number, total: number) => void },
): Promise<{ inserted: number; updated: number; unchanged: number; errors: string[] }> {
  const result = { inserted: 0, updated: 0, unchanged: 0, errors: [] as string[] };
  const entries = Object.entries(docs);
  let done = 0;
  for (const [docId, doc] of entries) {
    try {
      const existing = await findLead(db, docId);
      if (!existing) {
        await insertLead(db, docId, doc, options.userId);
        result.inserted++;
      } else {
        const docTime = Date.parse(String(doc.updatedAt ?? ''));
        const newer = Number.isFinite(docTime) && docTime > Date.parse(existing.updated_at);
        if (options.overwrite || newer) {
          await updateLead(db, existing, { ...leadToDoc(existing), ...doc }, options.userId);
          result.updated++;
        } else result.unchanged++;
      }
    } catch (error) {
      result.errors.push(`${docId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    options.onProgress?.(++done, entries.length);
  }
  return result;
}
