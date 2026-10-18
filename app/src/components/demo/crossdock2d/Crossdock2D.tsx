'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button, Card, CardHeader, cx } from '@/components/ui';
import { fmtTime, num, pct } from '@/lib/format';
import type { Lang } from '@/i18n/core';
import { useLang, useMessages } from '@/i18n/client';
import { demo, type DemoMessages } from '@/i18n/messages/demo';
import { calcHall, type CrossdockResult } from '@/modules/crossdock/calc';
import { HALL_FIELDS, type Hall, type HallKey } from '@/modules/crossdock/hall';
import { Rich } from '../Rich';
import { LanePlan } from './LanePlan';
import { laneState, turnTowards, type ZoneKey } from './sim';

const TEMPOS = [10, 20, 40] as const;

interface Step {
  title: string;
  text: string;
  zones: ZoneKey[];
  win: boolean;
  impact: (r: CrossdockResult) => string;
  note?: string;
}

function buildSteps(t: DemoMessages, hall: Hall, lang: Lang): Step[] {
  return [
    { title: t.step1Title, text: t.step1Text, zones: ['inbound'], win: false, impact: () => t.step1Impact },
    // Qualitative claim only: the calculator deliberately does not credit fewer drive-ins (see step2Note).
    { title: t.step2Title, text: t.step2Text, zones: ['inbound'], win: true, impact: () => t.step2Impact, note: t.step2Note },
    { title: t.step3Title, text: t.step3Text, zones: ['staging'], win: false, impact: () => t.step3Impact },
    {
      title: t.step4Title,
      text: t.step4Text,
      zones: ['route'],
      win: true,
      impact: (r) =>
        t.step4Impact(
          num(r.mekTripsPerDay, 0, lang),
          num(r.stdTripsPerDay, 0, lang),
          num(r.stdKmPerDay - r.mekKmPerDay, 0, lang),
          num(hall.palletsPerDay, 0, lang),
        ),
    },
    {
      title: t.step5Title,
      text: t.step5Text,
      zones: ['outA', 'outB'],
      win: true,
      impact: (r) =>
        t.step5Impact(num(hall.gapM, 0, lang), num(r.stdTripM, 0, lang), fmtTime(r.mekSecondsPerPallet), fmtTime(r.stdSecondsPerPallet)),
    },
  ];
}

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Crossdock2D({
  hall,
  onHallChange,
  shiftHours,
  mekName,
  hallTitle,
  actions,
}: {
  hall: Hall;
  onHallChange: (hall: Hall) => void;
  shiftHours: number;
  mekName: string;
  hallTitle?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useMessages(demo);
  const lang = useLang();
  const result = useMemo(() => calcHall(hall, shiftHours), [hall, shiftHours]);

  // ---- Animation: the rAF loop only runs while playing (no busy loop when paused) ----
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState<(typeof TEMPOS)[number]>(20);
  const [frame, setFrame] = useState({ simT: 0, std: 180, mek: 180 });
  const frameRef = useRef(frame);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  // Autoplay, unless the user prefers reduced motion (then it starts paused).
  useEffect(() => {
    if (!prefersReducedMotion()) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (ts: number) => {
      const dt = last == null ? 0.016 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      const prev = frameRef.current;
      const simT = prev.simT + dt * tempo;
      const next = {
        simT,
        std: turnTowards(prev.std, laneState(1, hall, simT, t).ang, dt),
        mek: turnTowards(prev.mek, laneState(2, hall, simT, t).ang, dt),
      };
      frameRef.current = next;
      setFrame(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tempo, hall, t]);

  const std = laneState(1, hall, frame.simT, t);
  const mek = laneState(2, hall, frame.simT, t);
  // While paused, show the truck at its exact heading (e.g. after moving a slider).
  const angStd = playing ? frame.std : std.ang;
  const angMek = playing ? frame.mek : mek.ang;

  const reset = () => {
    const next = { simT: 0, std: 180, mek: 180 };
    frameRef.current = next;
    setFrame(next);
  };
  const mm = Math.floor(frame.simT / 60);
  const ss = Math.floor(frame.simT % 60);
  const ahead = mek.delivered - std.delivered;
  const leadText = frame.simT < 1 ? t.leadStart : ahead > 0 ? t.leadAhead(mm, ss, ahead) : t.leadBusy;

  // ---- Process steps (step 5 selected by default) ----
  const steps = buildSteps(t, hall, lang);
  const [active, setActive] = useState(4);
  const step = steps[active];

  const unit = (key: HallKey) =>
    key === 'speedKmh' ? t.units.kmh : key === 'loadSecondsPerPallet' ? t.units.sec : key === 'palletsPerDay' ? t.units.pallets : t.units.m;
  const fmtVal = (key: HallKey, v: number) => {
    const u = unit(key);
    return `${num(v, key === 'speedKmh' && v % 1 ? 1 : 0, lang)}${u ? ` ${u}` : ''}`;
  };
  const hrs = (h: number) => t.hours(num(h, 1, lang));

  const lanes = [
    { key: 'std', perRide: 1 as const, name: t.stdName, sub: t.stdSub, st: std, ang: angStd, label: t.planLabelStd },
    { key: 'mek', perRide: 2 as const, name: mekName, sub: t.mekSub, st: mek, ang: angMek, label: t.planLabelMek },
  ];

  const rows: [string, string, string][] = [
    [t.rowSpots, '1', '2'],
    [t.rowCycle, fmtTime(result.stdCycleSeconds), fmtTime(result.mekCycleSeconds)],
    [t.rowPerPallet, fmtTime(result.stdSecondsPerPallet), fmtTime(result.mekSecondsPerPallet)],
    [t.rowTrips, num(result.stdTripsPerDay, 0, lang), num(result.mekTripsPerDay, 0, lang)],
    [t.rowKm, `${num(result.stdKmPerDay, 0, lang)} km`, `${num(result.mekKmPerDay, 0, lang)} km`],
    [t.rowHours, hrs(result.stdHoursPerDay), hrs(result.mekHoursPerDay)],
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[70ch] text-sm leading-relaxed text-soft">{t.intro}</p>

      <Card className="p-4 sm:p-5">
        <div className="space-y-5">
          {lanes.map((L) => (
            <div key={L.key}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-lg">
                  <span className="mek-heading">{L.name}</span>
                  <small className="ml-1.5 text-xs text-soft">{L.sub}</small>
                </div>
                <div className={cx('mek-heading text-2xl tabular-nums', L.key === 'mek' && 'text-accent')}>
                  {num(L.st.delivered, 0, lang)}
                  <span className="ml-1 font-sans text-xs font-normal normal-case not-italic text-soft">{t.moved(L.st.delivered)}</span>
                </div>
              </div>
              <LanePlan perRide={L.perRide} state={L.st} ang={L.ang} zones={step.zones} label={L.label} t={t} />
              <div className="mt-1.5 min-h-[1.2em] text-xs text-soft">{frame.simT > 0 ? t.phaseLine(L.st.label, L.st.ride) : t.ready}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
          <Button onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
            {playing ? t.pause : t.start}
          </Button>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw size={16} aria-hidden />
            {t.reset}
          </Button>
          <div role="group" aria-label={t.tempoLabel} className="inline-flex overflow-hidden rounded-lg border border-line">
            {TEMPOS.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={tempo === x}
                onClick={() => setTempo(x)}
                className={cx('px-3 py-2 text-xs font-semibold', tempo === x ? 'bg-accent/15 text-ink' : 'text-soft hover:text-ink')}
              >
                {x}×
              </button>
            ))}
          </div>
          <div className="ml-auto text-sm text-soft">
            {t.clock} <b className="tabular-nums text-ink">{`${mm}:${String(ss).padStart(2, '0')}`}</b>
          </div>
        </div>
        <div className="mt-3 text-sm [&_b]:text-positive">
          <Rich text={leadText} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t.stepsTitle} />
        <div className="p-4 sm:p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            {steps.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === active}
                onClick={() => setActive(i)}
                className={cx(
                  'relative rounded-lg border px-3 py-2.5 text-left text-xs leading-snug transition',
                  i === active ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-bg text-soft hover:text-ink',
                )}
              >
                <span className="mek-heading block text-lg text-ink">{i + 1}</span>
                {s.title}
                {s.win && <span className="absolute right-2.5 top-2.5 text-[0.66rem] font-semibold text-accent">{t.mekAdvantage}</span>}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
            <div>
              <h3 className="mb-2 font-semibold">
                {active + 1}. {step.title}
              </h3>
              <p className="max-w-[60ch] text-sm leading-relaxed text-soft">{step.text}</p>
            </div>
            <div className={cx('rounded-lg px-3.5 py-3 text-sm leading-relaxed', step.win ? 'bg-accent/10' : 'bg-card-2 text-soft')} aria-live="polite">
              <Rich text={step.impact(result)} />
              {step.note && <p className="mt-2 text-xs italic text-soft">{step.note}</p>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={hallTitle ?? t.calcTitle}>{actions}</CardHeader>
        <div className="grid gap-6 p-4 sm:p-5 md:grid-cols-2">
          <div className="space-y-4">
            {HALL_FIELDS.map((f) => {
              const id = `hall-${f.key}`;
              return (
                <div key={f.key}>
                  <div className="mb-1.5 flex justify-between gap-3 text-sm">
                    <label htmlFor={id}>{t.fields[f.key]}</label>
                    <output htmlFor={id} className="font-semibold tabular-nums text-accent">
                      {fmtVal(f.key, hall[f.key])}
                    </output>
                  </div>
                  <input
                    id={id}
                    type="range"
                    className="w-full"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={hall[f.key]}
                    aria-valuetext={fmtVal(f.key, hall[f.key])}
                    onChange={(e) => onHallChange({ ...hall, [f.key]: Number(e.target.value) })}
                  />
                </div>
              );
            })}
          </div>
          <div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">{t.calcTitle}</span>
                    </th>
                    <th scope="col" className="text-right">
                      {t.stdName}
                    </th>
                    <th scope="col" className="text-right">
                      {mekName}
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map(([label, s, m], i) => (
                    <tr key={label} className={cx(i === rows.length - 1 && 'font-bold')}>
                      <td>{label}</td>
                      <td className="text-right">{s}</td>
                      <td className="text-right font-semibold text-accent">{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mek-heading mt-4 text-4xl text-positive" aria-live="polite">
              {t.gain(pct(result.efficiency * 100, 1, lang))}
            </div>
            <div className="mt-1 text-sm text-soft">
              {t.gainSub(num(result.hoursSavedPerDay, 1, lang), num(result.fteSaved, 2, lang), num(shiftHours, 0, lang))}
            </div>
          </div>
        </div>
        <p className="px-4 pb-4 text-xs italic leading-relaxed text-soft sm:px-5">{t.calcNote}</p>
      </Card>
      <p className="text-xs text-soft">{t.footer}</p>
    </div>
  );
}
