'use client';

import { ExternalLink, Mail, Phone, UserSearch } from 'lucide-react';
import { ExtLink, KansBadge, Pill, cx } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { radarMsg } from '@/i18n/messages/radar';
import { relativeNl } from '@/lib/format';
import { googleLinkedinUrl } from '@/lib/text';

export interface CompanyAssessmentData {
  id: string;
  name: string;
  kans: string | null;
  fit_score: number | null;
  criteria: Record<string, { score: number; evidence: string; source: string }>;
  score_reasons: { text: string; evidence: string; source: string }[];
  risks: string[];
  waarom: string;
  aanpak: string;
  // English versions of waarom / aanpak / reasons / risks (shown when the UI is English)
  texts_en?: AssessmentTextsEn | null;
  qualified_at: string | null;
  qualified_mode: string | null;
  distance_home_km?: number | null;
}

export interface AssessmentTextsEn {
  waarom?: string;
  aanpak?: string;
  reasons?: string[];
  risks?: string[];
}

// The assessment texts in the UI language: English when the UI is English and an English version exists
export function localisedTexts(
  company: Pick<CompanyAssessmentData, 'waarom' | 'aanpak' | 'score_reasons' | 'risks' | 'texts_en'>,
  lang: string,
) {
  const en = lang === 'en' ? company.texts_en ?? null : null;
  return {
    waarom: en?.waarom || company.waarom,
    aanpak: en?.aanpak || company.aanpak,
    reasons: (company.score_reasons ?? []).map((r, i) => ({ ...r, text: en?.reasons?.[i] || r.text })),
    risks: en?.risks?.length ? en.risks : company.risks ?? [],
  };
}

export interface SignalData {
  type: string;
  text: string;
  url: string;
}

export interface ContactData {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  source_url: string;
  linkedin_search_url: string;
  is_primary: boolean;
}

const CRITERIA = ['palletFlows', 'volume', 'multiDrop', 'growth', 'family', 'dataQuality'] as const;

function SourceLink({ source, label }: { source: string; label: string }) {
  if (!/^https?:\/\//.test(source)) return <span className="text-soft">({label})</span>;
  let host = source;
  try {
    host = new URL(source).hostname.replace(/^www\./, '');
  } catch {}
  return (
    <ExtLink href={source} className="inline-flex items-center gap-0.5 text-xs">
      {host}
      <ExternalLink size={10} />
    </ExtLink>
  );
}

export function Assessment({ company, signals, compact = false }: { company: CompanyAssessmentData; signals: SignalData[]; compact?: boolean }) {
  const t = useMessages(radarMsg);
  const lang = useLang();
  if (!company.qualified_at) return <p className="text-sm text-soft">{t.notQualified}</p>;
  const texts = localisedTexts(company, lang);
  const scoreColor = company.kans === 'A' ? 'var(--positive)' : company.kans === 'B' ? 'var(--warning)' : 'var(--soft)';
  return (
    <div className="space-y-4">
      <div className="internal-only flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--line)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3" strokeDasharray={`${company.fit_score ?? 0} 100`} strokeLinecap="round" />
          </svg>
          <div className="mek-heading absolute inset-0 flex items-center justify-center text-lg">{company.fit_score ?? '–'}</div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <KansBadge kans={company.kans} />
            <span className="text-sm font-semibold">{t.fitScore}</span>
          </div>
          <p className="mt-1 text-xs text-soft">
            {t.qualifiedAt(relativeNl(company.qualified_at, lang), company.qualified_mode === 'agent' ? t.modeAgent : t.modeRules)}
          </p>
        </div>
      </div>

      {!compact && (
        <div className="internal-only grid gap-1.5">
          {CRITERIA.map((key) => {
            const c = company.criteria?.[key];
            if (!c) return null;
            return (
              <div key={key} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-xs" title={c.evidence}>
                <span className="truncate text-soft">{t.criteria[key]}</span>
                <div className="h-2 overflow-hidden rounded-full bg-card-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((c.score ?? 0) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {texts.reasons.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">{t.reasons}</h3>
          <ul className="space-y-1.5 text-sm">
            {texts.reasons.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  {r.text}
                  {!compact && r.evidence && <span className="block text-xs text-soft">“{r.evidence}”</span>}{' '}
                  <SourceLink source={r.source} label={t.listing} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {signals.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">{t.signals}</h3>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.text}>
                <Pill tone="info">
                  {t.signalTypes[s.type as keyof typeof t.signalTypes] ?? s.type}: {s.text.slice(0, 50)}
                  {s.text.length > 50 ? '…' : ''}
                </Pill>
              </a>
            ))}
          </div>
        </div>
      )}

      {(texts.waarom || texts.aanpak) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {texts.waarom && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">{t.waarom}</h3>
              <p className="text-sm">{texts.waarom}</p>
            </div>
          )}
          {texts.aanpak && (
            <div className="internal-only">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">{t.aanpak}</h3>
              <p className="text-sm">{texts.aanpak}</p>
            </div>
          )}
        </div>
      )}

      {!compact && texts.risks.length > 0 && (
        <div className="internal-only">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">{t.risks}</h3>
          <ul className="list-inside list-disc text-sm text-soft">
            {texts.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ContactList({ contacts, companyName }: { contacts: ContactData[]; companyName: string }) {
  const t = useMessages(radarMsg);
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">{t.contacts}</h3>
      {contacts.length === 0 ? (
        <p className="text-sm text-soft">{t.noContacts}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {contacts.map((c) => (
            <li key={c.id} className={cx('rounded-lg border p-2', c.is_primary ? 'border-positive/50' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.name || c.role || '–'}</span>
                {c.name && c.role && <span className="text-xs text-soft">{c.role}</span>}
                {c.is_primary && <Pill tone="positive">{t.primary}</Pill>}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-soft">
                {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail size={12} />{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone size={12} />{c.phone}</a>}
                {c.linkedin_search_url && <ExtLink href={c.linkedin_search_url} className="inline-flex items-center gap-1"><UserSearch size={12} />LinkedIn</ExtLink>}
                {c.source_url && <SourceLink source={c.source_url} label={t.listing} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ExtLink href={googleLinkedinUrl(companyName)} className="mt-2 inline-flex items-center gap-1 text-xs">
        <UserSearch size={12} /> Google: site:linkedin.com/in
      </ExtLink>
    </div>
  );
}
