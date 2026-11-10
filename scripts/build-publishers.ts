/**
 * The publisher directory: for news outlets outside WorldLens's own registry, where each is
 * based — and, where Wikidata knows the outlet, its name, what kind of outlet it is, who owns it
 * and its left–right alignment — by domain, split into 64 files so the API reads only the file
 * a domain is in.
 *
 *   pnpm data:publishers                         (downloads GDELT's list; queries Wikidata)
 *   pnpm data:publishers <gdelt file> [--cache=<file>]
 *       a copy of GDELT's list; --cache keeps Wikidata's answers in a file (reused when present)
 *
 * Sources: GDELT's list of news outlets by country (May 2018, open data) for ~190,000 domains;
 * Wikidata (CC0) for ~55,000 outlets with an official website. Where both know a domain,
 * Wikidata's country (the headquarters', else the outlet's) wins: it is curated and current.
 * A left–right rating is kept only when every current "political alignment" statement of the
 * outlet is a spectrum position (shared/publishers.ts) and they agree; parties and ideologies
 * are never turned into left or right.
 *
 * Output: apps/web/public/data/publishers/NN.json and meta.json, and
 * packages/shared/src/data/publishers-meta.ts (the retrieval date shown with each rating).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCountry } from '../packages/shared/src/data/geo';
import {
  OUTLET_FORMATS,
  PUBLISHER_SHARDS,
  WIKIDATA_ALIGNMENT,
  publisherShard,
  type OutletFormatCode,
  type PublisherEntryRaw,
} from '../packages/shared/src/publishers';
import { qidOf, sparql } from './lib/wikidata';

const GDELT_URL =
  'https://data.gdeltproject.org/blog/2018-news-outlets-by-country-may2018-update/MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT';
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../apps/web/public/data/publishers');
const META_TS = path.resolve(here, '../packages/shared/src/data/publishers-meta.ts');

/* ------------------------------------------------------------------ GDELT's list */

/** GDELT's (FIPS-style) names that the app's country names do not match. */
const NAME_FIX: Record<string, string> = {
  'Korea, South': 'South Korea',
  'Korea, North': 'North Korea',
  'Congo (Kinshasa)': 'Democratic Republic of the Congo',
  'Congo (Brazzaville)': 'Republic of the Congo',
  Burma: 'Myanmar',
  'Gambia, The': 'Gambia',
  'Bahamas, The': 'Bahamas',
  "Cote D'Ivoire": 'Ivory Coast',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  Macedonia: 'North Macedonia',
  Swaziland: 'eSwatini',
  'East Timor': 'Timor-Leste',
  'West Bank': 'Palestine',
  'Gaza Strip': 'Palestine',
};

/**
 * Endings sold worldwide that the list assigns wholesale to the territory owning them (.io to
 * the British Indian Ocean Territory, .tk to Tokelau): no evidence of where the outlet is.
 */
const VANITY_ENDINGS: Record<string, string> = {
  io: 'British Indian Ocean Territory',
  tk: 'Tokelau',
  nu: 'Niue',
  ws: 'Samoa',
  to: 'Tonga',
  ai: 'Anguilla',
  sh: 'Saint Helena',
  cx: 'Christmas Island',
  cc: 'Keeling Islands',
  gs: 'South Georgia and the South Sandwich Islands',
  ms: 'Montserrat',
  la: 'Laos',
  gg: 'Guernsey',
};

/** A country (code or name) as the app knows it: its ISO3, else its name. */
function country(iso: string | undefined, name: string | undefined): string | null {
  if (iso && findCountry(iso)) return iso;
  if (name) return findCountry(NAME_FIX[name] ?? name)?.iso3 ?? name;
  return null;
}

async function gdeltList(
  file: string | undefined,
): Promise<{ map: Map<string, string>; vanity: number }> {
  const text = file
    ? await readFile(file, 'utf8')
    : await fetch(GDELT_URL).then((r) => {
        if (!r.ok) throw new Error(`GDELT list: HTTP ${r.status}`);
        return r.text();
      });
  const map = new Map<string, string>();
  let vanity = 0;
  for (const line of text.split('\n')) {
    const [rawDomain, , rawName] = line.replace(/\r$/, '').split('\t');
    const domain = rawDomain?.trim().toLowerCase();
    const name = rawName?.trim();
    if (!domain || !name || !/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(domain)) continue;
    if (VANITY_ENDINGS[domain.slice(domain.lastIndexOf('.') + 1)] === name) {
      vanity++;
      continue;
    }
    map.set(domain, country(undefined, name)!);
  }
  return { map, vanity };
}

/* ------------------------------------------------------------------ Wikidata */

export interface Outlet {
  qid: string;
  name: string | null;
  links: number;
  formats: Set<OutletFormatCode>;
  sites: Set<string>;
  country: string | null;
  hq: string | null;
  owners: Set<string>;
  ratings: Map<string, { words: string; referenced: boolean }>;
  other: number;
}

/** Hosts many outlets list as their "website" (social media, archives, directories). */
const PLATFORMS = new Set([
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  't.me',
  'vk.com',
  'ok.ru',
  'linkedin.com',
  'tiktok.com',
  'google.com',
  'sites.google.com',
  'archive.org',
  'web.archive.org',
  'wikipedia.org',
  'proquest.umi.com',
]);

export function hostOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return h.replace(/^(www\d*|m|amp|mobile)\./, '') || null;
  } catch {
    return null;
  }
}

const isQid = (s: string | undefined) => !s || /^Q\d+$/.test(s);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function wikidataOutlets(
  outlets = new Map<string, Outlet>(),
  done = new Set<string>(),
): Promise<Map<string, Outlet>> {
  const get = (qid: string) => {
    let o = outlets.get(qid);
    if (!o) {
      o = {
        qid,
        name: null,
        links: 0,
        formats: new Set(),
        sites: new Set(),
        country: null,
        hq: null,
        owners: new Set(),
        ratings: new Map(),
        other: 0,
      };
      outlets.set(qid, o);
    }
    return o;
  };
  const LABELS = 'en,mul,es,fr,de,pt,it,nl,pl,ru,ar,zh,ja,ko,id,tr,hi,sv,uk';
  for (const f of OUTLET_FORMATS) {
    if (done.has(f.qid)) continue;
    done.add(f.qid);
    const rows = await sparql(`SELECT ?i ?iLabel ?site ?links ?ciso ?cname ?hiso ?hname WHERE {
      ?i wdt:P31 wd:${f.qid} ; wdt:P856 ?site ; wikibase:sitelinks ?links .
      OPTIONAL { ?i wdt:P17 ?c . OPTIONAL { ?c wdt:P298 ?ciso } OPTIONAL { ?c rdfs:label ?cname . FILTER(LANG(?cname) = "en") } }
      OPTIONAL { ?i wdt:P159 ?hq . ?hq wdt:P17 ?h . OPTIONAL { ?h wdt:P298 ?hiso } OPTIONAL { ?h rdfs:label ?hname . FILTER(LANG(?hname) = "en") } }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABELS}" . ?i rdfs:label ?iLabel . }
    }`);
    for (const r of rows) {
      const o = get(qidOf(r.i?.value));
      o.formats.add(f.code);
      if (!o.name && !isQid(r.iLabel?.value)) o.name = clip(r.iLabel!.value, 120);
      o.links = Math.max(o.links, Number(r.links?.value ?? 0));
      if (r.site?.value) o.sites.add(r.site.value);
      o.country ??= country(r.ciso?.value, r.cname?.value);
      o.hq ??= country(r.hiso?.value, r.hname?.value);
    }
    const owners = await sparql(`SELECT ?i ?oLabel WHERE {
      ?i wdt:P31 wd:${f.qid} ; p:P127 ?os . ?os ps:P127 ?o .
      FILTER EXISTS { ?i wdt:P856 [] }
      FILTER NOT EXISTS { ?os pq:P582 [] }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . ?o rdfs:label ?oLabel . }
    }`);
    for (const r of owners) {
      const o = outlets.get(qidOf(r.i?.value));
      if (o && !isQid(r.oLabel?.value) && o.owners.size < 2)
        o.owners.add(clip(r.oLabel!.value, 80));
    }
    console.log(`${f.label}: ${rows.length} rows, ${owners.length} owners`);
  }
  // Current "political alignment" statements; each kept with Wikidata's own words for it.
  for (const o of outlets.values()) o.ratings.clear();
  const aligned = await sparql(`SELECT ?i ?a ?aLabel (COUNT(?ref) AS ?refs) WHERE {
    VALUES ?cls { ${OUTLET_FORMATS.map((f) => `wd:${f.qid}`).join(' ')} }
    ?i wdt:P31 ?cls ; p:P1387 ?st . ?st ps:P1387 ?a .
    FILTER EXISTS { ?i wdt:P856 [] }
    FILTER NOT EXISTS { ?st pq:P582 [] }
    OPTIONAL { ?st prov:wasDerivedFrom ?ref }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . ?a rdfs:label ?aLabel . }
  } GROUP BY ?i ?a ?aLabel`);
  for (const r of aligned) {
    const o = outlets.get(qidOf(r.i?.value));
    if (!o) continue;
    const value = WIKIDATA_ALIGNMENT[qidOf(r.a?.value)];
    if (!value) {
      o.other++;
      continue;
    }
    const prev = o.ratings.get(value);
    const referenced = Number(r.refs?.value ?? 0) > 0;
    const words = r.aLabel?.value ?? value.toLowerCase();
    o.ratings.set(value, {
      words: prev ? `${prev.words}; ${words}` : words,
      referenced: (prev?.referenced ?? false) || referenced,
    });
  }
  console.log(`alignment statements: ${aligned.length}`);
  return outlets;
}

/** Whether a website address is a site's root ("https://www.bbc.co.uk/"), not a page on it. */
const isRoot = (url: string) => {
  try {
    const u = new URL(url);
    return (u.pathname === '/' || u.pathname === '') && !u.search;
  } catch {
    return false;
  }
};

/**
 * Each domain's outlet. A media group's site is listed by many of its outlets: the outlet giving
 * the site's root as its website is the site's own (The Guardian on theguardian.com, not The
 * Observer on theguardian.com/observer); among several, the best-known. A host only ever listed
 * with pages under it, by more than three outlets, is a platform (social media, a radio
 * directory): nobody's.
 */
export function outletsByDomain(outlets: Iterable<Outlet>): Map<string, Outlet> {
  const claims = new Map<string, { outlet: Outlet; root: boolean }[]>();
  for (const o of outlets)
    for (const site of o.sites) {
      const host = hostOf(site);
      if (!host || PLATFORMS.has(host) || !host.includes('.')) continue;
      const list = claims.get(host) ?? [];
      const prev = list.find((c) => c.outlet === o);
      if (prev) prev.root ||= isRoot(site);
      else list.push({ outlet: o, root: isRoot(site) });
      claims.set(host, list);
    }
  const out = new Map<string, Outlet>();
  for (const [host, list] of claims) {
    // Named like the site ("Xinhuanet" on xinhuanet.com) first, then the best-known.
    const label = host.split('.')[0]!.replace(/[^a-z0-9]/g, '');
    const named = (o: Outlet) => {
      const n = (o.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return n.length > 2 && (n === label || n === `the${label}` || `the${n}` === label) ? 1 : 0;
    };
    const better = (a: Outlet, b: Outlet) => {
      const d = named(b) - named(a);
      return d !== 0 ? d > 0 : b.links > a.links;
    };
    const best = (l: { outlet: Outlet }[]) =>
      l.reduce((a, b) => (better(a.outlet, b.outlet) ? b : a)).outlet;
    const roots = list.filter((c) => c.root);
    if (roots.length) out.set(host, best(roots));
    else if (list.length <= 3) out.set(host, best(list));
  }
  return out;
}

/** The outlet's entry: its country (headquarters first), name, kind, owners and rating. */
export function entryOf(o: Outlet, fallbackCountry: string | null): PublisherEntryRaw {
  const format = OUTLET_FORMATS.find((f) => o.formats.has(f.code))?.code ?? null;
  // One position, or none: statements that disagree are not averaged into a rating.
  const rating = o.ratings.size === 1 ? [...o.ratings][0]! : null;
  const raw: (string | number | null)[] = [
    o.hq ?? o.country ?? fallbackCountry,
    o.name,
    format,
    o.owners.size ? [...o.owners].join(' / ') : null,
    o.qid,
    rating ? rating[0] : null,
    rating ? rating[1].words : null,
    rating ? (rating[1].referenced ? 1 : 0) : null,
  ];
  while (raw.length && raw[raw.length - 1] === null) raw.pop();
  return raw as PublisherEntryRaw;
}

/* ------------------------------------------------------------------ build */

/** Outlets as JSON (Sets and Maps as arrays), for --cache. */
const toJson = (o: Outlet) => ({
  ...o,
  formats: [...o.formats],
  sites: [...o.sites],
  owners: [...o.owners],
  ratings: [...o.ratings],
});
/** The classes of the first builds' caches (a bare list of outlets). */
const FIRST_CLASSES = [
  'Q2324556',
  'Q1126006',
  'Q192283',
  'Q1868552',
  'Q1110794',
  'Q11032',
  'Q1616075',
  'Q2001305',
  'Q14350',
  'Q17232649',
  'Q1153191',
  'Q15265344',
  'Q1193236',
  'Q41298',
];

interface Cache {
  /** The classes already queried (Wikidata ids). */
  classes: string[];
  outlets: ReturnType<typeof toJson>[];
}
const fromJson = (j: ReturnType<typeof toJson>): Outlet => ({
  ...j,
  formats: new Set(j.formats),
  sites: new Set(j.sites),
  owners: new Set(j.owners),
  ratings: new Map(j.ratings),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const cache = args.find((a) => a.startsWith('--cache='))?.slice('--cache='.length);
  const { map: gdelt, vanity } = await gdeltList(args.find((a) => !a.startsWith('--')));
  // A cache keeps each class's answers: only classes not in it are asked again.
  const cached = cache
    ? ((await readFile(cache, 'utf8')
        .then((t) => JSON.parse(t) as Cache | ReturnType<typeof toJson>[])
        .catch(() => null)) ?? null)
    : null;
  const known: Cache = !cached
    ? { classes: [], outlets: [] }
    : Array.isArray(cached)
      ? { classes: FIRST_CLASSES, outlets: cached }
      : cached;
  const done = new Set(known.classes);
  const outlets = await wikidataOutlets(
    new Map(known.outlets.map((j) => [j.qid, fromJson(j)])),
    done,
  );
  if (cache)
    await writeFile(
      cache,
      JSON.stringify({ classes: [...done], outlets: [...outlets.values()].map(toJson) }),
    );
  const byDomain = outletsByDomain(outlets.values());
  const shards: Record<string, PublisherEntryRaw>[] = Array.from(
    { length: PUBLISHER_SHARDS },
    () => ({}),
  );
  let rated = 0;
  let conflicting = 0;
  for (const o of outlets.values()) if (o.ratings.size > 1) conflicting++;
  const domains = new Set([...gdelt.keys(), ...byDomain.keys()]);
  for (const d of domains) {
    const o = byDomain.get(d);
    const entry = o ? entryOf(o, gdelt.get(d) ?? null) : gdelt.get(d)!;
    if (Array.isArray(entry) && entry[5]) rated++;
    shards[publisherShard(d)]![d] = entry;
  }
  await mkdir(OUT, { recursive: true });
  for (let i = 0; i < PUBLISHER_SHARDS; i++) {
    const sorted = Object.fromEntries(
      Object.entries(shards[i]!).sort(([a], [b]) => a.localeCompare(b)),
    );
    await writeFile(path.join(OUT, `${String(i).padStart(2, '0')}.json`), JSON.stringify(sorted));
  }
  const retrieved = new Date().toISOString().slice(0, 10);
  const meta = {
    retrieved,
    domains: domains.size,
    gdeltDomains: gdelt.size,
    wikidataOutlets: outlets.size,
    wikidataDomains: byDomain.size,
    ratedDomains: rated,
    conflictingRatingsLeftOut: conflicting,
    vanityEndingsLeftOut: vanity,
    sources: {
      gdelt: { name: 'GDELT Project — news outlets by country (May 2018 update)', url: GDELT_URL },
      wikidata: { name: 'Wikidata (CC0)', url: 'https://www.wikidata.org/' },
    },
  };
  await writeFile(path.join(OUT, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  // In the repository's style (Prettier): checked with the rest of the code.
  await writeFile(
    META_TS,
    [
      '/** Built by `pnpm data:publishers` (scripts/build-publishers.ts) — do not edit. */',
      'export const PUBLISHER_DIRECTORY = {',
      `  retrieved: '${retrieved}',`,
      `  domains: ${domains.size},`,
      `  wikidataDomains: ${byDomain.size},`,
      `  ratedDomains: ${rated},`,
      '} as const;',
      '',
    ].join('\n'),
  );
  console.log(
    `${domains.size} domains (${byDomain.size} known to Wikidata, ${rated} with a left–right rating; ${conflicting} outlets with disagreeing statements left unrated) in ${PUBLISHER_SHARDS} files`,
  );
}
