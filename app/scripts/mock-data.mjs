// Shared fake data for scripts/mock-apify.mjs and scripts/mock-n8n.mjs.
// Shapes follow the real Apify actors' output; every company is fictional and uses a ".example" domain.

const NAMES = [
  ['Peelland Crossdock', ['Logistiekdienst', 'Distributiedienst'], 'Wij verzorgen crossdocking en overslag voor retail, 24 dockdeuren. Sorteren per winkel en groupage naar meerdere klanten per rit.'],
  ['Kempen Distributie Centrum', ['Distributiedienst', 'Magazijn'], 'Distributiecentrum van 22.000 m2 met 35.000 palletplaatsen. Wij beleveren supermarkten in de Benelux.'],
  ['De Vries Warehousing', ['Opslagruimte', 'Magazijn'], 'Familiebedrijf sinds 1974, nu in de derde generatie. Opslag en distributie, value added logistics en e-commerce fulfilment.'],
  ['Maasland Logistics', ['Logistiekdienst'], 'Logistiek dienstverlener met eigen wagenpark van 40 vrachtwagens en een warehouse aan de A67.'],
  ['Van Asten Transport', ['Transportbedrijf'], 'Internationaal wegtransport, vooral FTL naar Duitsland en Polen.'],
  ['Brabant Koel & Vries', ['Koelhuis'], 'Gekoelde en diepvries opslag, crossdock voor versproducten met nachtelijke distributie naar winkels.'],
  ['Dommel Pakket Hub', ['Pakketbezorgdienst', 'Logistiekdienst'], 'Pakketsorteercentrum met 3 shifts, sorteren naar 60 bezorgroutes.'],
  ['Zuid Fulfilment', ['Fulfilmentcentrum'], 'E-commerce fulfilment voor webshops, 8.000 orders per dag, retouren en kitting.'],
  ['Helmond Groothandel Magazijn', ['Groothandel'], 'Technische groothandel met eigen magazijn en dagelijkse distributie naar installateurs.'],
  ['City Box Self Storage', ['Self-storagefaciliteit'], 'Opslagbox huren voor particulieren.'],
  ['Verhuisbedrijf Jansen', ['Verhuisbedrijf'], 'Particuliere verhuizingen en inboedelopslag.'],
  ['Rijnmond Expeditie', ['Expediteur'], 'Zee- en luchtvracht expeditie, douane-afhandeling.'],
];

export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
}

// Resolve mode (1 place per search string): the company a LinkedIn / news name refers to
export function resolveItems({ lat, lng }, terms = []) {
  const known = [...WEB_ONLY.map(([n]) => n), ...NAMES.map(([n]) => n)];
  return terms.map((term, i) => {
    const name = known.find((n) => term.toLowerCase().startsWith(n.toLowerCase())) ?? term.split(' ').slice(0, 2).join(' ');
    const pc = 5720 + i;
    return {
      title: `${name} B.V.`,
      placeId: `mock-${slug(name)}-${Math.round(lat * 100)}`,
      categoryName: 'Logistiekdienst',
      categories: ['Logistiekdienst', 'Magazijn'],
      address: `Havenweg ${i + 1}, ${pc} AB Helmond, Nederland`,
      postalCode: `${pc} AB`,
      city: 'Helmond',
      phone: '+31 492 777 000',
      website: `https://www.${slug(name)}.example/`,
      url: `https://www.google.com/maps/place/?q=place_id:mock-${slug(name)}`,
      totalScore: 4.2,
      reviewsCount: 120,
      location: { lat: lat + 0.01 * (i % 5), lng: lng + 0.01 * (i % 3) },
      permanentlyClosed: false,
      description: 'Palletopslag, crossdock en distributie naar meerdere klanten per rit.',
      searchString: term,
    };
  });
}

// compass/crawler-google-places output items for one area
export function mapsItems({ lat, lng, radiusKm = 10 }, terms = []) {
  const rand = rng(`${lat},${lng}`);
  return NAMES.map(([base, cats, text], i) => {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * radiusKm * 0.9;
    const name = `${base} B.V.`;
    const pc = 5700 + Math.floor(rand() * 90);
    return {
      title: name,
      placeId: `mock-${slug(base)}-${Math.round(lat * 100)}`,
      categoryName: cats[0],
      categories: cats,
      address: `Industrieweg ${10 + i}, ${pc} ${['AB', 'KL', 'RT', 'ZX'][i % 4]} Helmond, Nederland`,
      street: `Industrieweg ${10 + i}`,
      postalCode: `${pc} ${['AB', 'KL', 'RT', 'ZX'][i % 4]}`,
      city: 'Helmond',
      countryCode: 'NL',
      phone: `+31 492 ${String(100000 + i * 7919).slice(0, 6)}`,
      website: `https://www.${slug(base)}.example/`,
      url: `https://www.google.com/maps/place/?q=place_id:mock-${slug(base)}`,
      totalScore: Math.round((3.8 + rand()) * 10) / 10,
      reviewsCount: [180, 95, 64, 41, 23, 130, 210, 77, 18, 300, 55, 12][i],
      location: { lat: lat + (dist / 111) * Math.cos(angle), lng: lng + (dist / 70) * Math.sin(angle) },
      permanentlyClosed: i === 11,
      temporarilyClosed: false,
      description: text,
      searchString: terms[i % Math.max(1, terms.length)] ?? 'logistiek',
    };
  });
}

// apify/website-content-crawler output for some sites
export function pageItems(startUrls) {
  return startUrls.flatMap(({ url }) => {
    const base = url.replace(/\/$/, '');
    const known = NAMES.find(([n]) => base.includes(slug(n)));
    const text = known?.[2] ?? 'Logistiek bedrijf.';
    return [
      { url: `${base}/`, metadata: { title: `${known?.[0] ?? 'Home'} – Home` }, text: `${text} Bel ons voor een offerte.` },
      { url: `${base}/over-ons`, metadata: { title: 'Over ons' }, text: `${text} Ons team: Jan de Vries (Warehouse manager, j.devries@${new URL(url).hostname.replace(/^www\./, '')}), Sanne Peters (Operations manager).` },
      { url: `${base}/vacatures`, metadata: { title: 'Vacatures' }, text: 'Vacatures: orderpicker (40 uur), heftruckchauffeur, teamleider magazijn.' },
    ];
  });
}

// vdrmota/contact-info-scraper output
export function contactItems(startUrls) {
  return startUrls.map(({ url }) => {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return {
      originalStartUrl: url,
      domain,
      emails: [`info@${domain}`, `logistiek@${domain}`, `j.devries@${domain}`],
      phones: ['+31 492 555 010'],
      phonesUncertain: [],
      linkedIns: [`https://www.linkedin.com/company/${domain.split('.')[0]}`],
    };
  });
}

// Fictional companies that only show up on LinkedIn / in the news (web discovery test)
const WEB_ONLY = [
  ['Asten Pallet Services', 'Palletopslag en crossdock voor agrofood · 51-200 werknemers. Hoofdkantoor: Asten'],
  ['Peel Retail Logistics', 'Retaildistributie met 30 docks · 201-500 werknemers. Hoofdkantoor: Deurne'],
  ['Kanaal Cold Chain', 'Koel- en vrieslogistiek · 11-50 werknemers. Hoofdkantoor: Helmond'],
];

// apify/google-search-scraper output
export function searchItems(queries) {
  return String(queries)
    .split('\n')
    .filter(Boolean)
    .map((term) => {
      // Web discovery: LinkedIn company pages (plus one personal profile that must be ignored)
      if (term.includes('site:linkedin.com/company')) {
        return {
          searchQuery: { term },
          organicResults: [
            ...WEB_ONLY.map(([n, text]) => ({ title: `${n} | LinkedIn`, url: `https://nl.linkedin.com/company/${slug(n)}`, description: `${n} | 300 volgers op LinkedIn. ${text}` })),
            { title: `${NAMES[0][0]} | LinkedIn`, url: `https://nl.linkedin.com/company/${slug(NAMES[0][0])}`, description: `${NAMES[0][2]} · 51-200 werknemers` },
            { title: 'Jan de Vries - Warehouse manager | LinkedIn', url: 'https://nl.linkedin.com/in/jan-de-vries', description: 'Persoonlijk profiel (wordt genegeerd)' },
          ],
        };
      }
      // Web discovery: news / PR queries start with "(" — one usable headline, one without a company name
      if (term.startsWith('(')) {
        return {
          searchQuery: { term },
          organicResults: [
            { title: `${WEB_ONLY[1][0]} opent nieuw distributiecentrum in Deurne | Logistiek.nl`, url: `https://www.logistiek.example/nieuws/${slug(WEB_ONLY[1][0])}`, description: 'Het nieuwe DC telt 30 docks en 25.000 m2.' },
            { title: 'Nieuw distributiecentrum opent in Helmond', url: 'https://www.ed.example/helmond-dc', description: 'Algemeen nieuwsbericht.' },
          ],
        };
      }
      const name = (term.match(/"([^"]+)"/) || [])[1] ?? 'Bedrijf';
      const vacancy = /vacature/.test(term);
      return {
        searchQuery: { term },
        organicResults: [
          vacancy
            ? { title: `Vacature orderpicker bij ${name} | Indeed`, url: `https://nl.indeed.example/${slug(name)}`, description: `${name} zoekt orderpickers en heftruckchauffeurs voor het distributiecentrum.` }
            : { title: `${name} opent nieuw distributiecentrum`, url: `https://www.logistiek.example/nieuws/${slug(name)}`, description: `${name} breidt uit met een nieuw DC van 15.000 m2.` },
        ],
      };
    });
}

// Same conversion as the n8n "Map places to batches" node
export function toAppPlace(p) {
  return {
    placeId: p.placeId,
    name: p.title,
    address: p.address,
    postcode: p.postalCode,
    city: p.city,
    phone: p.phone,
    website: p.website,
    mapsUrl: p.url,
    categories: p.categories,
    reviews: p.reviewsCount,
    rating: p.totalScore,
    location: p.location,
    closed: p.permanentlyClosed,
    description: p.description,
    searchTerm: p.searchString,
    emails: [],
  };
}
