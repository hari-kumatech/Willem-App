'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui';
import { isLang } from '@/i18n/core';
import { useLang, useMessages } from '@/i18n/client';
import { roi } from '@/i18n/messages/roi';
import { QUOTE_MODELS, roiInputsSchema, type QuoteModel } from '@/modules/roi/calc';
import { downloadQuotePdf } from './pdf';

export interface StoredQuote {
  number: string;
  createdAt: string;
  model: string;
  trucks: number;
  inputs: unknown;
  customer: Record<string, unknown>;
  vatPct: number;
  validDays: number;
}

// Re-creates the customer PDF from the stored inputs with the same calc module, number and date,
// in the language the quote was made in.
export function ReprintButton({ quote, contactEmail }: { quote: StoredQuote; contactEmail: string }) {
  const t = useMessages(roi);
  const uiLang = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reprint() {
    setError(null);
    const parsed = roiInputsSchema.safeParse(quote.inputs);
    const model = QUOTE_MODELS.find((m) => m === quote.model) as QuoteModel | undefined;
    if (!parsed.success || !model) {
      setError(t.reprintBadData);
      return;
    }
    const c = quote.customer;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    setBusy(true);
    try {
      await downloadQuotePdf({
        lang: isLang(c.lang) ? c.lang : uiLang,
        number: quote.number,
        date: new Date(quote.createdAt),
        validDays: quote.validDays,
        vatPct: quote.vatPct,
        model,
        trucks: quote.trucks,
        customer: { naam: str(c.naam), bedrijf: str(c.bedrijf), email: str(c.email), telefoon: str(c.telefoon) },
        inputs: parsed.data,
        contactEmail,
      });
    } catch (err) {
      console.error(err);
      setError(t.pdfFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={reprint} disabled={busy}>
        <FileDown className="h-3.5 w-3.5" aria-hidden /> {busy ? t.saving : t.reprint}
      </Button>
      {error && <span className="text-xs text-warning">{error}</span>}
    </div>
  );
}
