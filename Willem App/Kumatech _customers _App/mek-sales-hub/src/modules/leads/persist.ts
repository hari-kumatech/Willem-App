// Writes leads together with their company row. Used by the seed script, Excel import and JSON restore.
// Takes a database client as argument (no server-only import) so the seed script can use it.
import type { DbClient } from '@/lib/db';
import { classifySegment } from '../radar/prefilter';
import { companyFromLead, type LeadRow } from './mapping';

export type UpsertMode = 'skip-existing' | 'overwrite';

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

async function findCompany(db: DbClient, row: LeadRow): Promise<string | null> {
  const company = companyFromLead(row);
  if (company.name_key) {
    const { data } = await db.from('companies').select('id').eq('name_key', company.name_key).maybeSingle();
    if (data) return data.id;
  }
  if (company.domain) {
    const { data } = await db.from('companies').select('id').eq('domain', company.domain).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

async function ensureCompany(db: DbClient, row: LeadRow): Promise<string | null> {
  const existing = await findCompany(db, row);
  if (existing) {
    await db.from('companies').update({ state: 'lead' }).eq('id', existing);
    return existing;
  }
  const company = companyFromLead(row);
  const segment = classifySegment(`${row.segment} ${row.bedrijf}`).segment;
  const { data, error } = await db.from('companies').insert({ ...company, segment }).select('id').single();
  if (error?.code === '23505') {
    // Domain already used by another company: insert without it
    const retry = await db.from('companies').insert({ ...company, segment, domain: null }).select('id').single();
    return retry.data?.id ?? null;
  }
  return data?.id ?? null;
}

// Dedup on legacy id, then normalised name + PC4 (fixes the plaats.slice(0,7) import bug from A.8)
async function findLead(db: DbClient, row: LeadRow): Promise<{ id: string; version: number } | null> {
  if (row.legacy_id) {
    const { data } = await db.from('leads').select('id, version').eq('legacy_id', row.legacy_id).maybeSingle();
    if (data) return data;
  }
  if (row.name_key) {
    const { data } = await db.from('leads').select('id, version').eq('name_key', row.name_key).maybeSingle();
    if (data) return data;
  }
  return null;
}

export async function upsertLeads(
  db: DbClient,
  rows: LeadRow[],
  options: { mode: UpsertMode; userId: string | null; source: string; onProgress?: (done: number) => void },
): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  let done = 0;
  for (const row of rows) {
    try {
      const existing = await findLead(db, row);
      if (existing && options.mode === 'skip-existing') {
        result.skipped++;
      } else if (existing) {
        const { legacy_id, name_key, created_at, updated_at, ...fields } = row;
        void created_at;
        void updated_at;
        const { error } = await db.from('leads').update({ ...fields, ...(legacy_id ? { legacy_id } : {}), ...(name_key ? { name_key } : {}) }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        await db.from('activities').insert({ lead_id: existing.id, type: 'import', text: `Hersteld uit ${options.source}`, user_id: options.userId });
        result.updated++;
      } else {
        const companyId = await ensureCompany(db, row);
        const { data: taken } = companyId ? await db.from('leads').select('id').eq('company_id', companyId).maybeSingle() : { data: null };
        const { data, error } = await db
          .from('leads')
          .insert({ ...row, company_id: taken ? null : companyId, owner: options.userId })
          .select('id')
          .single();
        if (error) {
          if (error.code === '23505') {
            result.skipped++;
            continue;
          }
          throw new Error(error.message);
        }
        await db.from('activities').insert({ lead_id: data.id, type: 'import', text: `Geïmporteerd uit ${options.source}`, user_id: options.userId });
        result.inserted++;
      }
    } catch (error) {
      result.errors.push(`${row.bedrijf}: ${error instanceof Error ? error.message : String(error)}`);
    }
    options.onProgress?.(++done);
  }
  return result;
}
