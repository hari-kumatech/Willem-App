// Formatting helpers (spec A.7: nl-NL numbers and currency, dd-mm-yyyy dates, Europe/Amsterdam).
// Every helper takes an optional language ('nl' default, 'en' → en-GB) for the bilingual UI.
import { localeOf, type Lang } from '@/i18n/core';

const TZ = 'Europe/Amsterdam';

export const euro = (value: number, digits = 0, lang: Lang = 'nl') =>
  new Intl.NumberFormat(localeOf(lang), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

export const usd = (value: number, lang: Lang = 'nl') =>
  new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  );

export const num = (value: number, digits = 0, lang: Lang = 'nl') =>
  new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(
    Number.isFinite(value) ? value : 0,
  );

export const pct = (value: number, digits = 1, lang: Lang = 'nl') => `${num(value, digits, lang)}%`;

// Today's date in Amsterdam as YYYY-MM-DD (fixes the UTC bug from A.8)
export function todayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function dateNl(value: string | null | undefined): string {
  if (!value) return '–';
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : '–';
}

export function dateTimeNl(value: string | null | undefined, lang: Lang = 'nl'): string {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat(localeOf(lang), {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function relativeNl(value: string | null | undefined, lang: Lang = 'nl'): string {
  if (!value) return '–';
  const en = lang === 'en';
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return en ? 'just now' : 'zojuist';
  if (min < 60) return en ? `${min} min ago` : `${min} min geleden`;
  const h = Math.round(min / 60);
  if (h < 24) return en ? `${h} h ago` : `${h} uur geleden`;
  const d = Math.round(h / 24);
  if (d === 1) return en ? 'yesterday' : 'gisteren';
  return en ? `${d} days ago` : `${d} dagen geleden`;
}

// Seconds → "1 min 5 sec", without the "60 sec" bug from A.8
export function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return `${sec} sec`;
  return sec === 0 ? `${min} min` : `${min} min ${sec} sec`;
}
