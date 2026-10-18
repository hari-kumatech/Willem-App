// Display helpers shared by the wizard, the comparison table and both PDFs (one wording, one rounding).
import type { Lang } from '@/i18n/core';
import type { RoiMessages } from '@/i18n/messages/roi';
import { euro, num } from '@/lib/format';
import type { RoiResult } from '@/modules/roi/calc';

export function paybackLabel(months: number, t: RoiMessages, lang: Lang): string {
  if (!Number.isFinite(months)) return '–';
  const rounded = Math.round(months);
  return months < 12 ? t.months(rounded) : t.paybackYears(num(months / 12, 1, lang), rounded);
}

export function paybackShort(months: number, t: RoiMessages): string {
  return Number.isFinite(months) ? t.months(Math.round(months)) : '–';
}

export function netLabel(net: number, t: RoiMessages, lang: Lang): string {
  return net > 0 ? t.directPositive : `${euro(net, 0, lang)}${t.perMonth}`;
}

export function effLabel(efficiency: number, lang: Lang): string {
  return `${num(efficiency * 100, 1, lang)}%`;
}

export function comparisonHead(t: RoiMessages): string[] {
  return [t.cmp.feature, t.models.koop, t.models.lease, t.models.aas];
}

// Customer-facing comparison (no internal margin figures). Used by step 4 and the comparison PDF.
export function comparisonRows(r: RoiResult, t: RoiMessages, lang: Lang): string[][] {
  const c = t.cmp;
  const e = (v: number) => euro(v, 0, lang);
  return [
    [c.type, c.oneOff, c.leaseTerm, c.allIn],
    [c.amountMonth, c.naOneOff, e(r.lease.monthly), e(r.aas.fee)],
    [c.paybackFull, paybackShort(r.koop.paybackFullMonths, t), '–', '–'],
    [c.paybackExtra, paybackShort(r.koop.paybackExtraMonths, t), '–', '–'],
    [c.net, '–', netLabel(r.lease.net, t, lang), netLabel(r.aas.net, t, lang)],
    [c.term, c.na, t.months(r.lease.termMonths), t.months(r.aas.termMonths)],
    [c.total, e(r.koop.totalCost), e(r.lease.totalCost) + (r.lease.useDifference ? c.diffBasis : ''), e(r.aas.totalCost)],
    [c.owner, c.ownerKoop, c.ownerLease, c.ownerAas],
    [c.risk, c.riskKoop, c.riskLease, c.riskAas],
  ];
}
