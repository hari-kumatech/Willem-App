'use client';

import { Card, CardHeader, Stat } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { radarMsg } from '@/i18n/messages/radar';
import { usd } from '@/lib/format';

interface Usage {
  byProvider: { apify: number; claude: number };
  byAgent: Record<string, number>;
  byProfile: { name: string; apify: number; claude: number; budget: number }[];
}

function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-card-2" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? 'var(--accent)' : pct > 70 ? 'var(--warning)' : 'var(--positive)' }} />
    </div>
  );
}

export function UsageView({ usage, caps }: { usage: Usage; caps: { apifyMonthUsd: number; claudeMonthUsd: number } }) {
  const t = useMessages(radarMsg);
  const lang = useLang();
  return (
    <div className="internal-only space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Stat label={`${t.apify} · ${t.usageTitle}`} value={usd(usage.byProvider.apify, lang)} hint={`${t.of} ${usd(caps.apifyMonthUsd, lang)}`} />
          <Meter value={usage.byProvider.apify} max={caps.apifyMonthUsd} />
        </div>
        <div>
          <Stat label={`${t.claude} · ${t.usageTitle}`} value={usd(usage.byProvider.claude, lang)} hint={`${t.of} ${usd(caps.claudeMonthUsd, lang)}`} />
          <Meter value={usage.byProvider.claude} max={caps.claudeMonthUsd} />
        </div>
      </div>
      <p className="text-xs text-soft">{t.capsHint}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.usageByProfile} />
          <table className="data">
            <tbody>
              {usage.byProfile.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="text-right tabular-nums">{t.apify} {usd(p.apify, lang)}{p.budget ? ` / ${usd(p.budget, lang)}` : ''}</td>
                  <td className="text-right tabular-nums">{t.claude} {usd(p.claude, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader title={t.usageByAgent} />
          <table className="data">
            <tbody>
              {Object.entries(usage.byAgent)
                .sort((a, b) => b[1] - a[1])
                .map(([key, cost]) => (
                  <tr key={key}>
                    <td>{key.replace(':', ' · ')}</td>
                    <td className="text-right tabular-nums">{usd(cost, lang)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
