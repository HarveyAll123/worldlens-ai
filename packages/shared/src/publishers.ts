/**
 * Where news outlets are based, for outlets outside WorldLens's publisher registry: GDELT's list
 * of news outlets by country, split into files by a hash of the domain
 * (apps/web/public/data/publishers/NN.json, built by `pnpm data:publishers`). The build script
 * and the API agree on the hash and on which parts of a host name to look up.
 */

export const PUBLISHER_SHARDS = 64;

/** FNV-1a (32-bit) of a domain → the file it is in. */
export function publisherShard(domain: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < domain.length; i++) {
    h ^= domain.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % PUBLISHER_SHARDS;
}

/** Second-level labels under a country ending: "co.uk", "com.au" are endings, not outlets. */
const SECOND_LEVEL = new Set([
  'co',
  'com',
  'net',
  'org',
  'gov',
  'ac',
  'edu',
  'ne',
  'or',
  'go',
  'gob',
]);

/**
 * The names to look up for a host, most specific first: "www.news.bbc.co.uk" →
 * ["news.bbc.co.uk", "bbc.co.uk"] (never a bare ending such as "co.uk" or "com").
 */
export function publisherDomains(host: string): string[] {
  const parts = host
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^(www\d*|m|amp|mobile)\./, '')
    .split('.')
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const rest = parts.slice(i);
    if (rest.length === 2 && rest[1]!.length === 2 && SECOND_LEVEL.has(rest[0]!)) break;
    out.push(rest.join('.'));
  }
  return out;
}

/* ------------------------------------------------------------- Wikidata outlet profiles */

/**
 * What kind of outlet Wikidata says it is (its "instance of" class), most telling first.
 * `type` is the publisher type WorldLens already uses, where the class says it.
 */
export const OUTLET_FORMATS = [
  { code: 's', qid: 'Q2324556', label: 'State media', type: 'state-media' },
  { code: 'p', qid: 'Q1126006', label: 'Public broadcaster', type: 'public-broadcaster' },
  { code: 'a', qid: 'Q192283', label: 'News agency', type: 'wire-agency' },
  { code: 'l', qid: 'Q1868552', label: 'Local newspaper', type: 'local' },
  { code: 'd', qid: 'Q1110794', label: 'Daily newspaper', type: null },
  { code: 'n', qid: 'Q11032', label: 'Newspaper', type: null },
  { code: 't', qid: 'Q1616075', label: 'TV station', type: null },
  { code: 'c', qid: 'Q2001305', label: 'TV channel', type: null },
  { code: 'N', qid: 'Q115477322', label: 'News channel', type: null },
  { code: 'C', qid: 'Q7892363', label: 'Cable news channel', type: null },
  { code: 'h', qid: 'Q561068', label: 'TV channel', type: null },
  { code: 'k', qid: 'Q1254874', label: 'TV network', type: null },
  { code: 'r', qid: 'Q14350', label: 'Radio station', type: null },
  { code: 'u', qid: 'Q1061197', label: 'Radio network', type: null },
  { code: 'y', qid: 'Q2305295', label: 'Weekly newspaper', type: null },
  { code: 'f', qid: 'Q142043', label: 'Free newspaper', type: null },
  { code: 'v', qid: 'Q1449648', label: 'Tabloid', type: null },
  { code: 'i', qid: 'Q5276122', label: 'Digital newspaper', type: null },
  { code: 'w', qid: 'Q17232649', label: 'News website', type: null },
  { code: 'o', qid: 'Q1153191', label: 'Online newspaper', type: null },
  { code: 'b', qid: 'Q15265344', label: 'Broadcaster', type: null },
  { code: 'e', qid: 'Q1193236', label: 'News outlet', type: null },
  { code: 'z', qid: 'Q1684600', label: 'News magazine', type: null },
  { code: 'm', qid: 'Q41298', label: 'Magazine', type: null },
  { code: 'q', qid: 'Q847906', label: 'Online magazine', type: null },
  { code: 'x', qid: 'Q498267', label: 'News aggregator', type: null },
  { code: 'g', qid: 'Q186165', label: 'Web portal', type: null },
  { code: 'j', qid: 'Q3579160', label: 'Newspaper publisher', type: null },
] as const;

export type OutletFormatCode = (typeof OUTLET_FORMATS)[number]['code'];

/**
 * Wikidata "political alignment" (P1387) values that are positions on the left–right spectrum,
 * and the rating each one is. Parties, ideologies ("conservatism") and anything else are never
 * turned into left or right: that would be WorldLens guessing.
 */
export const WIKIDATA_ALIGNMENT: Record<
  string,
  'LEFT' | 'CENTER-LEFT' | 'CENTER' | 'CENTER-RIGHT' | 'RIGHT' | 'MIXED'
> = {
  Q164597: 'LEFT', // left-wing
  Q1129409: 'LEFT', // far-left politics
  Q15141601: 'LEFT', // radical left
  Q737014: 'CENTER-LEFT', // centre-left
  Q6587194: 'CENTER', // centrism
  Q844072: 'CENTER-RIGHT', // centre-right
  Q76074: 'RIGHT', // right-wing
  Q204481: 'RIGHT', // right-wing extremism
  Q127869500: 'RIGHT', // far-right
  Q21848959: 'RIGHT', // radical right
  Q23018230: 'RIGHT', // alt-right
  Q1030814: 'MIXED', // big tent
  Q3289782: 'MIXED', // syncretic politics
};

/**
 * One domain in the publisher directory: a country only (GDELT's list), or what Wikidata knows
 * about the outlet: [country, name, format, owner, Wikidata id, rating, Wikidata's own words for
 * the rating, 1 when that statement cites a source] — trailing blanks left out.
 */
export type PublisherEntryRaw =
  | string
  | [
      country: string | null,
      name?: string | null,
      format?: OutletFormatCode | null,
      owner?: string | null,
      wikidata?: string | null,
      rating?: string | null,
      ratingWords?: string | null,
      referenced?: 0 | 1 | null,
    ];

export interface PublisherEntry {
  /** ISO 3166-1 alpha-3, or the country's name where the map has no outline for it. */
  country: string | null;
  name: string | null;
  format: OutletFormatCode | null;
  owner: string | null;
  wikidata: string | null;
  rating: { value: string; words: string | null; referenced: boolean } | null;
  basis: 'gdelt-list' | 'wikidata';
}

export function decodePublisherEntry(raw: PublisherEntryRaw): PublisherEntry {
  if (typeof raw === 'string')
    return {
      country: raw,
      name: null,
      format: null,
      owner: null,
      wikidata: null,
      rating: null,
      basis: 'gdelt-list',
    };
  const [country, name, format, owner, wikidata, rating, words, referenced] = raw;
  return {
    country: country ?? null,
    name: name ?? null,
    format: format ?? null,
    owner: owner ?? null,
    wikidata: wikidata ?? null,
    rating: rating ? { value: rating, words: words ?? null, referenced: referenced === 1 } : null,
    basis: 'wikidata',
  };
}

export function outletFormat(code: string | null | undefined) {
  return OUTLET_FORMATS.find((f) => f.code === code) ?? null;
}
