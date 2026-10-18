'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { cx, Notice } from '@/components/ui';
import { useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { movers } from '@/i18n/messages/movers';
import { FRAME_SRC, INNER_LEADS_LABEL, LEADS_HREF, moversHref, sectionByInnerLabel, sectionBySlug, type MoversFrame } from '@/modules/movers/sections';

// The MEK Movers apps are the original HTML files, shown in frames that stay loaded while you move between menu
// items. The dashboard's own menu is hidden; the main menu drives it by clicking the matching (hidden) button,
// and clicks inside the dashboard (e.g. a KPI tile that opens a list) update the URL and the main menu.

// Injected into the same-origin frames; the HTML files themselves stay unchanged
const FRAME_CSS: Partial<Record<MoversFrame, string>> = {
  dashboard: `.bd-app{grid-template-columns:minmax(0,1fr)!important}.bd-side{display:none!important}
    .bd-main,.bd-leads{grid-column:1!important;grid-row:1!important}`,
  backup: `.apps,.sub{display:none!important}`,
};

function innerNavButtons(doc: Document) {
  return [...doc.querySelectorAll<HTMLButtonElement>('#bd-nav button.nav-btn')];
}
// Button text without the attention badge
const buttonLabel = (b: Element) => b.firstChild?.textContent?.trim() ?? '';
function currentInnerLabel(doc: Document) {
  const b = doc.querySelector('#bd-nav .nav-btn[aria-current="page"]');
  return b ? buttonLabel(b) : null;
}

export function MoversWorkspace({ canWrite }: { canWrite: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useMessages(movers);
  const tc = useMessages(common);
  const slug = pathname.replace(/^\/mek-movers\/?/, '').split('/')[0] ?? '';
  const section = sectionBySlug(slug);
  const frame: MoversFrame | null = section?.frame ?? null;

  // Frames are created only in the browser, so their load event is never missed during hydration
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [visited, setVisited] = useState<MoversFrame[]>(frame ? [frame] : []);
  const [loaded, setLoaded] = useState<Partial<Record<MoversFrame, boolean>>>({});
  const frames = useRef<Partial<Record<MoversFrame, HTMLIFrameElement | null>>>({});
  const slugRef = useRef(slug);
  const fromInner = useRef<string | null>(null);
  slugRef.current = slug;

  useEffect(() => {
    if (frame && !visited.includes(frame)) setVisited((v) => [...v, frame]);
  }, [frame, visited]);

  const dashDoc = () => {
    try {
      return frames.current.dashboard?.contentDocument ?? null;
    } catch {
      return null;
    }
  };

  // Show a dashboard section: click its button in the hidden dashboard menu (waits until the menu is built)
  const showInner = useCallback((label: string) => {
    let tries = 0;
    const attempt = () => {
      const doc = dashDoc();
      const button = doc && innerNavButtons(doc).find((b) => buttonLabel(b) === label);
      if (!doc || !button) {
        if (tries++ < 150) setTimeout(attempt, 100);
        return;
      }
      if (currentInnerLabel(doc) !== label) button.click();
      setLoaded((l) => ({ ...l, dashboard: true }));
    };
    attempt();
  }, []);

  const onFrameLoad = (key: MoversFrame) => {
    const el = frames.current[key];
    let doc: Document | null = null;
    try {
      doc = el?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (doc && FRAME_CSS[key]) {
      const style = doc.createElement('style');
      style.textContent = FRAME_CSS[key]!;
      doc.head.append(style);
    }
    if (key !== 'dashboard' || !doc) {
      setLoaded((l) => ({ ...l, [key]: true }));
      return;
    }
    // Clicks inside the dashboard → URL and main menu follow
    const nav = doc.getElementById('bd-nav');
    if (nav) {
      new MutationObserver(() => {
        const label = currentInnerLabel(doc!);
        const active = sectionBySlug(slugRef.current);
        if (active?.frame !== 'dashboard') return;
        // One leads list: the dashboard's Leads page opens the Sales Hub Leads page
        if (label === INNER_LEADS_LABEL) {
          router.push(LEADS_HREF);
          return;
        }
        const target = label ? sectionByInnerLabel(label) : undefined;
        if (!target || target.slug === slugRef.current) return;
        fromInner.current = target.slug;
        router.push(moversHref(target));
      }).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current'] });
    }
    const active = sectionBySlug(slugRef.current);
    showInner(active?.frame === 'dashboard' && active.innerLabel ? active.innerLabel : 'Start');
  };

  // Main menu → dashboard section
  useEffect(() => {
    if (section?.frame !== 'dashboard' || !section.innerLabel || !loaded.dashboard) return;
    if (fromInner.current === section.slug) {
      fromInner.current = null;
      return;
    }
    showInner(section.innerLabel);
  }, [section, loaded.dashboard, showInner]);

  if (!section || !frame) return null;

  const groupLabel = frame === 'dashboard' ? t.title : frame === 'backup' ? t.admin : t.present;
  const subLabel = section.group ? tc.navGroups[section.group] : null;
  const label = tc.nav[section.navKey as keyof typeof tc.nav];

  return (
    <div className="-mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-soft">
          <span className="hidden sm:inline">{groupLabel}</span>
          {subLabel && (
            <>
              <ChevronRight size={14} aria-hidden className="hidden sm:block" />
              <span className="hidden sm:inline">{subLabel}</span>
            </>
          )}
          <ChevronRight size={14} aria-hidden className="hidden sm:block" />
          <h1 className="mek-heading truncate text-lg text-ink">
            <span className="mek-skew">{label}</span>
          </h1>
        </nav>
        <a
          href={FRAME_SRC[frame]}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-soft transition hover:text-ink"
        >
          <ExternalLink size={14} aria-hidden />
          {t.openFull}
        </a>
      </div>
      {!canWrite && <Notice tone="warning">{t.viewerNote}</Notice>}
      <div className="relative">
        {!loaded[frame] && (
          <div className="absolute inset-0 z-10 min-h-[560px] grid place-items-center rounded-xl border border-line bg-card text-sm text-soft">{t.loading}</div>
        )}
        {mounted && visited.map((key) => (
          <iframe
            key={key}
            ref={(el) => {
              frames.current[key] = el;
            }}
            src={FRAME_SRC[key]}
            title={key === frame ? label : key}
            onLoad={() => onFrameLoad(key)}
            className={cx('h-[calc(100dvh-9.5rem)] min-h-[560px] w-full rounded-xl border border-line bg-card', key !== frame && 'hidden')}
            allow="fullscreen; clipboard-write"
          />
        ))}
      </div>
    </div>
  );
}
