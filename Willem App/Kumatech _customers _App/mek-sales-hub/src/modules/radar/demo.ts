import 'server-only';
import type { PlanEntry } from './plan';
import type { PlaceItem } from './prefilter';

// Demo mode (no n8n configured): sample companies in the planned area so the whole flow can be tested.
// Every record is clearly marked: place id "demo-…" and the domain ends in ".example".

const PREFIX = ['Brabant', 'Peel', 'Kempen', 'Maas', 'Dommel', 'Zuid', 'Delta', 'Polder', 'Rijn', 'Noord'];
const KINDS: { name: string; cats: string[]; text: string }[] = [
  { name: 'Crossdock Center', cats: ['Logistiekdienst'], text: 'Wij verzorgen crossdocking en overslag voor retail. 24 dockdeuren, sorteren per winkel en groupage naar meerdere klanten per rit.' },
  { name: 'Distributie', cats: ['Distributiedienst', 'Magazijn'], text: 'Distributiecentrum van 18.000 m2 met 40.000 palletplaatsen. Wij beleveren supermarkten en bouwmarkten in de Benelux.' },
  { name: 'Warehousing', cats: ['Opslagruimte', 'Magazijn'], text: 'Opslag en distributie, value added logistics en fulfilment voor e-commerce. Familiebedrijf sinds 1978, nu in de derde generatie.' },
  { name: 'Logistics', cats: ['Logistiekdienst'], text: 'Logistiek dienstverlener met eigen wagenpark van 35 vrachtwagens en een warehouse aan de A67.' },
  { name: 'Transport', cats: ['Transportbedrijf'], text: 'Internationaal wegtransport, vooral FTL naar Duitsland en Polen.' },
  { name: 'Koelhuis', cats: ['Koelhuis'], text: 'Gekoelde en diepvries opslag, crossdock voor versproducten met nachtelijke distributie naar winkels.' },
  { name: 'Self Storage', cats: ['Self-storagefaciliteit'], text: 'Opslagbox huren voor particulieren.' },
];

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function demoPlaces(plan: PlanEntry[], max: number): PlaceItem[] {
  const out: PlaceItem[] = [];
  const areas = [...new Map(plan.map((e) => [`${e.area.lat},${e.area.lng}`, e.area])).values()];
  for (const area of areas) {
    const rand = seeded(`${area.postcode}-${area.lat}`);
    const n = Math.min(14, Math.max(6, Math.round(max / areas.length)));
    for (let i = 0; i < n && out.length < max; i++) {
      const kind = KINDS[Math.floor(rand() * KINDS.length)];
      const name = `${PREFIX[Math.floor(rand() * PREFIX.length)]} ${kind.name} B.V.`;
      const slug = name.toLowerCase().replace(/b\.v\./, '').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
      const angle = rand() * Math.PI * 2;
      const dist = rand() * area.radiusKm * 0.95;
      const lat = area.lat + (dist / 111) * Math.cos(angle);
      const lng = area.lng + (dist / (111 * Math.cos((area.lat * Math.PI) / 180))) * Math.sin(angle);
      out.push({
        placeId: `demo-${slug}-${area.postcode}`,
        name,
        address: `Industrieweg ${1 + Math.floor(rand() * 120)}, ${area.postcode} ${area.label}`,
        postcode: `${area.postcode}`,
        city: area.label,
        phone: `+31 ${400 + Math.floor(rand() * 99)} ${100000 + Math.floor(rand() * 899999)}`,
        website: `https://${slug}.example`,
        categories: kind.cats,
        reviews: Math.floor(rand() ** 2 * 260),
        rating: Math.round((3.6 + rand() * 1.3) * 10) / 10,
        location: { lat, lng },
        closed: rand() < 0.04,
        description: kind.text,
        searchTerm: plan[0]?.term ?? 'logistiek',
        emails: [`info@${slug}.example`, ...(rand() < 0.5 ? [`logistiek@${slug}.example`] : [])],
      });
    }
  }
  return out;
}
