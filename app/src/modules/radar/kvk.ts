import 'server-only';
import { env } from '@/lib/env';
import { normaliseName } from '@/lib/text';

export interface KvkData {
  nummer: string;
  naam: string;
  sbi: string[];
  employees: string;
}

// Optional KvK lookup (paid API, B.4). Without KVK_API_KEY it returns null and nothing else changes.
export async function lookupKvk(name: string, city: string): Promise<KvkData | null> {
  if (!env.kvkApiKey) return null;
  try {
    const params = new URLSearchParams({ naam: name, resultatenPerPagina: '5' });
    if (city) params.set('plaats', city);
    const search = await fetch(`https://api.kvk.nl/api/v2/zoeken?${params}`, {
      headers: { apikey: env.kvkApiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!search.ok) return null;
    const json = (await search.json()) as { resultaten?: { kvkNummer: string; naam: string; type?: string }[] };
    const wanted = normaliseName(name);
    const hit =
      json.resultaten?.find((r) => normaliseName(r.naam) === wanted && r.type !== 'nevenvestiging') ?? json.resultaten?.[0];
    if (!hit) return null;

    const profile = await fetch(`https://api.kvk.nl/api/v1/basisprofielen/${hit.kvkNummer}`, {
      headers: { apikey: env.kvkApiKey },
      signal: AbortSignal.timeout(8000),
    });
    const basis = profile.ok
      ? ((await profile.json()) as { sbiActiviteiten?: { sbiCode: string; sbiOmschrijving: string }[]; totaalWerkzamePersonen?: number })
      : {};
    return {
      nummer: hit.kvkNummer,
      naam: hit.naam,
      sbi: (basis.sbiActiviteiten ?? []).map((s) => `${s.sbiCode} ${s.sbiOmschrijving}`),
      employees: basis.totaalWerkzamePersonen ? String(basis.totaalWerkzamePersonen) : '',
    };
  } catch {
    return null;
  }
}
