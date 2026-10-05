'use client';

import { memo, type CSSProperties } from 'react';
import type { DemoMessages } from '@/i18n/messages/demo';
import { SLOTS, pathD, routeKeys, type LaneState, type ZoneKey } from './sim';

// Pallet colours are wood regardless of theme; everything else follows the theme tokens.
const SVG_STYLE = {
  '--wood': '#c89b5e',
  '--wood-dark': '#8f6a3a',
  background: 'var(--bg)',
} as CSSProperties;

function Pallet({ x, y, s = 16, opacity, hidden }: { x: number; y: number; s?: number; opacity?: number; hidden?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`} opacity={opacity} visibility={hidden ? 'hidden' : 'visible'}>
      <rect width={s} height={s} rx={1.5} fill="var(--wood)" />
      <line x1={0} y1={s / 2} x2={s} y2={s / 2} stroke="var(--wood-dark)" strokeWidth={1} />
      <line x1={s / 2} y1={0} x2={s / 2} y2={s} stroke="var(--wood-dark)" strokeWidth={1} />
    </g>
  );
}

const ZONE_RECTS: Record<Exclude<ZoneKey, 'route'>, { x: number; y: number; width: number; height: number }[]> = {
  inbound: [{ x: 4, y: 8, width: 132, height: 110 }],
  outA: [{ x: 664, y: 40, width: 132, height: 102 }],
  outB: [{ x: 664, y: 144, width: 132, height: 102 }],
  staging: [
    { x: 170, y: 92, width: 200, height: 140 },
    { x: 425, y: 104, width: 180, height: 76 },
  ],
};

const TEXT = { fontSize: 10, fill: 'var(--soft)' } as const;
const LINE = { stroke: 'var(--soft)', strokeOpacity: 0.4 } as const;

// Static floor plan: walls, doors, trailers, buffer lanes, dashed routes.
const PlanStatic = memo(function PlanStatic({ perRide, t }: { perRide: 1 | 2; t: DemoMessages }) {
  return (
    <>
      <line x1={140} y1={0} x2={140} y2={250} {...LINE} strokeWidth={2} />
      <line x1={660} y1={0} x2={660} y2={250} {...LINE} strokeWidth={2} />
      <rect x={137} y={40} width={6} height={44} fill="var(--accent)" />
      <rect x={657} y={70} width={6} height={44} fill="var(--positive)" />
      <rect x={657} y={170} width={6} height={44} fill="var(--positive)" />
      {[
        [14, 30],
        [666, 60],
        [666, 160],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={120} height={64} rx={4} fill="none" stroke="var(--soft)" strokeWidth={1.5} />
      ))}
      <text x={14} y={22} {...TEXT}>{t.inboundTrailer}</text>
      <text x={666} y={53} {...TEXT}>{t.spot('A')}</text>
      <text x={666} y={153} {...TEXT}>{t.spot('B')}</text>
      {[0, 1, 2, 3].map((i) => (
        <rect key={`b${i}`} x={178 + i * 48} y={102} width={40} height={120} fill="none" {...LINE} strokeDasharray="3 3" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={`s${i}`} x={433 + i * 44} y={112} width={36} height={60} fill="none" {...LINE} strokeDasharray="3 3" />
      ))}
      {[
        [190, 110],
        [190, 130],
        [238, 110],
        [334, 110],
        [334, 130],
        [443, 120],
        [487, 120],
        [575, 120],
      ].map(([x, y]) => (
        <Pallet key={`p${x}-${y}`} x={x} y={y} opacity={0.45} />
      ))}
      <text x={172} y={246} {...TEXT}>{t.buffer}</text>
      {routeKeys(perRide).map((k) => (
        <path key={k} d={pathD(k)} fill="none" {...LINE} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 5" />
      ))}
    </>
  );
});

function Truck({ perRide, x, y, ang, carried }: { perRide: 1 | 2; x: number; y: number; ang: number; carried: number }) {
  const forkLen = perRide === 2 ? 40 : 20;
  return (
    <g transform={`translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${ang.toFixed(2)})`}>
      <rect x={-22} y={-10} width={20} height={20} rx={4} fill={perRide === 2 ? 'var(--accent)' : 'var(--soft)'} />
      <circle cx={-14} cy={0} r={4} fill="var(--bg)" />
      <rect x={-3} y={-11} width={4} height={22} rx={1} fill="var(--ink)" />
      <rect x={1} y={-8} width={forkLen} height={3} fill="var(--soft)" />
      <rect x={1} y={5} width={forkLen} height={3} fill="var(--soft)" />
      {Array.from({ length: perRide }, (_, i) => (
        <Pallet key={i} x={3 + i * 19} y={-8} hidden={i >= carried} />
      ))}
    </g>
  );
}

export function LanePlan({
  perRide,
  state,
  ang,
  zones,
  label,
  t,
}: {
  perRide: 1 | 2;
  state: LaneState;
  ang: number;
  zones: readonly ZoneKey[];
  label: string;
  t: DemoMessages;
}) {
  const inMod = state.picked % SLOTS;
  const inLeft = SLOTS - (inMod === 0 && state.picked > 0 ? SLOTS : inMod);
  const fillA = state.A % SLOTS;
  const fillB = state.B % SLOTS;
  const slots = Array.from({ length: SLOTS }, (_, i) => ({ i, c: Math.floor(i / 2), r: i % 2 }));
  return (
    <div className="overflow-x-auto rounded-lg">
      <svg viewBox="0 0 800 250" role="img" aria-label={label} className="block h-auto w-full min-w-[560px] rounded-lg" style={SVG_STYLE}>
        {(Object.keys(ZONE_RECTS) as (keyof typeof ZONE_RECTS)[]).flatMap((k) =>
          ZONE_RECTS[k].map((r, j) => (
            <rect
              key={`${k}${j}`}
              {...r}
              rx={8}
              fill={zones.includes(k) ? 'var(--accent)' : 'transparent'}
              fillOpacity={0.1}
              stroke={zones.includes(k) ? 'var(--accent)' : 'transparent'}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              style={{ transition: 'fill .25s, stroke .25s' }}
            />
          )),
        )}
        {routeKeys(perRide).map((k) => (
          <path
            key={`hl-${k}`}
            d={pathD(k)}
            fill="none"
            stroke={zones.includes('route') ? 'var(--accent)' : 'transparent'}
            strokeOpacity={0.18}
            strokeWidth={22}
            strokeLinejoin="round"
          />
        ))}
        <PlanStatic perRide={perRide} t={t} />
        {slots.map(({ i, c, r }) => (
          <Pallet key={`in${i}`} x={116 - c * 19} y={36 + r * 29} hidden={i < SLOTS - inLeft} />
        ))}
        {slots.map(({ i, c, r }) => (
          <Pallet key={`a${i}`} x={670 + (5 - c) * 19} y={66 + r * 29} hidden={i >= fillA} />
        ))}
        {slots.map(({ i, c, r }) => (
          <Pallet key={`b${i}`} x={670 + (5 - c) * 19} y={166 + r * 29} hidden={i >= fillB} />
        ))}
        <text x={14} y={110} {...TEXT}>{t.trailersUnloaded(Math.floor(state.picked / SLOTS))}</text>
        <text x={666} y={137} {...TEXT}>{t.trailersLeft(Math.floor(state.A / SLOTS))}</text>
        <text x={666} y={237} {...TEXT}>{t.trailersLeft(Math.floor(state.B / SLOTS))}</text>
        <Truck perRide={perRide} x={state.pos[0]} y={state.pos[1]} ang={ang} carried={state.carried} />
      </svg>
    </div>
  );
}
