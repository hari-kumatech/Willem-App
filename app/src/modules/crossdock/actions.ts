'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ForbiddenError, requireWriter } from '@/lib/auth';
import { num } from '@/lib/format';
import { createClient } from '@/lib/db/server';
import { getLang, getMessages } from '@/i18n/server';
import { demo } from '@/i18n/messages/demo';
import { HALL_FIELD, hallSchema, type Hall, type HallKey } from './hall';

export interface SaveHallResult {
  ok: boolean;
  error?: string;
}

const leadIdSchema = z.uuid();

// Saves the crossdock calculator inputs on leads.hall and logs a note activity.
// The version column is bumped by the database trigger, so it is not touched here.
export async function saveHall(leadId: string, hall: Hall): Promise<SaveHallResult> {
  const [t, lang] = await Promise.all([getMessages(demo), getLang()]);
  let user;
  try {
    user = await requireWriter();
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: t.errForbidden };
    throw e; // redirect() to /login
  }

  const id = leadIdSchema.safeParse(leadId);
  if (!id.success) return { ok: false, error: t.errInvalidLead };
  const parsed = hallSchema.safeParse(hall);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.path[0] as HallKey | undefined;
    const f = key ? HALL_FIELD[key] : undefined;
    return { ok: false, error: f ? t.errRange(t.fields[f.key], num(f.min, 1, lang), num(f.max, 1, lang)) : t.errInvalidHall };
  }
  const h = parsed.data;

  const db = await createClient();
  const { data, error } = await db.from('leads').update({ hall: h }).eq('id', id.data).select('id').maybeSingle();
  if (error) return { ok: false, error: t.errSave(error.message) };
  if (!data) return { ok: false, error: t.errNotFound };

  const summary = t.activitySummary(
    num(h.inboundToOutboundM, 0, lang),
    num(h.sidewaysM, 0, lang),
    num(h.gapM, 0, lang),
    num(h.speedKmh, 1, lang),
    num(h.loadSecondsPerPallet, 0, lang),
    num(h.palletsPerDay, 0, lang),
  );
  const { error: actError } = await db.from('activities').insert({
    lead_id: id.data,
    type: 'note',
    text: t.activityText(summary),
    user_id: user.id,
  });
  if (actError) console.error('[crossdock] activity insert failed', actError.message);

  revalidatePath('/demo');
  revalidatePath(`/leads/${id.data}`);
  revalidatePath('/roi');
  return { ok: true };
}
