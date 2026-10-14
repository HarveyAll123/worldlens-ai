/**
 * Step 4: resolve one location per article/cluster from extracted entities, with confidence.
 * Publisher country is deliberately NOT used — where a story is published says nothing
 * reliable about where it happened. Unresolvable stories stay unlocated (not on the globe).
 */
import type { EventLocation } from '@worldlens/shared';
import { countryByIso3, normalizeName } from '@worldlens/shared/geo-data';
import { INSTITUTION_PLACES, type Entities } from './entities';

export interface LocationCandidate {
  key: string;
  location: EventLocation;
  score: number;
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
