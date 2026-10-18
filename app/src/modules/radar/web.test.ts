import { describe, expect, it } from 'vitest';
import { buildWebQueries, extractNewsCompany, parseLinkedInResult, resolveKey, resolveTerm, webCandidates, DEFAULT_NEWS_SITES } from './web';

const area = { label: 'Helmond', postcode: '5705', lat: 51.48, lng: 5.66, radiusKm: 20 };

describe('web discovery queries', () => {
  it('builds LinkedIn queries per term × area and news queries per area', () => {
    const q = buildWebQueries(['crossdock', 'distributiecentrum'], [area], { linkedin: true, news: true, newsSites: DEFAULT_NEWS_SITES });
    expect(q.filter((x) => x.source === 'linkedin').map((x) => x.query)).toEqual([
      'site:linkedin.com/company crossdock "Helmond"',
      'site:linkedin.com/company distributiecentrum "Helmond"',
    ]);
    const news = q.filter((x) => x.source === 'news');
    expect(news).toHaveLength(2);
    expect(news[0].query).toContain('site:logistiek.nl OR site:nieuwsbladtransport.nl');
  });
  it('respects the cap and keeps both sources', () => {
    const areas = Array.from({ length: 10 }, (_, i) => ({ ...area, label: `Plaats ${i}` }));
    const q = buildWebQueries(['a', 'b', 'c'], areas, { linkedin: true, news: true, newsSites: ['logistiek.nl'], maxQueries: 12 });
    expect(q).toHaveLength(12);
    expect(q.some((x) => x.source === 'news')).toBe(true);
    expect(q.some((x) => x.source === 'linkedin')).toBe(true);
  });
  it('can switch sources off', () => {
    expect(buildWebQueries(['a'], [area], { linkedin: false, news: false, newsSites: [] })).toEqual([]);
  });
});

describe('LinkedIn company results (Google index only)', () => {
  it('parses the company name and size', () => {
    const r = parseLinkedInResult({
      title: 'Chain Logistics BV | LinkedIn',
      url: 'https://nl.linkedin.com/company/chain-logistics-bv',
      description: 'Chain Logistics BV | 1.240 volgers op LinkedIn. Logistiek dienstverlener · 51-200 werknemers. Hoofdkantoor: Uden, Noord-Brabant',
    });
    expect(r).toEqual({ name: 'Chain Logistics BV', city: 'Uden', employees: '51-200' });
  });
  it('strips page suffixes and falls back to the slug', () => {
    expect(parseLinkedInResult({ title: 'Van Asten Transport: Overzicht | LinkedIn', url: 'https://www.linkedin.com/company/van-asten' })?.name).toBe('Van Asten Transport');
    expect(parseLinkedInResult({ title: 'LinkedIn', url: 'https://www.linkedin.com/company/peelland-crossdock/' })?.name).toBe('Peelland Crossdock');
  });
  it('ignores personal profiles and other pages', () => {
    expect(parseLinkedInResult({ title: 'Jan de Vries - Warehouse manager | LinkedIn', url: 'https://nl.linkedin.com/in/jandevries' })).toBeNull();
    expect(parseLinkedInResult({ title: 'Something', url: 'https://www.logistiek.nl/x' })).toBeNull();
  });
});

describe('news headline extraction', () => {
  it('takes the company before the verb', () => {
    expect(extractNewsCompany({ title: 'Bakker Logistiek opent nieuw distributiecentrum in Tilburg | Logistiek.nl' })).toEqual({ name: 'Bakker Logistiek', city: 'Tilburg' });
    expect(extractNewsCompany({ title: 'Kuehne+Nagel breidt warehouse uit in Venlo' })?.name).toBe('Kuehne+Nagel');
    expect(extractNewsCompany({ title: 'Logistiek dienstverlener Van Doorn bouwt crossdock bij Eindhoven' })?.name).toBe('Van Doorn');
  });
  it('skips headlines that do not start with a company', () => {
    expect(extractNewsCompany({ title: 'Nieuw distributiecentrum opent in Oss' })).toBeNull();
    expect(extractNewsCompany({ title: 'Gemeente Helmond bouwt nieuw bedrijventerrein' })).toBeNull();
    expect(extractNewsCompany({ title: 'Waarom crossdocking groeit' })).toBeNull();
  });
});

describe('candidates and resolve keys', () => {
  it('dedups by name, applies exclusions and keeps the area', () => {
    const queries = buildWebQueries(['crossdock'], [area], { linkedin: true, news: true, newsSites: ['logistiek.nl'] });
    const li = queries.find((q) => q.source === 'linkedin')!;
    const c = webCandidates(
      [
        { query: li.query, title: 'Peelland Crossdock B.V. | LinkedIn', url: 'https://nl.linkedin.com/company/peelland-crossdock' },
        { query: li.query, title: 'Peelland Crossdock | LinkedIn', url: 'https://nl.linkedin.com/company/peelland-crossdock-2' },
        { query: li.query, title: 'City Box Self Storage | LinkedIn', url: 'https://nl.linkedin.com/company/citybox' },
        { query: li.query, title: 'Verhuisbedrijf Jansen | LinkedIn', url: 'https://nl.linkedin.com/company/jansen' },
      ],
      queries,
      ['self-storage'],
    );
    expect(c.map((x) => x.name)).toEqual(['Peelland Crossdock']);
    expect(c[0].source).toBe('linkedin');
    expect(c[0].area?.label).toBe('Helmond');
    expect(resolveTerm(c[0])).toBe('Peelland Crossdock Helmond');
    expect(resolveKey('Peelland Crossdock  HELMOND')).toBe(resolveKey(resolveTerm(c[0])));
  });
});
