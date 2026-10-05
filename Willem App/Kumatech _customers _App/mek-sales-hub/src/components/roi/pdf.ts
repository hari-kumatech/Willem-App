// Client-only PDF generation (jsPDF is loaded on demand). Both PDFs recompute everything with
// computeRoi(), the same function the screens use, so the figures always match. The customer quote
// never contains MEK's internal margin figures.
import { pick, localeOf, type Lang } from '@/i18n/core';
import { roi, type RoiMessages } from '@/i18n/messages/roi';
import { euro, num, todayIso } from '@/lib/format';
import { computeRoi, quoteLine, quoteModels, type Customer, type QuoteModel, type RoiInputs, type RoiResult } from '@/modules/roi/calc';
import { comparisonHead, comparisonRows, effLabel, paybackShort } from './fmt';

type JsPdf = import('jspdf').jsPDF;
type Rgb = [number, number, number];

const NAVY: Rgb = [14, 32, 56];
const RED: Rgb = [214, 72, 61];
const INK: Rgb = [30, 36, 48];
const GREY: Rgb = [110, 120, 135];
const SOFT: Rgb = [147, 166, 191];
const LINE: Rgb = [220, 224, 230];

export type PdfCustomer = Pick<Customer, 'naam' | 'bedrijf' | 'email' | 'telefoon'>;

// jsPDF's standard fonts use WinAnsi: normalise the Unicode spaces/minus that Intl produces
const clean = (s: string) => s.replace(/[   ]/g, ' ').replace(/−/g, '-');

function fmtDate(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

async function newDoc(): Promise<JsPdf> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

function color(doc: JsPdf, kind: 'text' | 'fill' | 'draw', c: Rgb) {
  if (kind === 'text') doc.setTextColor(c[0], c[1], c[2]);
  else if (kind === 'fill') doc.setFillColor(c[0], c[1], c[2]);
  else doc.setDrawColor(c[0], c[1], c[2]);
}

function text(doc: JsPdf, value: string | string[], x: number, y: number, options?: { align?: 'left' | 'right' | 'center' }) {
  doc.text(Array.isArray(value) ? value.map(clean) : clean(value), x, y, options);
}

// The white SVG logo rasterised to PNG through a canvas (jsPDF cannot place SVG). Null on failure.
let logoCache: Promise<string | null> | null = null;
function logoPng(): Promise<string | null> {
  logoCache ??= (async () => {
    try {
      const res = await fetch('/brand/mek-logo-wit.svg');
      if (!res.ok) return null;
      // Give the SVG an explicit size; without width/height some browsers draw it at 0×0
      const svg = (await res.text()).replace(/<svg\b/, '<svg width="984" height="382"');
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 984;
            canvas.height = 382;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    } catch {
      return null;
    }
  })();
  return logoCache;
}

async function drawLogo(doc: JsPdf, x: number, y: number, w: number) {
  const logo = await logoPng();
  if (logo) {
    doc.addImage(logo, 'PNG', x, y, w, (w * 382) / 984);
  } else {
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(26);
    color(doc, 'text', [255, 255, 255]);
    text(doc, 'MEK', x, y + 12);
  }
}

// ---------------------------------------------------------------------------
// Quote PDF
// ---------------------------------------------------------------------------

export interface QuotePdfInput {
  lang: Lang;
  number: string;
  date: Date;
  validDays: number;
  vatPct: number;
  model: QuoteModel;
  trucks: number;
  customer: PdfCustomer;
  inputs: RoiInputs;
  contactEmail: string;
}

interface Offer {
  label: string;
  desc: string;
  sub: string;
  unit: number;
  subtotal: number;
  vat: number;
  suffix: string;
  extraLabel: string | null;
  extraValue: number;
  benefit: [string, string][];
}

function buildOffer(model: 'koop' | 'lease' | 'aas', r: RoiResult, trucks: number, vatPct: number, t: RoiMessages, lang: Lang): Offer {
  const line = quoteLine(r, model, trucks, vatPct);
  const e = (v: number) => euro(v, 0, lang);
  const p = t.pdf;
  const sub =
    model === 'koop'
      ? p.subKoop
      : model === 'lease'
        ? p.subLease(r.lease.termMonths, `${num(r.lease.ratePct, 1, lang)}%`, e(r.koop.price))
        : p.subAas(r.aas.termMonths);
  const benefit: [string, string][] = [];
  if (model === 'koop') {
    benefit.push([p.paybackFull, paybackShort(r.koop.paybackFullMonths, t)]);
    benefit.push([p.paybackExtra(e(r.koop.competitorPrice)), paybackShort(r.koop.paybackExtraMonths, t)]);
  } else {
    // Same basis as step 3 and the comparison (lease difference option included)
    const label = model === 'lease' && r.lease.useDifference ? p.netMonthDiff : p.netMonth;
    benefit.push([label, e(line.netMonth ?? 0)]);
  }
  return {
    label: t.models[model],
    desc: p.desc(t.models[model]),
    sub,
    unit: line.unit,
    subtotal: line.subtotal,
    vat: line.vat,
    suffix: line.recurring ? p.perMonth : '',
    extraLabel: line.termMonths ? p.contractTotal(line.termMonths) : null,
    extraValue: line.contractTotal,
    benefit,
  };
}

export async function downloadQuotePdf(input: QuotePdfInput): Promise<void> {
  const { lang } = input;
  const t = pick(roi, lang);
  const p = t.pdf;
  const r = computeRoi(input.inputs);
  const trucks = Math.max(1, Math.round(input.trucks));
  const eur2 = (v: number) => euro(v, 2, lang);
  const doc = await newDoc();

  const valid = new Date(input.date.getTime() + input.validDays * 86_400_000);

  // Header
  color(doc, 'fill', NAVY);
  doc.rect(0, 0, 210, 44, 'F');
  color(doc, 'fill', RED);
  doc.rect(0, 44, 210, 1.2, 'F');
  await drawLogo(doc, 15, 11, 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  color(doc, 'text', [255, 255, 255]);
  text(doc, p.quote, 195, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  color(doc, 'text', SOFT);
  text(doc, `${p.quoteNumber}: ${input.number}`, 195, 28, { align: 'right' });
  text(doc, `${p.date}: ${fmtDate(input.date, lang)}`, 195, 33, { align: 'right' });
  text(doc, `${p.validUntil}: ${fmtDate(valid, lang)}`, 195, 38, { align: 'right' });

  // Customer / sender
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  color(doc, 'text', RED);
  text(doc, p.for, 15, 58);
  text(doc, p.from, 120, 58);
  color(doc, 'text', INK);
  let cy = 64;
  const c = input.customer;
  doc.setFontSize(10.5);
  if (c.naam) {
    text(doc, c.naam, 15, cy);
    cy += 5;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  for (const v of [c.bedrijf, c.email, c.telefoon]) {
    if (v) {
      text(doc, v, 15, cy);
      cy += 5;
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  text(doc, 'MEK-Mover', 120, 64);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  text(doc, input.contactEmail, 120, 69);
  text(doc, 'www.mek-mover.nl', 120, 74);

  let y = Math.max(cy, 78) + 4;
  color(doc, 'text', GREY);
  text(doc, p.effLine(effLabel(r.efficiency, lang)), 15, y);
  y += 10;

  const all = input.model === 'alle';
  const offers = quoteModels(input.model).map((m) => buildOffer(m, r, trucks, input.vatPct, t, lang));
  const savingsMonth = r.savings.perMonth * trucks;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  color(doc, 'text', NAVY);
  text(doc, all ? p.offerAll : p.offerOne, 15, y);
  y += 8;

  if (!all) {
    const o = offers[0];
    color(doc, 'fill', [240, 243, 247]);
    doc.rect(15, y - 5.3, 180, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    color(doc, 'text', GREY);
    text(doc, p.colDesc, 17, y);
    text(doc, p.colQty, 124, y, { align: 'right' });
    text(doc, p.colUnit, 158, y, { align: 'right' });
    text(doc, p.colTotal, 193, y, { align: 'right' });
    y += 10;
    doc.setFontSize(10);
    color(doc, 'text', INK);
    text(doc, o.desc, 17, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    text(doc, String(trucks), 124, y, { align: 'right' });
    text(doc, eur2(o.unit) + o.suffix, 158, y, { align: 'right' });
    text(doc, eur2(o.subtotal) + o.suffix, 193, y, { align: 'right' });
    doc.setFontSize(8);
    color(doc, 'text', GREY);
    const subLines: string[] = doc.splitTextToSize(clean(o.sub), 160);
    text(doc, subLines, 17, y + 4.6);
    y += 4.6 * subLines.length + 6;
    color(doc, 'draw', LINE);
    doc.line(15, y, 195, y);
    y += 8;

    const totLine = (label: string, value: string, bold: boolean) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 10.5 : 9.5);
      color(doc, 'text', INK);
      text(doc, label, 115, y);
      text(doc, value, 193, y, { align: 'right' });
      y += bold ? 7 : 6;
    };
    const per = o.suffix ? p.perMonthWord : '';
    totLine(p.subtotal + per, eur2(o.subtotal), false);
    totLine(p.vat(input.vatPct), eur2(o.vat), false);
    totLine(p.totalIncl + per, eur2(o.subtotal + o.vat), true);
    if (o.extraLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      color(doc, 'text', GREY);
      text(doc, `${o.extraLabel}: ${eur2(o.extraValue)}`, 193, y, { align: 'right' });
      y += 5;
    }

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    color(doc, 'text', NAVY);
    text(doc, p.benefitTitle, 15, y);
    y += 3;
    color(doc, 'draw', RED);
    doc.setLineWidth(0.6);
    doc.line(15, y, 30, y);
    doc.setLineWidth(0.2);
    y += 7;
    doc.setFontSize(9.5);
    const rows: [string, string][] = [[p.savingsMonth(trucks), eur2(savingsMonth)], ...o.benefit];
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'normal');
      color(doc, 'text', GREY);
      text(doc, label, 15, y);
      doc.setFont('helvetica', 'bold');
      color(doc, 'text', INK);
      text(doc, value, 193, y, { align: 'right' });
      y += 6.5;
    }
    y += 2;
  } else {
    const colW = 58;
    const gap = 3;
    const topY = y;
    let maxBottom = topY;
    offers.forEach((o, i) => {
      const x = 15 + i * (colW + gap);
      let oy = topY;
      color(doc, 'fill', i === 0 ? [240, 243, 247] : [246, 247, 250]);
      doc.roundedRect(x, oy, colW, 8, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      color(doc, 'text', RED);
      text(doc, o.label, x + 3, oy + 5.5);
      oy += 13;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      color(doc, 'text', GREY);
      const subLines: string[] = doc.splitTextToSize(clean(o.sub), colW - 6);
      text(doc, subLines, x + 3, oy);
      oy += 3.2 * subLines.length + 3;
      color(doc, 'draw', LINE);
      doc.line(x, oy, x + colW, oy);
      oy += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      color(doc, 'text', NAVY);
      text(doc, eur2(o.unit) + o.suffix, x + 3, oy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      color(doc, 'text', GREY);
      text(doc, p.perPiece, x + 3, oy + 3.6);
      oy += 9;
      doc.setFontSize(7.3);
      if (trucks > 1) {
        text(doc, doc.splitTextToSize(clean(p.totalQty(trucks, eur2(o.subtotal) + o.suffix)), colW - 6), x + 3, oy);
        oy += 4.5;
      }
      text(doc, p.inclVat(eur2(o.subtotal + o.vat) + o.suffix), x + 3, oy);
      oy += 4.5;
      if (o.extraLabel) {
        const lbl: string[] = doc.splitTextToSize(clean(`${o.extraLabel}: ${eur2(o.extraValue)}`), colW - 6);
        text(doc, lbl, x + 3, oy);
        oy += 3.4 * lbl.length;
      }
      oy += 3;
      color(doc, 'draw', LINE);
      doc.line(x, oy, x + colW, oy);
      oy += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      color(doc, 'text', NAVY);
      text(doc, p.benefitShort, x + 3, oy);
      oy += 4.5;
      doc.setFontSize(7);
      for (const [label, value] of o.benefit) {
        doc.setFont('helvetica', 'normal');
        color(doc, 'text', GREY);
        const lbl: string[] = doc.splitTextToSize(clean(label), colW - 6);
        text(doc, lbl, x + 3, oy);
        oy += 3.4 * lbl.length;
        doc.setFont('helvetica', 'bold');
        color(doc, 'text', INK);
        text(doc, value, x + 3, oy);
        oy += 4.6;
      }
      color(doc, 'draw', LINE);
      doc.roundedRect(x, topY, colW, oy - topY, 1, 1, 'S');
      maxBottom = Math.max(maxBottom, oy);
    });
    y = maxBottom + 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    color(doc, 'text', GREY);
    text(doc, p.savingsLine(eur2(savingsMonth), trucks), 15, y);
    y += 6;
  }

  // Assumptions
  const i = input.inputs;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  color(doc, 'text', GREY);
  const assumptions: string[] = doc.splitTextToSize(
    clean(p.assumptions(euro(i.wage, 0, lang), `${num(i.usagePct, 0, lang)}%`, num(i.hoursPerDay, 0, lang), Math.round(i.shifts), Math.round(i.workDays))),
    180,
  );
  text(doc, assumptions, 15, y);
  y += 4 * assumptions.length + 6;

  // Terms
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  color(doc, 'text', NAVY);
  text(doc, p.terms, 15, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  color(doc, 'text', GREY);
  for (const term of [p.termValid(fmtDate(valid, lang)), p.termExcl, p.termIndicative, p.termDelivery]) {
    text(doc, `•  ${term}`, 15, y);
    y += 4.5;
  }

  // Signature
  let sy = Math.max(y + 8, 236);
  if (sy > 262) {
    footer(doc, input.contactEmail);
    doc.addPage();
    sy = 30;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  color(doc, 'text', NAVY);
  text(doc, p.signTitle, 15, sy);
  color(doc, 'draw', LINE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  color(doc, 'text', GREY);
  doc.line(15, sy + 16, 80, sy + 16);
  text(doc, p.signName, 15, sy + 20);
  doc.line(90, sy + 16, 130, sy + 16);
  text(doc, p.signDate, 90, sy + 20);
  doc.line(140, sy + 16, 195, sy + 16);
  text(doc, p.signSignature, 140, sy + 20);

  footer(doc, input.contactEmail);
  doc.save(p.fileQuote(input.number));
}

function footer(doc: JsPdf, contactEmail: string) {
  color(doc, 'draw', LINE);
  doc.line(15, 284, 195, 284);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  color(doc, 'text', GREY);
  text(doc, `MEK-Mover  ·  ${contactEmail}  ·  www.mek-mover.nl`, 105, 289, { align: 'center' });
}

// ---------------------------------------------------------------------------
// Comparison PDF: mek-rider-vergelijking-YYYY-MM-DD.pdf
// ---------------------------------------------------------------------------

export async function downloadComparisonPdf(input: { lang: Lang; customer: PdfCustomer; inputs: RoiInputs; contactEmail: string }): Promise<void> {
  const { lang } = input;
  const t = pick(roi, lang);
  const p = t.pdf;
  const r = computeRoi(input.inputs);
  const e = (v: number) => euro(v, 0, lang);
  const doc = await newDoc();
  const now = new Date();

  color(doc, 'fill', NAVY);
  doc.rect(0, 0, 210, 36, 'F');
  color(doc, 'fill', RED);
  doc.rect(0, 36, 210, 1, 'F');
  await drawLogo(doc, 15, 9, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  color(doc, 'text', [255, 255, 255]);
  text(doc, p.cmpTitle, 62, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  color(doc, 'text', SOFT);
  text(doc, `${p.date}: ${fmtDate(now, lang)}`, 62, 24);

  let y = 48;
  const heading = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    color(doc, 'text', NAVY);
    text(doc, label, 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    color(doc, 'text', INK);
  };
  const c = input.customer;
  heading(p.contactTitle);
  for (const [label, value] of [
    [t.mailName, c.naam],
    [t.mailCompany, c.bedrijf],
    [t.mailEmail, c.email],
    [t.mailPhone, c.telefoon],
  ]) {
    text(doc, `${label}: ${value || '-'}`, 15, y);
    y += 5;
  }
  y += 5;
  heading(p.assumptionsTitle);
  for (const line of [
    `${p.cmpPrice}: ${e(r.koop.price)}`,
    `${p.cmpCompetitor}: ${e(r.koop.competitorPrice)}`,
    `${p.cmpDiff}: ${e(r.koop.priceDiff)}`,
    `${p.cmpEff}: ${effLabel(r.efficiency, lang)}`,
    `${p.cmpSavingsMonth}: ${e(r.savings.perMonth)}`,
  ]) {
    text(doc, line, 15, y);
    y += 5;
  }
  doc.setFontSize(8);
  color(doc, 'text', GREY);
  const i = input.inputs;
  const assumptions: string[] = doc.splitTextToSize(
    clean(p.assumptions(e(i.wage), `${num(i.usagePct, 0, lang)}%`, num(i.hoursPerDay, 0, lang), Math.round(i.shifts), Math.round(i.workDays))),
    180,
  );
  text(doc, assumptions, 15, y + 1);
  y += 4 * assumptions.length + 8;

  heading(p.cmpSection);
  y += 2;
  // Same rows as the on-screen table (step 4)
  const head = comparisonHead(t);
  const rows = comparisonRows(r, t, lang);
  const colX = [15, 72, 112, 152];
  const colW = [55, 38, 38, 43];
  const drawRow = (cells: string[], bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    let lines = 1;
    cells.forEach((cell, ci) => {
      color(doc, 'text', ci === 0 && !bold ? GREY : INK);
      const split: string[] = doc.splitTextToSize(clean(cell), colW[ci]);
      lines = Math.max(lines, split.length);
      text(doc, split, colX[ci], y);
    });
    y += 4 * lines + 2;
    color(doc, 'draw', LINE);
    doc.line(15, y - 3.5, 195, y - 3.5);
  };
  drawRow(head, true);
  for (const row of rows) drawRow(row, false);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  color(doc, 'text', GREY);
  text(doc, p.cmpFooter, 15, y);
  footer(doc, input.contactEmail);

  doc.save(p.fileCompare(todayIso(now)));
}
