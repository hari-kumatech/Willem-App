// Sections of the MEK Movers apps, each with its own URL under /mek-movers and its own item in the main menu.
// Dashboard sections are shown by clicking the matching button in the dashboard's own (hidden) menu, so the
// original HTML stays unchanged; `innerLabel` is the button text in dashboard.html (its NAV list).
// The dashboard's own Leads page is not used: there is one leads list, the Sales Hub Leads page (INC-008).
export const INNER_LEADS_LABEL = 'Leads';
export const LEADS_HREF = '/leads';

export type MoversFrame = 'dashboard' | 'calculator' | 'video' | 'backup';
export type MoversGroup = 'verkoop' | 'uitvoering' | 'service' | 'financieel';

export interface MoversSection {
  slug: string; // '' = /mek-movers
  frame: MoversFrame;
  navKey: string; // key in common.nav
  innerLabel?: string;
  group?: MoversGroup;
}

export const FRAME_SRC: Record<MoversFrame, string> = {
  dashboard: '/mek-movers/dashboard.html',
  calculator: '/mek-movers/besparingscalculator.html',
  video: '/mek-movers/besparingsvideo.html',
  backup: '/mek-movers/index.html',
};

export const MOVERS_SECTIONS: readonly MoversSection[] = [
  { slug: '', frame: 'dashboard', navKey: 'mmStart', innerLabel: 'Start' },
  { slug: 'basis', frame: 'dashboard', navKey: 'mmBasis', innerLabel: 'Basisgegevens' },
  { slug: 'klanten', frame: 'dashboard', navKey: 'mmKlanten', innerLabel: 'Klanten', group: 'verkoop' },
  { slug: 'offertes', frame: 'dashboard', navKey: 'mmOffertes', innerLabel: 'Offertes', group: 'verkoop' },
  { slug: 'demos', frame: 'dashboard', navKey: 'mmDemos', innerLabel: "Demo's", group: 'verkoop' },
  { slug: 'orders', frame: 'dashboard', navKey: 'mmOrders', innerLabel: 'Orders', group: 'uitvoering' },
  { slug: 'planning', frame: 'dashboard', navKey: 'mmPlanning', innerLabel: 'Planning', group: 'uitvoering' },
  { slug: 'machines', frame: 'dashboard', navKey: 'mmMachines', innerLabel: 'Machines', group: 'service' },
  { slug: 'service', frame: 'dashboard', navKey: 'mmService', innerLabel: 'Service', group: 'service' },
  { slug: 'voorraad', frame: 'dashboard', navKey: 'mmVoorraad', innerLabel: 'Voorraad', group: 'service' },
  { slug: 'facturen', frame: 'dashboard', navKey: 'mmFacturen', innerLabel: 'Facturen', group: 'financieel' },
  { slug: 'besparingscalculator', frame: 'calculator', navKey: 'calculator' },
  { slug: 'besparingsvideo', frame: 'video', navKey: 'video' },
  { slug: 'backup', frame: 'backup', navKey: 'backup' },
];

export const sectionBySlug = (slug: string) => MOVERS_SECTIONS.find((s) => s.slug === slug);
export const sectionByInnerLabel = (label: string) => MOVERS_SECTIONS.find((s) => s.innerLabel === label);
export const moversHref = (s: MoversSection) => (s.slug ? `/mek-movers/${s.slug}` : '/mek-movers');
