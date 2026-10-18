'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play, RotateCcw, Video, X } from 'lucide-react';
import { cx } from '@/components/ui';
import { num } from '@/lib/format';
import { useLang, useMessages } from '@/i18n/client';
import { demo } from '@/i18n/messages/demo';
import type { ProductDims } from './three/dims';
import type { Engine, ProductState, RaceState } from './three/engine';

type Mode = 'product' | 'race';

const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The canvas textures (logo, A/B, dock labels) are drawn only after the display font is loaded.
async function loadDisplayFont(): Promise<string> {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-oswald').trim() || 'Oswald';
  try {
    await Promise.race([
      Promise.all(['600 48px', 'italic 700 48px', 'italic 800 48px'].map((s) => document.fonts.load(`${s} ${family}`))),
      new Promise((resolve) => setTimeout(resolve, 4000)), // never block the demo on a slow font
    ]);
  } catch {
    // fall back to Arial in the textures
  }
  return family;
}

const SPEEDS = [1, 2, 4] as const;

const PANEL = 'rounded-xl border border-line bg-card/90 px-3.5 py-3 text-ink backdrop-blur';
const SEG = 'flex gap-0.5 rounded-lg border border-line bg-card p-0.5';
const SEG_BTN = 'rounded-md px-2.5 py-1.5 text-xs font-semibold text-soft aria-pressed:bg-card-2 aria-pressed:text-ink';
const BTN = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50';
const BTN_GHOST = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-card/80 px-3.5 py-2 text-sm font-semibold text-ink';

export function ThreeStage({ mode, product }: { mode: Mode; product: ProductDims }) {
  const t = useMessages(demo);
  const lang = useLang();
  const hostRef = useRef<HTMLDivElement>(null);
  const tagEpt = useRef<HTMLDivElement>(null);
  const tagMek = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rec, setRec] = useState(false);

  const [prod, setProd] = useState<ProductState>({
    lengthMm: product.forkRetractedMm,
    extFraction: 0,
    extending: false,
    pallets: 1,
    autoRotate: false,
  });
  const [race, setRace] = useState<RaceState | null>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Big caption at the top (3.2 s, like the original)
  const [caption, setCaption] = useState('');
  const capTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCaption = useCallback((text: string) => {
    clearTimeout(capTimer.current);
    setCaption(text);
    if (text) capTimer.current = setTimeout(() => setCaption(''), 3200);
  }, []);
  useEffect(() => () => clearTimeout(capTimer.current), []);

  const productKey = JSON.stringify(product);

  // Build the engine on the client only; rebuild when mode, language or product settings change.
  useEffect(() => {
    let cancelled = false;
    let engine: Engine | null = null;
    setStatus('loading');
    setRace(null);
    onCaption('');
    const dims = JSON.parse(productKey) as ProductDims;
    (async () => {
      try {
        const [{ createEngine }, fontFamily] = await Promise.all([import('./three/engine'), loadDisplayFont()]);
        const host = hostRef.current;
        if (cancelled || !host) return;
        const common = { host, product: dims, fontFamily, canvasLabel: t.canvasLabel };
        engine =
          mode === 'product'
            ? createEngine({ ...common, mode, reducedMotion: prefersReducedMotion(), onProduct: setProd })
            : createEngine({
                ...common,
                mode,
                t,
                extendCaption: t.cExtend(num(dims.forkRetractedMm, 0, lang), num(dims.forkExtendedMm, 0, lang), num(dims.extendSeconds, 0, lang)),
                onRace: setRace,
                onCaption,
                tags: { ept: tagEpt.current, mek: tagMek.current },
              });
        engine.race?.setSpeed(speedRef.current);
        engineRef.current = engine;
        setStatus('ready');
      } catch (e) {
        console.error('[demo] 3D view failed', e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [mode, lang, t, productKey, onCaption]);

  // Recording mode: Esc exits
  useEffect(() => {
    if (!rec) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRec(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rec]);

  const sec = (s: number) => `${num(s, 1, lang)} s`;
  const m = (d: number) => `${num(d, 0, lang)} m`;
  const ready = status === 'ready';

  const laneDefs = [
    { name: t.stdName, color: '#93a6bf' },
    { name: product.name, color: '#d6483d' },
  ];

  let resultBlock = null;
  if (race?.showResult) {
    const [E, K] = race.lanes;
    const dPct = E.dist > 0 ? Math.round((1 - K.dist / E.dist) * 100) : 0;
    const tPct = E.time > 0 ? Math.round((1 - K.time / E.time) * 100) : 0;
    resultBlock = (
      <div role="status" className={cx(PANEL, 'absolute left-1/2 top-1/2 z-20 w-[min(460px,calc(100%-28px))] -translate-x-1/2 -translate-y-1/2 text-center')}>
        <h2 className="mek-heading text-2xl">
          <span className="mek-skew">{t.resultTitle}</span>
        </h2>
        <div className="my-3 grid grid-cols-2 gap-3">
          {[E, K].map((L, i) => (
            <div key={i} className="rounded-lg bg-bg/60 p-2.5">
              <span className="text-xs text-soft">{laneDefs[i].name}</span>
              <b className={cx('mek-heading block text-2xl', i === 1 && 'text-[#ff8a80]')}>{t.rides(L.rides)}</b>
              <span className="text-xs text-soft">
                {sec(L.time)}, {m(L.dist)}
              </span>
            </div>
          ))}
        </div>
        <p className="mb-3 text-sm text-soft">{t.resultText(dPct, tPct)}</p>
        <button type="button" className={BTN} onClick={() => engineRef.current?.race?.again()}>
          {t.again}
        </button>
      </div>
    );
  }

  const stageStyle = { background: '#0e2038' } as CSSProperties;

  return (
    <div
      data-theme="dark"
      style={stageStyle}
      className={cx(
        'overflow-hidden text-ink',
        rec ? 'fixed inset-0 z-[100]' : 'relative h-[min(74dvh,780px)] min-h-[440px] rounded-xl border border-line',
      )}
    >
      <div ref={hostRef} className="absolute inset-0" />

      {mode === 'race' && (
        <>
          <div ref={tagEpt} className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/20 bg-[#0e2038]/85 px-2 py-1 text-xs font-bold text-white" style={{ display: 'none' }}>
            {t.stdName}
          </div>
          <div ref={tagMek} className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-[#d6483d] px-2 py-1 text-xs font-bold text-white" style={{ display: 'none' }}>
            {product.name}
          </div>
        </>
      )}

      <div
        aria-live="polite"
        className={cx(
          'mek-heading pointer-events-none absolute left-1/2 top-4 z-[2] max-w-[calc(100%-28px)] -translate-x-1/2 -skew-x-6 truncate rounded-md bg-[#d6483d] px-5 py-2 text-[clamp(1.1rem,2.6vw,2rem)] font-bold text-white transition-opacity duration-300',
          caption ? 'opacity-100' : 'opacity-0',
        )}
      >
        {caption}
      </div>

      {status === 'loading' && <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-soft">{t.loading3d}</div>}
      {status === 'error' && (
        <div role="alert" className="absolute inset-0 z-30 grid place-items-center p-8 text-center text-soft">
          {t.webglError}
        </div>
      )}

      {/* Recording mode toggle */}
      {ready && !rec && (
        <button type="button" className={cx(BTN_GHOST, 'absolute right-3.5 top-3.5 z-10')} title={t.recTitle} onClick={() => setRec(true)}>
          <Video size={16} aria-hidden />
          {t.recMode}
        </button>
      )}
      {rec && (
        <button type="button" className={cx(BTN_GHOST, 'absolute bottom-3 right-3 z-40 opacity-25 hover:opacity-100 focus-visible:opacity-100')} onClick={() => setRec(false)}>
          <X size={16} aria-hidden />
          {t.recExit}
        </button>
      )}

      {/* Product HUD */}
      {mode === 'product' && ready && (
        <>
          <div className={cx(PANEL, 'absolute left-3.5 top-3.5 z-10 min-w-[230px] max-w-[min(320px,calc(100%-28px))]')}>
            <div className="text-xs text-soft">{t.forkLength}</div>
            <div className="mek-heading text-4xl not-italic tabular-nums" aria-live="off">
              {num(prod.lengthMm, 0, lang)}
              <small className="ml-1 text-base font-medium text-soft">mm</small>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-soft/20" role="meter" aria-label={t.forkLength} aria-valuemin={product.forkRetractedMm} aria-valuemax={product.forkExtendedMm} aria-valuenow={prod.lengthMm}>
              <div className="h-full bg-[#d6483d]" style={{ width: `${prod.extFraction * 100}%` }} />
            </div>
            {!rec && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[
                  t.chipPallets(product.palletsPerTrip),
                  t.chipKg(num(product.capacityKg, 0, lang)),
                  t.chipExtend(num(product.extendSeconds, 0, lang)),
                  t.chipWidth(num(product.widthMm, 0, lang)),
                ].map((c) => (
                  <span key={c} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-soft">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          {!rec && (
            <div className="absolute inset-x-3.5 bottom-3.5 z-10 flex flex-wrap items-center gap-2.5">
              <button type="button" className={BTN} onClick={() => engineRef.current?.product?.toggleExtend()}>
                {prod.extending ? t.retract : t.extend}
              </button>
              <span className="text-xs text-soft">{t.loadLabel}</span>
              <div role="group" aria-label={t.loadLabel} className={SEG}>
                {([0, 1, 2] as const).map((n) => (
                  <button key={n} type="button" aria-pressed={prod.pallets === n} className={SEG_BTN} onClick={() => engineRef.current?.product?.setPallets(n)}>
                    {n === 0 ? t.loadEmpty : n === 1 ? t.load1 : t.load2}
                  </button>
                ))}
              </div>
              <button type="button" aria-pressed={prod.autoRotate} className={BTN_GHOST} onClick={() => engineRef.current?.product?.setAutoRotate(!prod.autoRotate)}>
                {t.rotate(prod.autoRotate)}
              </button>
              <span className="text-xs text-soft">{t.orbitHint}</span>
            </div>
          )}
        </>
      )}

      {/* Race HUD */}
      {mode === 'race' && ready && race && (
        <>
          <div className="absolute inset-x-3.5 bottom-3.5 z-10 flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2.5">
              {race.lanes.map((L, i) => (
                <div key={i} className={cx(PANEL, 'min-w-0 sm:min-w-[220px]')}>
                  <div className="mek-heading flex items-center gap-2 text-base not-italic">
                    <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: laneDefs[i].color }} aria-hidden />
                    {laneDefs[i].name}
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-0.5">
                    <dt className="text-[0.7rem] text-soft">{t.hudTrips}</dt>
                    <dt className="text-[0.7rem] text-soft">{t.hudTime}</dt>
                    <dt className="text-[0.7rem] text-soft">{t.hudDist}</dt>
                    <dd className="mek-heading text-lg not-italic tabular-nums sm:text-xl">{L.rides}</dd>
                    <dd className="mek-heading text-lg not-italic tabular-nums sm:text-xl">{sec(L.time)}</dd>
                    <dd className="mek-heading text-lg not-italic tabular-nums sm:text-xl">{m(L.dist)}</dd>
                  </dl>
                  <div className="mt-1.5 min-h-[1.2em] text-xs text-soft">{L.status}</div>
                </div>
              ))}
            </div>
            {!rec && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button type="button" className={BTN} disabled={race.finished} onClick={() => engineRef.current?.race?.togglePlay()}>
                  {race.running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                  {race.running ? t.pause3d : race.lanes[0].time > 0 && !race.finished ? t.resume : t.start}
                </button>
                <button type="button" className={BTN_GHOST} onClick={() => engineRef.current?.race?.reset()}>
                  <RotateCcw size={16} aria-hidden />
                  {t.reset}
                </button>
                <span className="text-xs text-soft">{t.speedLabel}</span>
                <div role="group" aria-label={t.speedLabel} className={SEG}>
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={speed === s}
                      className={SEG_BTN}
                      onClick={() => {
                        setSpeed(s);
                        engineRef.current?.race?.setSpeed(s);
                      }}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <span className="text-xs text-soft">{t.taskNote(num(product.speedEmptyKmh, 0, lang), num(product.speedLoadedKmh, 0, lang))}</span>
              </div>
            )}
          </div>
          {resultBlock}
        </>
      )}
    </div>
  );
}
