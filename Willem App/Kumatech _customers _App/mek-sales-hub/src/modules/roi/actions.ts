'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ForbiddenError, requireWriter } from '@/lib/auth';
import { euro } from '@/lib/format';
import { createClient } from '@/lib/db/server';
import { getLang, getMessages } from '@/i18n/server';
import { roi } from '@/i18n/messages/roi';
import { loadSettings } from '@/modules/settings/load';
import { computeRoi, customerSchema, quoteTotalExcl, roiInputsSchema, summarize } from './calc';
import { notifyLeadChanged } from '@/modules/movers/sync';

const saveQuoteSchema = z.object({
  leadId: z.uuid().nullish(),
  model: z.enum(['koop', 'lease', 'aas', 'alle']),
  trucks: z.number().int().min(1).max(20),
  inputs: roiInputsSchema,
  // Accepted for API compatibility but never trusted: the server recomputes the results from the inputs.
  results: z.unknown().optional(),
  customer: customerSchema,
});

export type SaveQuoteInput = z.input<typeof saveQuoteSchema>;
export type SaveQuoteResult = { ok: true; number: string; id: string; totalExcl: number } | { ok: false; error: string };

// Saves a quote and hands out its number from the database sequence (never generated client-side).
// The client then draws the PDF with that number.
export async function saveQuote(input: SaveQuoteInput): Promise<SaveQuoteResult> {
  const [t, lang] = await Promise.all([getMessages(roi), getLang()]);
  let user;
  try {
    user = await requireWriter();
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: t.errForbidden };
    throw error; // redirect to /login when the session expired
  }

  const parsed = saveQuoteSchema.safeParse(input);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some((issue) => issue.path.join('.') === 'customer.email');
    return { ok: false, error: emailIssue ? t.errEmail : t.errInvalid };
  }
  const { leadId, model, trucks, inputs, customer } = parsed.data;

  const settings = await loadSettings();
  const vatPct = settings.product.vat;
  const result = computeRoi(inputs);
  const totalExcl = quoteTotalExcl(result, model, trucks, vatPct);
  const results = { ...summarize(result), vatPct, validDays: settings.product.quoteValidDays, totalExcl };

  const db = await createClient();

  if (leadId) {
    const { data: lead, error } = await db.from('leads').select('id').eq('id', leadId).maybeSingle();
    if (error || !lead) return { ok: false, error: t.errLead };
  }

  const { data: number, error: numberError } = await db.rpc('next_quote_number');
  if (numberError || typeof number !== 'string') {
    console.error('[roi] next_quote_number failed', numberError?.message);
    return { ok: false, error: t.errNumber };
  }

  const { data: row, error: insertError } = await db
    .from('quotes')
    .insert({
      lead_id: leadId ?? null,
      number,
      model,
      trucks,
      inputs,
      results,
      customer,
      total_excl: totalExcl,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (insertError || !row) {
    console.error('[roi] quote insert failed', insertError?.message);
    return { ok: false, error: t.errInsert };
  }

  if (leadId) {
    const { error: activityError } = await db.from('activities').insert({
      lead_id: leadId,
      type: 'quote',
      text: t.activityText(number, t.models[model], euro(totalExcl, 0, lang)),
      user_id: user.id,
    });
    if (activityError) console.error('[roi] activity insert failed', activityError.message);

    // Only fill an empty deal value; the version trigger bumps leads.version itself.
    const { error: leadError } = await db.from('leads').update({ waarde: totalExcl }).eq('id', leadId).eq('waarde', 0);
    if (leadError) console.error('[roi] lead value update failed', leadError.message);
    await notifyLeadChanged(leadId);

    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
  }
  revalidatePath('/roi/offertes');

  return { ok: true, number, id: row.id as string, totalExcl };
}
