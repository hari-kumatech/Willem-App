// Smoke test: both PDFs build in both languages (logo falls back to text without a browser),
// and the customer quote never contains internal margin wording.
import { describe, it, expect, vi } from 'vitest';
const saved: { name: string; pages: number; text: string }[] = [];
vi.mock('jspdf', async (orig) => {
  const m = (await orig()) as typeof import('jspdf');
  class P extends m.jsPDF {
    constructor(...args: ConstructorParameters<typeof m.jsPDF>) {
      super(...args);
      (this as unknown as { save: (n: string) => void }).save = (name: string) => {
        saved.push({ name, pages: this.getNumberOfPages(), text: this.output() });
      };
    }
  }
  return { ...m, jsPDF: P };
});
describe('pdf smoke', () => {
  it('generates both PDFs in both languages', async () => {
    globalThis.fetch = (async () => { throw new Error('no'); }) as never;
    const { downloadQuotePdf, downloadComparisonPdf } = await import('./pdf');
    const { defaultInputs } = await import('@/modules/roi/calc');
    const inputs = defaultInputs({ productName: 'Mek-Rider', price: 22500, competitorPrice: 14000, vat: 21, shiftHours: 8, workDaysPerYear: 230, quoteValidDays: 30, contactEmail: 'info@mek-mover.nl', palletsPerTrip: 2, speedKmh: 12 });
    const customer = { naam: 'Jan Jansen', bedrijf: 'Test BV', email: 'jan@test.nl', telefoon: '0612345678' };
    for (const lang of ['nl', 'en'] as const) {
      for (const model of ['alle', 'koop', 'lease', 'aas'] as const) {
        await downloadQuotePdf({ lang, number: 'MEK-2026-0001', date: new Date('2026-10-02T10:00:00Z'), validDays: 30, vatPct: 21, model, trucks: 3, customer, inputs, contactEmail: 'info@mek-mover.nl' });
      }
      await downloadComparisonPdf({ lang, customer, inputs, contactEmail: 'info@mek-mover.nl' });
    }
    console.log(saved.map((s) => `${s.name} pages=${s.pages}`).join('\n'));
    expect(saved).toHaveLength(10);
    expect(saved.map((s) => s.name)).toContain('offerte-MEK-2026-0001.pdf');
    expect(saved[4].name).toMatch(/^mek-rider-vergelijking-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(saved.every((s) => !/marge|margin/i.test(s.text))).toBe(true);
  });
});
