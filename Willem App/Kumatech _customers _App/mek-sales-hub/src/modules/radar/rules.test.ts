import { describe, expect, it } from 'vitest';
import { safeUrl, domainOf, nameKey, normaliseName, extractPostcode } from '@/lib/text';
import { csvCell, toCsv } from '@/lib/csv';
import { classifySegment, compareProspects, matchesExclusion, normalisePlace, prefilter, ruleScore, ruleTier } from './prefilter';
import { distanceFactor, extractPeople, rulesContacts, rulesQualifier, totalScore, type Evidence } from './rules';
import { filtersSchema, nextRunAt } from './filters';
import { envelopeSchema, parseItems } from './schema';
import { DEFAULT_SETTINGS } from '@/modules/settings/types';
import { legacyToRow, mapStatus } from '@/modules/leads/mapping';

describe('URL validation (A.8 stored XSS)', () => {
  it('only allows http(s)', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>')).toBe('');
    expect(safeUrl('www.chain-logistics.nl')).toBe('https://www.chain-logistics.nl/');
    expect(safeUrl('http://kanterstransport.nl/')).toBe('http://kanterstransport.nl/');
  });
  it('extracts the company domain and ignores platforms', () => {
    expect(domainOf('https://www.chain-logistics.nl/over-ons')).toBe('chain-logistics.nl');
    expect(domainOf('https://www.facebook.com/somecompany')).toBeNull();
  });
});

describe('dedup keys', () => {
  it('normalises legal forms and accents', () => {
    expect(normaliseName('Chain Logistics B.V.')).toBe('chain logistics');
    expect(normaliseName('Chain Logistics BV (Uden)')).toBe('chain logistics');
    expect(nameKey('Chain Logistics B.V.', '5405 BW')).toBe(nameKey('chain logistics', '5405BW'));
  });
  it('extracts Dutch postcodes', () => {
    expect(extractPostcode('Jagersveld 6a, 5405 BW Uden')).toBe('5405 BW');
    expect(extractPostcode('5405bw Uden')).toBe('5405 BW');
  });
});

describe('rule score (A.2) and sort fix (A.8)', () => {
  it('classifies segments by name first, then categories', () => {
    expect(classifySegment('Peelland Crossdock').segment).toBe('Crossdock / hub');
    expect(classifySegment('Jansen B.V.', ['Opslagruimte']).segment).toBe('Warehouse / opslag');
    expect(classifySegment('Bakkerij Jansen').segment).toBe('Overig');
  });
  it('scores segment points + reviews', () => {
    expect(ruleScore(2, 150)).toBe(4);
    expect(ruleTier(ruleScore(2, 150))).toBe('A');
    expect(ruleTier(ruleScore(1, 25))).toBe('B');
    expect(ruleTier(ruleScore(0, 5))).toBe('C');
  });
  it('a B with 5000 reviews never ranks above an A', () => {
    const list = [
      { kans: 'B', fit_score: 60, reviews: 5000 },
      { kans: 'A', fit_score: 80, reviews: 3 },
    ].sort(compareProspects);
    expect(list[0].kans).toBe('A');
  });
  it('excludes self-storage and removals', () => {
    expect(matchesExclusion({ name: 'City Box Self Storage', categories: [] }, [])).toBeTruthy();
    expect(matchesExclusion({ name: 'Verhuisbedrijf Jansen', categories: [] }, ['verhuis'])).toBe('verhuis');
    expect(matchesExclusion({ name: 'Peelland Crossdock', categories: ['Logistiekdienst'] }, ['verhuis'])).toBeNull();
  });
  it('prefilter drops closed places and places outside the radius', () => {
    const filters = filtersSchema.parse({});
    const origin = { lat: 51.48, lng: 5.66 };
    const near = normalisePlace({ name: 'Peelland Crossdock', website: 'https://p.example', location: { lat: 51.49, lng: 5.67 } }, origin);
    const far = normalisePlace({ name: 'Rijnmond Logistiek', website: 'https://r.example', location: { lat: 51.9, lng: 4.4 } }, origin);
    const closed = normalisePlace({ name: 'Oud Warehouse', website: 'https://o.example', closed: true, location: { lat: 51.49, lng: 5.67 } }, origin);
    expect(prefilter(near, filters, 20)).toBeNull();
    expect(prefilter(far, filters, 20)).toBe('outside-area');
    expect(prefilter(closed, filters, 20)).toBe('closed');
  });
});

const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  name: 'Peelland Crossdock B.V.',
  segment: 'Crossdock / hub',
  categories: ['Logistiekdienst'],
  description: '',
  address: 'Industrieweg 1, 5705 AB Helmond',
  city: 'Helmond',
  province: 'Noord-Brabant',
  phone: '+31 492 000000',
  website: 'https://www.peelland.example/',
  reviews: 150,
  rating: 4.4,
  distanceHomeKm: 8,
  familie: 'onbekend',
  pages: [
    { url: 'https://www.peelland.example/', title: 'Home', text: 'Crossdocking en overslag voor retail, 24 dockdeuren. Sorteren per winkel en groupage. Familiebedrijf sinds 1962.' },
    { url: 'https://www.peelland.example/over-ons', title: 'Over ons', text: 'Ons team: Jan de Vries (Warehouse manager, j.devries@peelland.example), Sanne Peters (Operations manager).' },
  ],
  search: [{ query: '"Peelland Crossdock" vacature', title: 'Vacature orderpicker bij Peelland Crossdock', url: 'https://jobs.example/1', description: 'Peelland Crossdock zoekt orderpickers' }],
  emails: ['info@peelland.example', 'logistiek@peelland.example', 'j.devries@peelland.example'],
  phones: [],
  linkedIns: [],
  people: [],
  kvk: null,
  ...over,
});

describe('qualifier rules mode', () => {
  it('gives a strong crossdock an A with at least 3 reasons and a vacancy signal', () => {
    const v = rulesQualifier(evidence());
    const score = totalScore(v.criteria, distanceFactor(8, 150), DEFAULT_SETTINGS.weights);
    expect(score).toBeGreaterThanOrEqual(75);
    expect(v.reasons.length).toBeGreaterThanOrEqual(3);
    expect(v.signals.some((s) => s.type === 'vacature')).toBe(true);
    expect(v.familie).toBe('ja');
  });
  it('scores a company without evidence low', () => {
    const v = rulesQualifier(evidence({ segment: 'Overig', categories: ['Bakkerij'], pages: [], search: [], reviews: 2, name: 'Bakkerij Jansen' }));
    expect(totalScore(v.criteria, distanceFactor(8, 150), DEFAULT_SETTINGS.weights)).toBeLessThan(50);
    expect(v.is_logistics).toBe(false);
  });
});

describe('contacts', () => {
  it('extracts named people with role and e-mail from website text', () => {
    const people = extractPeople(evidence().pages, evidence().emails);
    expect(people[0]).toMatchObject({ name: 'Jan de Vries', role: 'Warehouse manager', email: 'j.devries@peelland.example' });
  });
  it('picks the warehouse manager as primary and only a generic mailbox as general', () => {
    const c = rulesContacts(evidence(), 'peelland.example');
    expect(c.primary?.name).toBe('Jan de Vries');
    expect(c.general_email).toBe('info@peelland.example');
  });
});

describe('CSV (formula injection, A.8)', () => {
  it('neutralises formulas and quotes separators', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+31 492')).toBe("'+31 492");
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(toCsv(['A'], [['1']]).startsWith('﻿')).toBe(true);
  });
});

describe('n8n contract (B.10)', () => {
  it('accepts the documented places batch and rejects broken items one by one', () => {
    const env = envelopeSchema.parse({
      runId: '8c1d0000-0000-4000-8000-000000000000',
      batchId: 'maps-3',
      kind: 'places',
      items: [
        { placeId: 'ChIJ…', name: 'Chain Logistics BV', address: 'Jagersveld 6a, 5405 BW Uden', phone: '+31 413 …', website: 'https://…', categories: ['Logistiekdienst'], reviews: 87, rating: 4.3, location: { lat: 51.66, lng: 5.63 }, closed: false },
        { name: '' },
      ],
      cost: { apifyUsd: 0.12 },
    });
    const parsed = parseItems('places', env.items);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.rejected).toBe(1);
  });
  it('requires a known kind and a uuid run id', () => {
    expect(envelopeSchema.safeParse({ runId: 'x', batchId: 'b', kind: 'places' }).success).toBe(false);
    expect(envelopeSchema.safeParse({ runId: '8c1d0000-0000-4000-8000-000000000000', batchId: 'b', kind: 'other' }).success).toBe(false);
  });
});

describe('schedule', () => {
  it('daily at 02:00 Amsterdam time', () => {
    const next = nextRunAt({ mode: 'daily', hour: 2, weekday: 1, everyHours: 6, windowStart: null, windowEnd: null }, new Date('2026-10-02T12:00:00Z'))!;
    expect(next.toISOString()).toBe('2026-10-03T00:00:00.000Z'); // 02:00 CEST
  });
});

describe('lead import mapping (A.1)', () => {
  it('maps Dutch status text and splits plaats', () => {
    expect(mapStatus('Geen interesse')).toEqual({ status: 'verloren', reden: 'Geen interesse' });
    const row = legacyToRow({ bedrijf: 'Chain Logistics BV', plaats: '5405 BW Uden', status: 'Offerte uitgebracht', web: 'javascript:alert(1)' })!;
    expect(row).toMatchObject({ postcode: '5405 BW', plaats: 'Uden', status: 'offerte', web: '' });
  });
});
