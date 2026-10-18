'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireWriter, ForbiddenError } from '@/lib/auth';
import { createClient } from '@/lib/db/server';
import { createAdminClient } from '@/lib/db/admin';
import { env, features } from '@/lib/env';
import { callN8nWebhook } from '@/lib/n8n';
import { hashInput } from '@/lib/ai/claude';
import { pct } from '@/lib/format';
import { getLang, getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';
import { outreachMsg } from '@/i18n/messages/outreach';
import { loadSettings } from '@/modules/settings/load';
import { routeEfficiency } from '@/modules/roi/efficiency';
import { PROMPT_VERSIONS, runOutreachWriter } from '@/modules/radar/agents';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function onDoNotContact(email: string): Promise<boolean> {
  if (!email) return false;
  const domain = email.split('@')[1] ?? '';
  const { data } = await createAdminClient().from('do_not_contact').select('value').in('value', [email.toLowerCase(), domain.toLowerCase()]);
  return (data?.length ?? 0) > 0;
}

// Draft a first e-mail for a lead (B.7 step 8). Uses the Outreach agent, or a template in rules mode.
export async function draftOutreach(leadId: string): Promise<Result<{ id: string; subject: string; body: string; to: string; mode: string }>> {
  try {
    const user = await requireWriter();
    const lang = await getLang();
    const t = await getMessages(outreachMsg);
    const db = await createClient();
    const { data: lead } = await db.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return { ok: false, error: (await getMessages(common)).genericError };
    const { data: company } = lead.company_id
      ? await db.from('companies').select('segment, score_reasons, waarom, aanpak').eq('id', lead.company_id).maybeSingle()
      : { data: null };
    const { data: contact } = lead.company_id
      ? await db.from('contacts').select('name, role, email').eq('company_id', lead.company_id).eq('is_primary', true).maybeSingle()
      : { data: null };

    const to = lead.email || contact?.email || '';
    if (to && (await onDoNotContact(to))) return { ok: false, error: t.doNotContact };

    const settings = await loadSettings();
    // ROI teaser with the default crossdock numbers (no customer data yet)
    const teaser = routeEfficiency({ lengthM: 40, widthM: 20, speedKmh: settings.product.speedEmptyKmh, diagonal: false, includeReturn: true, loadSecondsPerPallet: 30, palletsPerTrip: 2 });
    const name = lead.contact || contact?.name || '';
    const segment = company?.segment || lead.segment || 'logistiek bedrijf';

    let subject: string;
    let body: string;
    let mode = 'regels';
    const ai = features.ai
      ? await runOutreachWriter(
          settings.product,
          [
            `Taal van de e-mail: ${lang === 'en' ? 'Engels' : 'Nederlands'}.`,
            `Bedrijf: ${lead.bedrijf} (${lead.plaats}), segment: ${segment}.`,
            `Contactpersoon: ${name || 'onbekend'}${lead.functie || contact?.role ? `, ${lead.functie || contact?.role}` : ''}.`,
            `Waarom interessant: ${lead.waarom || company?.waarom || ''}`,
            `Aanpak: ${lead.aanpak || company?.aanpak || ''}`,
            `Redenen: ${JSON.stringify(company?.score_reasons ?? [])}`,
            `ROI-teaser: in een standaard crossdock (40 × 20 m, retour) is de Mek-Rider ${pct(teaser.efficiency * 100, 1, lang)} efficiënter per pallet dan een standaard EPT.`,
            `Bijlage: one-pager crossdocking (pdf).`,
          ].join('\n'),
        )
      : null;
    if (ai) {
      subject = ai.output.subject;
      body = ai.output.body;
      mode = 'agent';
      await createAdminClient().from('usage_log').insert({ provider: 'claude', agent: 'outreach', units: ai.inputTokens + ai.outputTokens, cost_usd: ai.costUsd, meta: { model: ai.model, leadId } });
      if (lead.company_id) {
        await createAdminClient().from('evaluations').insert({
          company_id: lead.company_id,
          agent: 'outreach',
          model: ai.model,
          prompt_version: PROMPT_VERSIONS.outreach,
          input_hash: hashInput(leadId),
          output: ai.output,
          input_tokens: ai.inputTokens,
          output_tokens: ai.outputTokens,
          cost_usd: ai.costUsd,
        });
      }
    } else {
      const tpl = t.template;
      subject = tpl.subject(lead.bedrijf);
      body = [tpl.greeting(name), '', tpl.intro(lead.bedrijf, segment), tpl.benefit(pct(teaser.efficiency * 100, 0, lang)), '', tpl.cta, '', tpl.sign, '', tpl.optout].join('\n');
    }

    const { data: draft, error } = await db
      .from('outreach_drafts')
      .insert({ lead_id: leadId, to_email: to, subject, body, mode, created_by: user.id })
      .select('id')
      .single();
    if (error) return { ok: false, error: (await getMessages(common)).genericError };
    revalidatePath(`/leads/${leadId}`);
    return { ok: true, id: draft.id, subject, body, to, mode };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: (await getMessages(common)).forbidden };
    console.error('[outreach] draft failed', error);
    return { ok: false, error: (await getMessages(common)).genericError };
  }
}

const sendSchema = z.object({
  id: z.string().uuid(),
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  send: z.boolean(),
});

// Save edits, and optionally approve + send through n8n (Gmail node). Nothing is sent without this click.
export async function saveOutreach(input: z.input<typeof sendSchema>): Promise<Result<{ status: string }>> {
  try {
    const user = await requireWriter();
    const t = await getMessages(outreachMsg);
    const parsed = sendSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: t.noEmail };
    const { id, to, subject, body, send } = parsed.data;
    if (await onDoNotContact(to)) return { ok: false, error: t.doNotContact };
    const db = await createClient();
    const { data: draft } = await db.from('outreach_drafts').select('lead_id, status').eq('id', id).maybeSingle();
    if (!draft) return { ok: false, error: (await getMessages(common)).genericError };
    await db.from('outreach_drafts').update({ to_email: to, subject, body }).eq('id', id);
    if (!send) return { ok: true, status: draft.status };
    if (!features.canSendEmail) return { ok: false, error: t.sendingOff };

    await db.from('outreach_drafts').update({ status: 'approved', approved_by: user.id }).eq('id', id);
    try {
      await callN8nWebhook(env.n8nSendEmailWebhookUrl!, { draftId: id, to, subject, body, replyTo: user.email, attachments: ['one-pager-crossdocking.pdf'] });
      await db.from('outreach_drafts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
      await db.from('activities').insert({ lead_id: draft.lead_id, type: 'mail', text: `${subject} → ${to}`, user_id: user.id });
      revalidatePath(`/leads/${draft.lead_id}`);
      return { ok: true, status: 'sent' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.from('outreach_drafts').update({ status: 'failed', error: message.slice(0, 300) }).eq('id', id);
      return { ok: false, error: t.failed(message.slice(0, 200)) };
    }
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: (await getMessages(common)).forbidden };
    return { ok: false, error: (await getMessages(common)).genericError };
  }
}
