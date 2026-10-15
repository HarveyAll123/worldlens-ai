/**
 * In-memory search over events, places, regions, conflicts and named participants.
 * Handles queries such as "Berlin 1945", "Waterloo", "Indonesia 1965", "South China Sea",
 * "Ukraine", "Napoleonic Wars".
 */
import {
  extractYears,
  intersects,
  normalizeText,
  temporalSpan,
  tokenize,
  utcMs,
  type SearchResult,
  type Temporal,
  type WorldEvent,
} from '@worldlens/shared';
import { CONFLICTS, isBattleLayerEvent } from '@worldlens/shared/data';
import {
  COUNTRIES,
  PLACES,
  REGIONS,
  normalizeName,
  resolvePlace,
} from '@worldlens/shared/geo-data';

export interface TimeWindow {
  startMs: number;
  endMs: number;
}

interface IndexedEvent {
  event: WorldEvent;
  title: Set<string>;
  body: Set<string>;
  place: Set<string>;
  people: Set<string>;
}

export class SearchIndex {
  private events: IndexedEvent[] = [];

  setEvents(events: WorldEvent[]): void {
    this.events = events.map((event) => ({
      event,
      title: new Set(tokenize(event.title)),
      body: new Set(
        tokenize(`${event.summary ?? ''} ${event.tags.join(' ')} ${event.whyItMatters ?? ''}`),
      ),
      place: new Set(tokenize(`${event.location.name} ${event.location.countryCode ?? ''}`)),
      people: new Set(tokenize(event.participants.map((p) => p.name).join(' '))),
    }));
  }

  /**
   * `window` restricts event results to a time span before the result list is cut to `limit`
   * (filtering afterwards would let thousands of out-of-range battles crowd out the range).
   */
  search(
    raw: string,
    opts: { limit: number; includeDemo: boolean; window?: TimeWindow },
  ): SearchResult[] {
    const query = raw.trim().slice(0, 200);
    if (!query) return [];
    const years = extractYears(query);
    const textPart = query.replace(/\b(1[0-9]{3}|2[0-9]{3})s?\b/g, ' ').trim();
    const qTokens = tokenize(textPart);
    const yearWindow =
      years.length > 0
        ? {
            startMs: utcMs(Math.min(...years)),
            endMs: utcMs(
              Math.max(...years) + (/\d{3}0s\b/.test(query) && years.length === 1 ? 10 : 1),
            ),
          }
        : null;
    const yearTemporal: Temporal | undefined =
      years.length > 0
        ? {
            start: String(Math.min(...years)).padStart(4, '0'),
            precision: 'year',
            approximate: false,
          }
        : undefined;
    const results: SearchResult[] = [];

    // Places: regions, countries, populated places.
    if (textPart) {
      const resolved = resolvePlace(textPart);
      if (resolved) {
        results.push({
          type: 'PLACE',
          id: `place:${normalizeName(resolved.name)}`,
          title: resolved.name,
          subtitle: `${resolved.kind === 'country' ? 'Country' : resolved.kind === 'region' ? 'Region' : 'Place'}${
            yearTemporal ? ` · ${yearTemporal.start}` : ''
          }`,
          lat: resolved.lat,
          lon: resolved.lon,
          altitude: resolved.altitudeM,
          ...(yearTemporal ? { time: yearTemporal } : {}),
          isDemo: false,
          score: 50,
        });
      } else {
        const nq = normalizeName(textPart);
        if (nq.length >= 3) {
          for (const c of COUNTRIES)
            if (normalizeName(c.name).startsWith(nq) && results.length < 3)
              results.push({
                type: 'PLACE',
                id: `place:${normalizeName(c.name)}`,
                title: c.name,
                subtitle: 'Country',
                lat: c.label?.[1] ?? (c.bbox[1] + c.bbox[3]) / 2,
                lon: c.label?.[0] ?? (c.bbox[0] + c.bbox[2]) / 2,
                altitude: 2_500_000,
                isDemo: false,
                score: 30,
              });
          for (const r of REGIONS)
            if (normalizeName(r.name).startsWith(nq))
              results.push({
                type: 'PLACE',
                id: `place:${normalizeName(r.name)}`,
                title: r.name,
                subtitle: 'Region',
                lat: r.lat,
                lon: r.lon,
                altitude: r.altitudeM,
                isDemo: false,
                score: 30,
              });
          for (const p of PLACES) {
            if (results.length >= 6) break;
            if (normalizeName(p.name).startsWith(nq))
              results.push({
                type: 'PLACE',
                id: `place:${normalizeName(p.name)}:${p.iso3}`,
                title: p.name,
                subtitle: p.country ?? 'Place',
                lat: p.lat,
                lon: p.lon,
                altitude: 150_000,
                isDemo: false,
                score: 25 - p.rank,
              });
          }
        }
      }
    }

    // Conflicts and disputes.
    const nText = normalizeText(textPart);
    for (const c of CONFLICTS) {
      const names = [c.name, ...c.aliases].map(normalizeText);
      const exact = names.some((n) => n === nText);
      const partial =
        !exact && nText.length >= 4 && names.some((n) => n.includes(nText) || nText.includes(n));
      if (!exact && !partial) continue;
      results.push({
        type: 'CONFLICT',
        id: c.id,
        title: c.name,
        subtitle: c.time.label ?? `${c.time.start}${c.time.end ? `–${c.time.end}` : ''}`,
        lat: c.lat,
        lon: c.lon,
        altitude: c.altitudeM,
        time: c.time,
        isDemo: false,
        score: exact ? 60 : 35,
      });
    }

    // Events.
    for (const ie of this.events) {
      if (!opts.includeDemo && ie.event.isDemo) continue;
      if (opts.window && !intersects(temporalSpan(ie.event.time), opts.window)) continue;
      let score = 0;
      for (const t of qTokens) {
        if (ie.title.has(t)) score += 6;
        else if (ie.place.has(t)) score += 4;
        else if (ie.people.has(t)) score += 3;
        else if (ie.body.has(t)) score += 1.5;
      }
      if (qTokens.length > 0 && score === 0) continue;
      if (yearWindow) {
        if (!intersects(temporalSpan(ie.event.time), yearWindow)) continue;
        score += 5;
      }
      if (score === 0) continue;
      if (qTokens.length > 1 && qTokens.every((t) => ie.title.has(t))) score += 10;
      score += ie.event.importance;
      // At equal relevance, curated (editorially reviewed) events rank above the bulk-imported
      // Wikidata battle layer.
      if (isBattleLayerEvent(ie.event)) score -= 3;
      results.push({
        type: ie.event.kind === 'news' ? 'NEWS' : 'HISTORY',
        id: ie.event.id,
        title: ie.event.title,
        subtitle: ie.event.location.name,
        lat: ie.event.location.lat,
        lon: ie.event.location.lon,
        altitude: ie.event.location.precision === 'city' ? 250_000 : 1_200_000,
        time: ie.event.time,
        eventId: ie.event.id,
        isDemo: ie.event.isDemo,
        score,
      });
    }

    // Named participants (people, organisations) as ENTITY results.
    if (qTokens.length > 0) {
      const seen = new Set<string>();
      for (const ie of this.events) {
        for (const p of ie.event.participants) {
          if (p.type !== 'person' && p.type !== 'organization' && p.type !== 'group') continue;
          const pt = tokenize(p.name);
          if (!qTokens.every((t) => pt.includes(t)) || seen.has(p.name)) continue;
          seen.add(p.name);
          results.push({
            type: 'ENTITY',
            id: `entity:${normalizeName(p.name)}`,
            title: p.name,
            subtitle: `Appears in: ${ie.event.title}`,
            lat: ie.event.location.lat,
            lon: ie.event.location.lon,
            altitude: 800_000,
            time: ie.event.time,
            eventId: ie.event.id,
            isDemo: ie.event.isDemo,
            score: 20,
          });
        }
      }
    }

    const dedup = new Map<string, SearchResult>();
    for (const r of results) {
      const key = `${r.type}:${r.id}`;
      const prev = dedup.get(key);
      if (!prev || prev.score < r.score) dedup.set(key, r);
    }
    return [...dedup.values()].sort((a, b) => b.score - a.score).slice(0, opts.limit);
  }
}
