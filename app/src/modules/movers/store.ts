// Storage for the MEK Movers apps (public/mek-movers/*.html): collections of JSON documents in mm_documents.
// Same shape as the stand-alone server's db.json: { collection: { id: document } }.
// Exception: the 'leads' collection is the Sales Hub leads table (one leads list, see ./leads.ts).
// No server-only import: the seed script uses loadAll / replaceAll too.
import type { DbClient } from '@/lib/db';
import { deleteLeadDoc, LEADS_COLLECTION, loadLeadDocs, patchLeadDoc, setLeadDoc, upsertLeadDocs } from './leads';

export type MoversDb = Record<string, Record<string, Record<string, unknown>>>;

// Same rule as the stand-alone server (server.js NAME_RE) and the check constraint in the migration
export const NAME_RE = /^[A-Za-z0-9_.\-:@+~]{1,200}$/;
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export const isPlainObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Whole database. PostgREST returns at most 1000 rows per request, so read in pages.
export async function loadAll(db: DbClient): Promise<MoversDb> {
  const out: MoversDb = {};
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from('mm_documents')
      .select('collection, id, data')
      .neq('collection', LEADS_COLLECTION)
      .order('collection')
      .order('id')
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const row of data as { collection: string; id: string; data: Record<string, unknown> }[]) {
      (out[row.collection] ??= {})[row.id] = row.data;
    }
    if (data.length < page) break;
  }
  out[LEADS_COLLECTION] = await loadLeadDocs(db);
  return out;
}

export async function setDoc(db: DbClient, collection: string, id: string, data: Record<string, unknown>, userId: string | null) {
  if (collection === LEADS_COLLECTION) return setLeadDoc(db, id, data, userId);
  const { error } = await db
    .from('mm_documents')
    .upsert({ collection, id, data, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: 'collection,id' });
  if (error) throw new Error(error.message);
}

// false when the document does not exist (the apps expect a 404 then)
export async function patchDoc(db: DbClient, collection: string, id: string, data: Record<string, unknown>, userId: string | null): Promise<boolean> {
  if (collection === LEADS_COLLECTION) return patchLeadDoc(db, id, data, userId);
  const { data: ok, error } = await db.rpc('mm_patch', { p_collection: collection, p_id: id, p_data: data });
  if (error) throw new Error(error.message);
  return ok === true;
}

export async function deleteDoc(db: DbClient, collection: string, id: string) {
  if (collection === LEADS_COLLECTION) return deleteLeadDoc(db, id);
  const { error } = await db.from('mm_documents').delete().eq('collection', collection).eq('id', id);
  if (error) throw new Error(error.message);
}

// Restore a backup. Other collections are replaced; leads are merged into the Sales Hub leads (added or updated,
// never deleted, because Sales Hub leads carry activities, quotes and Prospect Radar links).
export async function replaceAll(
  db: DbClient,
  all: MoversDb,
  options: { userId: string | null; onProgress?: (done: number, total: number) => void } = { userId: null },
): Promise<number> {
  const { [LEADS_COLLECTION]: leads, ...rest } = all;
  const { data, error } = await db.rpc('mm_replace_all', { p_db: rest });
  if (error) throw new Error(error.message);
  let count = Number(data ?? 0);
  if (leads) {
    const r = await upsertLeadDocs(db, leads, { userId: options.userId, overwrite: true, onProgress: options.onProgress });
    if (r.errors.length) console.warn(`[mek-movers] ${r.errors.length} lead(s) not restored:`, r.errors.slice(0, 5));
    count += r.inserted + r.updated + r.unchanged;
  }
  return count;
}

export function isValidBackup(v: unknown): v is MoversDb {
  return isPlainObject(v) && Object.entries(v).every(([col, docs]) => NAME_RE.test(col) && isPlainObject(docs) && Object.keys(docs).every((id) => NAME_RE.test(id)));
}
