/**
 * Publishers as the event card and the assistant show them, and where each is based.
 *
 * - WorldLens's registry (shared/data/sources.ts) is authoritative for its outlets.
 * - Outlets outside it are named and described from Wikidata where Wikidata knows their website
 *   (name, kind, owner), and placed by Wikidata (headquarters, else country), by the country
 *   their news feed reported, or by GDELT's list of news outlets by country (2018).
 * - A left–right rating comes only from Wikidata's "political alignment" statements, only when
 *   they are spectrum positions that agree (scripts/build-publishers.ts), shown with Wikidata's
 *   own words and as community-edited: low confidence, medium when the statement cites a source.
 *
 * Places too small for an outline (Hong Kong, Singapore) are flown to without one; a country the
 * map does not know at all is named only.
 */
import { outletFormat, type NewsSource, type PublisherEntry } from '@worldlens/shared';
import { PUBLISHER_DIRECTORY } from '@worldlens/shared/data';
import { findCountry, resolvePlace, type CountryEntry } from '@worldlens/shared/geo-data';
import type { PublisherDirectory } from '../providers/publisher-directory';

export interface PublisherPlace {
  /** The country outline to highlight; null when the map has none (a city-state). */
  iso3: string | null;
  name: string;
  /** Where to fly; absent when the map does not know the place. */
  lat?: number;
  lon?: number;
  altitudeKm?: number;
  /**
   * registry: WorldLens's publisher list; wikidata: the outlet's Wikidata item; reported: the
   * news feed; gdelt-list: GDELT's list of news outlets by country (2018).
   */
  basis: 'registry' | 'wikidata' | 'reported' | 'gdelt-list';
}

let regions: Intl.DisplayNames | null | undefined;
/** "CN" → "China" (English), where the runtime knows region names. */
function regionName(iso2: string): string | null {
  if (regions === undefined) {
    try {
      regions = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regions = null;
    }
  }
  try {
    return regions?.of(iso2.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/** Everyday names where the map's are long. */
const SHORT_NAME: Record<string, string> = {
  USA: 'United States',
  COD: 'DR Congo',
  CAF: 'Central African Rep.',
  BIH: 'Bosnia and Herzegovina',
};

/** A view that frames the whole country. */
function countryView(c: CountryEntry, basis: PublisherPlace['basis']): PublisherPlace {
  const [w, s, e, n] = c.bbox;
  const lat = c.label?.[1] ?? (s + n) / 2;
  const lon = c.label?.[0] ?? (w + e) / 2;
  const span = Math.max(n - s, Math.min(e - w, 120) * Math.cos(((s + n) / 2) * (Math.PI / 180)));
  // Capped: overseas territories (France, the US) would otherwise frame half the globe.
  const altitudeKm = Math.round(Math.min(4500, Math.max(700, span * 111 * 1.9)));
  return { iso3: c.iso3, name: SHORT_NAME[c.iso3] ?? c.name, lat, lon, altitudeKm, basis };
}

/** A country (ISO3 code or name) → its place; a known name the map lacks is named only. */
function placeOf(names: string[], basis: PublisherPlace['basis']): PublisherPlace | null {
  for (const n of names) {
    const c = findCountry(n);
    if (c) return countryView(c, basis);
  }
  for (const n of names) {
    const p = resolvePlace(n);
    if (p) return { iso3: null, name: n, lat: p.lat, lon: p.lon, altitudeKm: 600, basis };
  }
  const named = names.find((n) => !/^[A-Z]{3}$/.test(n));
  return named ? { iso3: null, name: named, basis } : null;
}

/** From the publisher's own record: its national perspective or its country code. */
export function publisherPlace(s: NewsSource): PublisherPlace | null {
  const names = [
    // "China (PRC)" → "China"
    s.nationalPerspective?.replace(/\s*\([^)]*\)\s*$/, '').trim(),
    s.country ? regionName(s.country)?.replace(/ SAR China$/, '') : null,
  ].filter((n): n is string => !!n && n !== 'International');
  return placeOf(names, s.sourceType === 'unknown' ? 'reported' : 'registry');
}

export const WIKIDATA_RATING_METHOD =
  "Wikidata's \"political alignment\" statement for this outlet, edited by Wikidata's community (often from the outlet's Wikipedia article). Only positions on the left–right spectrum are used, and only when the outlet's statements agree; parties and ideologies are never turned into left or right.";

/** The outlet as Wikidata describes it, over what WorldLens knew (the registry stays). */
function described(s: NewsSource, e: PublisherEntry): NewsSource {
  const unknown = s.sourceType === 'unknown';
  const format = outletFormat(e.format);
  const out: NewsSource = {
    ...s,
    name: unknown && e.name ? e.name : s.name,
    sourceType: unknown && format?.type ? format.type : s.sourceType,
    ownership: s.ownership ?? e.owner,
    ...(format ? { format: format.label } : {}),
    ...(e.wikidata ? { wikidata: e.wikidata } : {}),
  };
  if (e.rating && e.wikidata && s.rating.value === 'UNRATED' && !s.isDemo)
    out.rating = {
      value: e.rating.value as NewsSource['rating']['value'],
      methodology: WIKIDATA_RATING_METHOD,
      source: `Wikidata (${e.wikidata})`,
      sourceUrl: `https://www.wikidata.org/wiki/${e.wikidata}`,
      confidence: e.rating.referenced ? 'medium' : 'low',
      lastReviewed: PUBLISHER_DIRECTORY.retrieved,
      illustrative: false,
      ...(e.rating.words ? { statement: e.rating.words.slice(0, 200) } : {}),
    };
  return out;
}

/**
 * The publishers described (registry first, then Wikidata) and where each is based, by id —
 * registry, Wikidata, the reported country, then GDELT's list. Unplaced publishers are left out.
 */
export async function describePublishers(
  sources: NewsSource[],
  directory?: PublisherDirectory,
): Promise<{ sources: NewsSource[]; places: Record<string, PublisherPlace> }> {
  const listed = directory
    ? await directory.lookup(sources.filter((s) => !s.isDemo).map((s) => s.domain))
    : new Map<string, PublisherEntry>();
  const places: Record<string, PublisherPlace> = {};
  const out = sources.map((s) => {
    const e = listed.get(s.domain);
    const own = publisherPlace(s);
    const fromList = e?.country ? placeOf([e.country], e.basis) : null;
    const place =
      own?.basis === 'registry'
        ? own
        : e?.basis === 'wikidata'
          ? (fromList ?? own)
          : (own ?? fromList);
    if (place) places[s.id] = place;
    return e?.basis === 'wikidata' ? described(s, e) : s;
  });
  return { sources: out, places };
}
