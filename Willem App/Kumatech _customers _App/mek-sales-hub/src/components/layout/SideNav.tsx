'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Building,
  CalendarDays,
  Calculator,
  ChevronDown,
  Clapperboard,
  ClipboardList,
  DatabaseBackup,
  FileText,
  Gauge,
  LayoutDashboard,
  Monitor,
  Package,
  PiggyBank,
  Presentation,
  Radar,
  Receipt,
  Settings,
  SlidersHorizontal,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '@/components/ui';
import { useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { MOVERS_SECTIONS, moversHref, type MoversGroup } from '@/modules/movers/sections';

type NavKey = keyof (typeof common.nl)['nav'];
interface Item {
  href: string;
  key: NavKey;
  icon: LucideIcon;
  exact?: boolean;
  sub?: MoversGroup;
}
interface Group {
  key: 'sales' | 'movers' | 'present' | 'admin';
  collapsible?: boolean;
  items: Item[];
}

const MOVERS_ICONS: Record<string, LucideIcon> = {
  mmStart: Gauge,
  mmBasis: SlidersHorizontal,
  mmKlanten: Building,
  mmOffertes: FileText,
  mmDemos: Presentation,
  mmOrders: ClipboardList,
  mmPlanning: CalendarDays,
  mmMachines: Truck,
  mmService: Wrench,
  mmVoorraad: Package,
  mmFacturen: Receipt,
};

// Main menu, organised by what people do: sell, run the MEK Movers business, present to customers, manage
const GROUPS: Group[] = [
  {
    key: 'sales',
    items: [
      { href: '/overzicht', key: 'overzicht', icon: LayoutDashboard },
      { href: '/leads', key: 'leads', icon: Users },
      { href: '/radar', key: 'radar', icon: Radar },
      { href: '/roi', key: 'roi', icon: Calculator },
    ],
  },
  {
    key: 'movers',
    collapsible: true,
    items: MOVERS_SECTIONS.filter((s) => s.frame === 'dashboard').map((s) => ({
      href: moversHref(s),
      key: s.navKey as NavKey,
      icon: MOVERS_ICONS[s.navKey] ?? Gauge,
      exact: true,
      sub: s.group,
    })),
  },
  {
    key: 'present',
    items: [
      { href: '/demo', key: 'demo', icon: Monitor },
      { href: '/mek-movers/besparingscalculator', key: 'calculator', icon: PiggyBank, exact: true },
      { href: '/mek-movers/besparingsvideo', key: 'video', icon: Clapperboard, exact: true },
    ],
  },
  {
    key: 'admin',
    items: [
      { href: '/mek-movers/backup', key: 'backup', icon: DatabaseBackup, exact: true },
      { href: '/instellingen', key: 'instellingen', icon: Settings },
    ],
  },
];

const STORAGE_KEY = 'mek-nav-collapsed';
const isActive = (pathname: string, item: Item) => pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));

export function SideNav({ pathname, queueCount }: { pathname: string; queueCount: number }) {
  const t = useMessages(common);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
    } catch {
      // private window or blocked storage: everything open
    }
  }, []);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  return (
    <nav className="flex flex-col gap-4">
      {GROUPS.map((group) => {
        const label = t.navGroups[group.key];
        const hasActive = group.items.some((item) => isActive(pathname, item));
        // A group with the current page is always open
        const open = !group.collapsible || hasActive || !collapsed[group.key];
        const listId = `nav-${group.key}`;
        let sub: MoversGroup | undefined;
        return (
          <div key={group.key}>
            {group.collapsible ? (
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={open}
                aria-controls={listId}
                aria-label={t.navGroups.toggle(label)}
                className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-soft hover:text-ink"
              >
                <span>{label}</span>
                <ChevronDown size={14} aria-hidden className={cx('transition-transform', !open && '-rotate-90')} />
              </button>
            ) : (
              <div className="mb-1 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-soft">{label}</div>
            )}
            {open && (
              <ul id={listId} className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  const header = item.sub && item.sub !== sub ? item.sub : null;
                  sub = item.sub ?? sub;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      {header && <div className="mt-2 mb-0.5 pl-10 text-[10.5px] font-semibold text-soft/80">{t.navGroups[header]}</div>}
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                          active ? 'bg-accent text-accent-ink' : 'text-soft hover:bg-card-2 hover:text-ink',
                        )}
                      >
                        <Icon size={17} aria-hidden />
                        <span className="flex-1">{t.nav[item.key]}</span>
                        {item.href === '/radar' && queueCount > 0 && (
                          <span className={cx('rounded-full px-2 text-xs font-bold', active ? 'bg-accent-ink/20' : 'bg-accent text-accent-ink')}>
                            {queueCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
