'use client';

// Hand-built SVG charts (no chart library). Colours come from the theme tokens via CSS variables,
// so dark, light and presentation mode all work. One y-axis, thin 2px lines, hover crosshair + tooltip.
import { useState, type PointerEvent } from 'react';
import { euro } from '@/lib/format';
import { useLang, useMessages } from '@/i18n/client';
import { roi } from '@/i18n/messages/roi';

const W = 780;
const H = 320;
const PAD = { l: 64, r: 20, t: 20, b: 36 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

const kLabel = (v: number) => `${v < 0 ? '-' : ''}€${Math.round(Math.abs(v) / 1000)}k`;

interface Series {
  key: string;
  label: string;
  color: string;
  dash?: string;
  values: number[]; // index = month
}

interface Marker {
  month: number;
  value: number;
  color: string;
  label: string;
}

interface LineChartProps {
  months: number;
  series: Series[];
  markers?: Marker[];
  min: number;
  max: number;
  ariaLabel: string;
}

function LineChart({ months, series, markers = [], min, max, ariaLabel }: LineChartProps) {
  const t = useMessages(roi);
  const lang = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const span = max - min || 1;
  const x = (m: number) => PAD.l + (m / months) * PLOT_W;
  const y = (v: number) => PAD.t + PLOT_H - ((v - min) / span) * PLOT_H;
  const ticks = Array.from({ length: 6 }, (_, i) => min + (span / 5) * i);
  const step = months <= 36 ? 6 : 12;
  const xTicks = Array.from({ length: Math.floor(months / step) + 1 }, (_, i) => i * step);

  function onMove(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(months, Math.round(rel * months))));
  }

  const tipX = hover !== null ? x(hover) : 0;
  const tipLeft = tipX > W - 220;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none select-none" role="img" aria-label={ariaLabel}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--soft)">
            {kLabel(v)}
          </text>
        </g>
      ))}
      {xTicks.map((m) => (
        <text key={m} x={x(m)} y={H - PAD.b + 18} textAnchor="middle" fontSize={11} fill="var(--soft)">
          {t.months(m)}
        </text>
      ))}
      {min < 0 && max > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--soft)" strokeWidth={1.5} />}
      {series.map((s) => (
        <path
          key={s.key}
          d={s.values.map((v, m) => `${m === 0 ? 'M' : 'L'}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeDasharray={s.dash}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {markers.map((mk) => (
        <g key={mk.label}>
          <line x1={x(mk.month)} x2={x(mk.month)} y1={PAD.t} y2={H - PAD.b} stroke={mk.color} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <circle cx={x(mk.month)} cy={y(mk.value)} r={5} fill={mk.color} stroke="var(--card)" strokeWidth={2} />
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--line)" />
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="var(--line)" />

      {hover !== null && (
        <g pointerEvents="none">
          <line x1={tipX} x2={tipX} y1={PAD.t} y2={H - PAD.b} stroke="var(--soft)" strokeWidth={1} />
          {series.map((s) => (
            <circle key={s.key} cx={tipX} cy={y(s.values[hover] ?? 0)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
          ))}
          <g transform={`translate(${tipLeft ? tipX - 210 : tipX + 10}, ${PAD.t + 4})`}>
            <rect width={200} height={22 + series.length * 18} rx={6} fill="var(--card-2)" stroke="var(--line)" />
            <text x={10} y={17} fontSize={12} fontWeight={600} fill="var(--ink)">
              {t.tipMonth(hover)}
            </text>
            {series.map((s, i) => (
              <g key={s.key} transform={`translate(10, ${34 + i * 18})`}>
                <rect y={-8} width={8} height={8} rx={2} fill={s.color} />
                <text x={14} fontSize={11} fill="var(--soft)">
                  {s.label}:
                </text>
                <text x={180} fontSize={11} textAnchor="end" fill="var(--ink)">
                  {euro(s.values[hover] ?? 0, 0, lang)}
                </text>
              </g>
            ))}
          </g>
        </g>
      )}
      <rect
        x={PAD.l}
        y={PAD.t}
        width={PLOT_W}
        height={PLOT_H}
        fill="transparent"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      />
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="1" x2="17" y1="4" y2="4" stroke={it.color} strokeWidth="2" strokeDasharray={it.dashed ? '4 3' : undefined} strokeLinecap="round" />
          </svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Koop: cumulative savings vs. full purchase price and price difference, with break-even markers
export function KoopChart({ price, priceDiff, monthlySavings, months }: { price: number; priceDiff: number; monthlySavings: number; months: number }) {
  const t = useMessages(roi);
  const savings = Array.from({ length: months + 1 }, (_, m) => monthlySavings * m);
  const max = Math.max(price, monthlySavings * months, 1) * 1.1;
  const markers: Marker[] = [];
  if (monthlySavings > 0) {
    const full = price / monthlySavings;
    const diff = priceDiff / monthlySavings;
    if (full <= months) markers.push({ month: full, value: price, color: 'var(--positive)', label: 'full' });
    if (diff <= months) markers.push({ month: diff, value: priceDiff, color: 'var(--warning)', label: 'diff' });
  }
  return (
    <>
      <LineChart
        months={months}
        min={0}
        max={max}
        ariaLabel={t.chartKoop}
        markers={markers}
        series={[
          { key: 'price', label: t.tipPrice, color: 'var(--soft)', dash: '6 5', values: savings.map(() => price) },
          { key: 'diff', label: t.tipDiff, color: 'var(--warning)', dash: '2 4', values: savings.map(() => priceDiff) },
          { key: 'savings', label: t.tipSavings, color: 'var(--accent)', values: savings },
        ]}
      />
      <Legend
        items={[
          { label: t.legendSavings, color: 'var(--accent)' },
          { label: t.legendPrice, color: 'var(--soft)', dashed: true },
          { label: t.legendDiff, color: 'var(--warning)', dashed: true },
        ]}
      />
    </>
  );
}

// Lease / AaS: cumulative net result (savings − monthly cost) against break-even € 0
export function RecurringChart({ net, months, ariaLabel }: { net: number; months: number; ariaLabel: string }) {
  const t = useMessages(roi);
  const values = Array.from({ length: months + 1 }, (_, m) => net * m);
  const maxAbs = Math.max(Math.abs(net * months), 1) * 1.2;
  return (
    <>
      <LineChart
        months={months}
        min={-maxAbs}
        max={maxAbs}
        ariaLabel={ariaLabel}
        series={[
          { key: 'zero', label: t.tipZero, color: 'var(--soft)', dash: '6 5', values: values.map(() => 0) },
          { key: 'net', label: t.tipNet, color: 'var(--accent)', values },
        ]}
      />
      <Legend
        items={[
          { label: t.legendNet, color: 'var(--accent)' },
          { label: t.legendZero, color: 'var(--soft)', dashed: true },
        ]}
      />
    </>
  );
}
