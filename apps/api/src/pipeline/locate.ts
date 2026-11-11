/**
 * Step 4: resolve one location per article/cluster from extracted entities, with confidence.
 * Publisher country is deliberately NOT used — where a story is published says nothing
 * reliable about where it happened. Unresolvable stories stay unlocated (not on the globe).
 */
import type { EventLocation } from '@worldlens/shared';
import { COUNTRIES, countryByIso3, normalizeName } from '@worldlens/shared/geo-data';
import type { PlaceHint } from '../providers/gdelt';
import { INSTITUTION_PLACES, type Entities } from './entities';

export interface LocationCandidate {
  key: string;
  location: EventLocation;
  score: number;
}

/** Rough distance in km (equirectangular; fine for "is this the same place"). */
function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(x, b.lat - a.lat) * 111.2;
}

/** The country whose box contains a point, nearest label first (no outlines are bundled). */
function countryNear(lat: number, lon: number) {
  let best: (typeof COUNTRIES)[number] | null = null;
  let bestD = Infinity;
  for (const c of COUNTRIES) {
    const [w, s, e, n] = c.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    const [lx, ly] = c.label ?? [(w + e) / 2, (s + n) / 2];
    const d = distanceKm({ lat, lon }, { lat: ly, lon: lx });
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best;
}

/**
 * "Place, Country" from GDELT's "Place, Province, Country": its provinces outside the US are
 * sometimes wrong ("Turbat, Punjab, Pakistan" — Turbat is in Balochistan), US states are
 * reliable ("Kasilof, Alaska"). Repeats and "(General)" parts are dropped.
 */
function cleanName(name: string): string {
  const parts = [...new Set(name.split(',').map((p) => p.trim()))].filter(
    (p) => p && !p.endsWith('(General)'),
  );
  if (parts.length <= 2) return parts.join(', ');
  const country = parts[parts.length - 1]!;
  return country === 'United States' ? `${parts[0]}, ${parts[1]}` : `${parts[0]}, ${country}`;
}

/**
 * Candidates from places the provider geocoded and the headline names (GDELT GKG), next to
 * those recognised in the headline (`known`). Towns and regions the headline lookup already
 * found keep its (curated) naming; others score just above them, so "New Mexico" beats the
 * country "Mexico". A country hint ("German" → Germany) votes for our own country entry.
 */
export function hintCandidates(
  hints: PlaceHint[] | undefined,
  known: LocationCandidate[],
): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  for (const h of hints ?? []) {
    if (h.precision === 'country') {
      const c = countryNear(h.lat, h.lon);
      if (!c) continue;
      const [lon, lat] = c.label ?? [(c.bbox[0] + c.bbox[2]) / 2, (c.bbox[1] + c.bbox[3]) / 2];
      out.push({
        key: `country:${c.iso3}`,
        score: 0.6,
        location: {
          name: c.name,
          lat,
          lon,
          precision: 'country',
          countryCode: c.iso3,
          confidence: 0.6,
        },
      });
      continue;
    }
    const same = known.some(
      (k) => k.location.precision !== 'country' && distanceKm(k.location, h) < 75,
    );
    if (same) continue;
    const name = cleanName(h.name);
    out.push({
      key: `${h.precision === 'city' ? 'place' : 'region'}:${normalizeName(name.split(',')[0]!)}`,
      score: 0.85,
      location: {
        name,
        lat: h.lat,
        lon: h.lon,
        precision: h.precision,
        countryCode: countryNear(h.lat, h.lon)?.iso3,
        confidence: 0.8,
      },
    });
  }
  return out;
}

/**
 * Headline candidates plus hint candidates, without headline matches that are only part of a
 * longer hinted name ("Mexico" in "New Mexico", "Guinea" in "Papua New Guinea"), and without
 * hints for names the headline uses for something else: geocoders place "Jim Jordan" in Jordan
 * and "Nancy Pelosi" in Nancy, France (`headline`: its entities).
 */
export function withHints(
  hints: PlaceHint[] | undefined,
  fromHeadline: LocationCandidate[],
  headline?: Pick<Entities, 'notPlaces' | 'notCountries'>,
): LocationCandidate[] {
  const usable = (hints ?? []).filter((h) => {
    if (!headline) return true;
    if (headline.notPlaces.includes(normalizeName(h.name.split(',')[0]!))) return false;
    if (h.precision !== 'country') return true;
    const c = countryNear(h.lat, h.lon);
    return !c || !headline.notCountries.includes(c.iso3);
  });
  const longer = usable.map((h) => ` ${normalizeName(h.name.split(',')[0]!)} `);
  const kept = fromHeadline.filter((c) => {
    const own = normalizeName(c.location.name.split(',')[0]!);
    return !longer.some((l) => l !== ` ${own} ` && l.includes(` ${own} `));
  });
  return [...hintCandidates(usable, kept), ...kept];
}

export function locationCandidates(e: Entities): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  for (const p of e.places) {
    out.push({
      key: `place:${normalizeName(p.name)}`,
      score: 0.8 - Math.min(0.2, p.rank * 0.02),
      location: {
        name: p.country ? `${p.name}, ${p.country}` : p.name,
        lat: p.lat,
        lon: p.lon,
        precision: 'city',
        countryCode: p.iso3.length === 3 ? p.iso3 : undefined,
        confidence: 0.75,
      },
    });
  }
  for (const r of e.regions) {
    out.push({
      key: `region:${normalizeName(r.name)}`,
      score: 0.7,
      location: { name: r.name, lat: r.lat, lon: r.lon, precision: 'region', confidence: 0.65 },
    });
  }
  for (const iso3 of e.countries) {
    const c = countryByIso3(iso3);
    if (!c) continue;
    const [lon, lat] = c.label ?? [(c.bbox[0] + c.bbox[2]) / 2, (c.bbox[1] + c.bbox[3]) / 2];
    out.push({
      key: `country:${iso3}`,
      score: 0.55,
      location: {
        name: c.name,
        lat,
        lon,
        precision: 'country',
        countryCode: iso3,
        confidence: 0.55,
      },
    });
  }
  if (out.length === 0) {
    for (const org of e.organizations) {
      const inst = INSTITUTION_PLACES[org];
      if (inst)
        out.push({
          key: `inst:${org}`,
          score: 0.4,
          location: {
            name: inst.name,
            lat: inst.lat,
            lon: inst.lon,
            precision: 'city',
            confidence: 0.4,
          },
        });
    }
  }
  return out;
}

/**
 * Vote across one or more articles' candidates. A place inside a mentioned country
 * reinforces that country (and vice versa) so "Kharkiv, Ukraine" resolves to Kharkiv.
 */
export function resolveLocation(candidateSets: LocationCandidate[][]): EventLocation | null {
  const votes = new Map<string, { c: LocationCandidate; total: number; count: number }>();
  for (const set of candidateSets) {
    for (const c of set) {
      const v = votes.get(c.key) ?? { c, total: 0, count: 0 };
      v.total += c.score;
      v.count += 1;
      votes.set(c.key, v);
    }
  }
  if (votes.size === 0) return null;
  // Specific places inherit support from their containing country.
  for (const v of votes.values()) {
    if (v.c.location.precision === 'city' && v.c.location.countryCode) {
      const parent = votes.get(`country:${v.c.location.countryCode}`);
      if (parent) v.total += parent.total * 0.5;
    }
  }
  const ranked = [...votes.values()].sort((a, b) => b.total - a.total);
  const best = ranked[0]!;
  const totalVotes = ranked.reduce((s, v) => s + v.total, 0);
  const share = best.total / totalVotes;
  const confidence = Math.max(
    0.2,
    Math.min(0.95, best.c.location.confidence * (0.6 + 0.4 * share)),
  );
  return { ...best.c.location, confidence: Math.round(confidence * 100) / 100 };
}
