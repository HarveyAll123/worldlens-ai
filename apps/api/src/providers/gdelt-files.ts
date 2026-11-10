/**
 * GDELT 2.0 Global Knowledge Graph files — live news without the DOC API's rate limit.
 * https://data.gdeltproject.org/gdeltv2/ publishes, every 15 minutes, one zipped tab-separated
 * file listing the news articles GDELT processed in that slot (English-language web sources):
 * URL, outlet, time, sharing image and the page title. No key, no per-IP limit — the DOC API
 * answers "limit requests to one every 5 seconds" (HTTP 429) to whole ISP address ranges.
 *
 * Each refresh reads lastupdate.txt, downloads the newest slots it has not seen (a few per run,
 * newest first, so the window fills up over the first runs) and keeps the matching articles
 * per slot in memory. Articles are kept when their headline contains one of the configured
 * query terms; they are handed on in the DOC API's shape, so normalisation, clustering and
 * locating (from the headline) are unchanged. Discovery input only, never ground truth.
 */
import { stripOutletSuffix } from '../lib/headline';
import { unzipFirst } from '../lib/unzip';
import { fetchWithTimeout, UpstreamError, type FetchLike } from '../lib/http';
import type { GdeltArticle, PlaceHint } from './gdelt';

export const GDELT_FILES_BASE = 'https://data.gdeltproject.org/gdeltv2/';
const SLOT_MS = 15 * 60_000;

/** GKG 2.1 columns used. */
const COL = {
  date: 1,
  collection: 2,
  source: 3,
  url: 4,
  places: 10,
  image: 18,
  extras: 26,
} as const;

/** GKG location types → precision (1 country, 2 US state, 3 US city, 4 world city, 5 world state). */
const PRECISION: Record<string, PlaceHint['precision']> = {
  '1': 'country',
  '2': 'region',
  '3': 'city',
  '4': 'city',
  '5': 'region',
};

/**
 * The countries an article names itself (GKG type 1), and the United States when it has US
 * states or towns (types 2 and 3), each with a point inside it. FIPS codes, as GKG gives them.
 */
function countriesNamed(entries: string[][]): Map<string, PlaceHint> {
  const out = new Map<string, PlaceHint>();
  for (const f of entries) {
    const code = f[2] ?? '';
    const lat = Number(f[5]);
    const lon = Number(f[6]);
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (f[0] === '1' && !out.has(code))
      out.set(code, { name: (f[1] ?? code).trim(), lat, lon, precision: 'country' });
  }
  if (!out.has('US') && entries.some((f) => f[0] === '2' || f[0] === '3')) {
    const us = entries.find((f) => (f[0] === '2' || f[0] === '3') && Number.isFinite(Number(f[5])));
    if (us)
      out.set('US', {
        name: 'United States',
        lat: Number(us[5]),
        lon: Number(us[6]),
        precision: 'country',
      });
  }
  return out;
}

/**
 * Places GDELT found in the article (V2 enhanced locations: type#name#country#adm1#adm2#lat#lon#
 * feature#offset) that the headline names too, most specific first — "New Mexico, United States"
 * for "New Mexico House races", where the headline alone suggests the country Mexico.
 *
 * A town or region abroad (types 4, 5) in a country the article never names, while it names
 * others, is a namesake: a Massachusetts radio station's "Three Berkshire Restaurants…" had
 * Berkshire geocoded to Zimbabwe, and the article names only America. When the headline's
 * place is such a namesake, the one country the article names stands in for it.
 */
export function placesInHeadline(field: string, headline: string): PlaceHint[] {
  const lower = ` ${headline.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const entries = field.split(';').map((entry) => entry.split('#'));
  const countries = countriesNamed(entries);
  const out = new Map<string, PlaceHint>();
  let namesake = false;
  for (const f of entries) {
    const precision = PRECISION[f[0] ?? ''];
    const lat = Number(f[5]);
    const lon = Number(f[6]);
    const name = (f[1] ?? '').split(',')[0]!.trim();
    if (!precision || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const words = name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    // A country also counts when the headline uses its adjective: "Yemeni capital" → Yemen,
    // "Israeli strike" → Israel (the word starts with the name; short names would overmatch).
    const named =
      lower.includes(` ${words} `) ||
      (precision === 'country' &&
        words.length >= 4 &&
        !words.includes(' ') &&
        lower.includes(` ${words}`));
    if (!words || !named || out.has(words)) continue;
    if ((f[0] === '4' || f[0] === '5') && countries.size > 0 && !countries.has(f[2] ?? '')) {
      namesake = true;
      continue;
    }
    out.set(words, { name: (f[1] ?? name).trim(), lat, lon, precision });
  }
  if (out.size === 0 && namesake && countries.size === 1) return [...countries.values()];
  // "Mexico" inside "New Mexico" is not a second place.
  const keys = [...out.keys()];
  for (const k of keys)
    if (keys.some((other) => other !== k && ` ${other} `.includes(` ${k} `))) out.delete(k);
  // A town GDELT puts in another province than the one the headline names is a namesake:
  // "protest in Turbat" + "Balochistan" with Turbat geocoded to "Turbat, Punjab, Pakistan".
  const provinces = [...out.values()]
    .filter((p) => p.precision === 'region')
    .map((p) => p.name.split(',')[0]!.trim().toLowerCase());
  if (provinces.length)
    for (const [k, p] of out) {
      const parts = p.name.split(',').map((s) => s.trim().toLowerCase());
      if (p.precision === 'city' && parts.length >= 3 && !provinces.includes(parts[1]!))
        out.delete(k);
    }
  const rank = { city: 0, region: 1, country: 2 };
  return [...out.values()].sort((a, b) => rank[a.precision] - rank[b.precision]).slice(0, 3);
}

/**
 * Headline terms from DOC-API style queries: '(flood OR "coast guard") sourcelang:english' →
 * a case-insensitive whole-word pattern (plurals included) for "flood" and "coast guard".
 */
export function headlinePattern(queries: string[]): RegExp | null {
  const terms = new Set<string>();
  for (const q of queries)
    for (const m of q.matchAll(/"([^"]+)"|([^\s()"]+)/g)) {
      const t = (m[1] ?? m[2] ?? '').trim().toLowerCase();
      if (!t || t.includes(':') || ['or', 'and', 'not'].includes(t)) continue;
      terms.add(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
    }
  return terms.size ? new RegExp(`\\b(?:${[...terms].join('|')})(?:e?s)?\\b`, 'i') : null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });

/** Articles of one GKG file whose headline matches. */
export function parseGkg(text: string, match: RegExp): GdeltArticle[] {
  const out: GdeltArticle[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const c = line.split('\t');
    if (c.length <= COL.extras || c[COL.collection] !== '1') continue; // 1 = web article
    const title = /<PAGE_TITLE>([^<]*)<\/PAGE_TITLE>/.exec(c[COL.extras]!)?.[1];
    if (!title) continue;
    const headline = stripOutletSuffix(decodeEntities(title).trim(), c[COL.source]);
    const url = c[COL.url]!;
    if (!match.test(headline) || seen.has(url)) continue;
    seen.add(url);
    const d = c[COL.date]!;
    const places = placesInHeadline(c[COL.places] ?? '', headline);
    out.push({
      url,
      title: headline,
      seendate: `${d.slice(0, 8)}T${d.slice(8, 14)}Z`,
      socialimage: c[COL.image] || null,
      domain: c[COL.source]!,
      language: 'English',
      sourcecountry: null,
      ...(places.length ? { places } : {}),
    });
  }
  return out;
}

/** "20261101134500" ↔ ms. */
const stampMs = (s: string) =>
  Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
const msStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14);

/** How far back the live news reads GDELT's files: older days are never backfilled. */
export const GDELT_FILES_WINDOW_HOURS = 24;

export class GdeltFilesProvider {
  readonly name = 'gdelt';
  /** Matching articles per 15-minute slot already read (an empty list for a missing slot). */
  private readonly slots = new Map<string, GdeltArticle[]>();

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly opts: { windowHours: number; maxNewFilesPerRun: number } = {
      windowHours: GDELT_FILES_WINDOW_HOURS,
      maxNewFilesPerRun: 6,
    },
  ) {}

  /** Matching articles from the window, newest first. Throws only when nothing at all is known. */
  async fetchLatest(queries: string[]): Promise<GdeltArticle[]> {
    const match = headlinePattern(queries);
    if (!match) return [];
    const latest = await this.latestStamp();
    const latestMs = stampMs(latest);
    const wanted: string[] = [];
    for (let i = 0; i < (this.opts.windowHours * 3_600_000) / SLOT_MS; i++)
      wanted.push(msStamp(latestMs - i * SLOT_MS));
    for (const key of this.slots.keys()) if (!wanted.includes(key)) this.slots.delete(key);

    let failure: unknown = null;
    for (const stamp of wanted
      .filter((s) => !this.slots.has(s))
      .slice(0, this.opts.maxNewFilesPerRun)) {
      try {
        this.slots.set(stamp, await this.readSlot(stamp, match));
      } catch (err) {
        failure = err; // try again next run
      }
    }
    if (this.slots.size === 0 && failure) throw failure;
    return wanted.flatMap((s) => this.slots.get(s) ?? []);
  }

  private async latestStamp(): Promise<string> {
    const res = await fetchWithTimeout(`${GDELT_FILES_BASE}lastupdate.txt`, {
      provider: 'gdelt',
      timeoutMs: 10_000,
      retries: 1,
      fetchImpl: this.fetchImpl,
    });
    const text = await res.text();
    const stamp = /(\d{14})\.gkg\.csv\.zip/.exec(text)?.[1];
    if (!res.ok || !stamp)
      throw new UpstreamError(`gdelt: lastupdate HTTP ${res.status}`, 'gdelt', res.status);
    return stamp;
  }

  private async readSlot(stamp: string, match: RegExp): Promise<GdeltArticle[]> {
    const res = await fetchWithTimeout(`${GDELT_FILES_BASE}${stamp}.gkg.csv.zip`, {
      provider: 'gdelt',
      timeoutMs: 20_000,
      retries: 1,
      fetchImpl: this.fetchImpl,
    });
    if (res.status === 404) return []; // GDELT occasionally skips a slot
    if (!res.ok) throw new UpstreamError(`gdelt: ${stamp} HTTP ${res.status}`, 'gdelt', res.status);
    const csv = await unzipFirst(new Uint8Array(await res.arrayBuffer()));
    return parseGkg(new TextDecoder('utf-8').decode(csv), match);
  }
}
