import { describe, expect, it } from 'vitest';
import {
  ACTION_OPTIONS,
  CONFLICTS,
  FRONTLINES,
  HISTORICAL_EVENTS,
  NEWS_SOURCES,
  RELATIONS,
  buildDemoNews,
  sourceForDomain,
} from '../data';
import {
  ActionOptionSchema,
  ArticleSchema,
  EventRelationSchema,
  EventSchema,
  FrontlineSchema,
  NewsSourceSchema,
} from '../schemas';
import { minNavigableMs, parseIso, utcMs } from '../temporal';

const NOW = utcMs(2026, 10, 14, 12);

describe('curated historical dataset', () => {
  it('every record satisfies the event schema', () => {
    for (const e of HISTORICAL_EVENTS) {
      const r = EventSchema.safeParse(e);
      if (!r.success) throw new Error(`${e.id}: ${r.error.message}`);
    }
  });
  it('has unique ids, is within the navigable range, is not demo, and links Wikipedia', () => {
    const ids = new Set<string>();
    for (const e of HISTORICAL_EVENTS) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(parseIso(e.time.start)).toBeGreaterThanOrEqual(minNavigableMs());
      if (e.time.end) expect(parseIso(e.time.end)).toBeGreaterThanOrEqual(parseIso(e.time.start));
      expect(e.isDemo).toBe(false);
      expect(e.references[0]?.url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
    }
    expect(HISTORICAL_EVENTS.length).toBeGreaterThan(60);
  });
});

describe('demo dataset', () => {
  const demo = buildDemoNews(NOW);
  it('is always labelled DEMO and links nowhere real', () => {
    for (const e of demo.events) {
      expect(EventSchema.safeParse(e).success).toBe(true);
      expect(e.isDemo).toBe(true);
      expect(e.title.startsWith('DEMO:')).toBe(true);
      for (const a of demo.articles.get(e.id) ?? []) {
        expect(ArticleSchema.safeParse(a).success).toBe(true);
        expect(new URL(a.url).hostname.endsWith('.invalid')).toBe(true);
        expect(NEWS_SOURCES.find((s) => s.id === a.sourceId)?.isDemo).toBe(true);
      }
    }
  });
  it('places demo events inside the live window', () => {
    for (const e of demo.events) expect(NOW - parseIso(e.time.start)).toBeLessThan(72 * 3_600_000);
  });
});

describe('registry, relations, actions, frontlines', () => {
  it('sources are valid; real sources are UNRATED; only demo ratings are illustrative', () => {
    for (const s of NEWS_SOURCES) {
      expect(NewsSourceSchema.safeParse(s).success).toBe(true);
      if (!s.isDemo) expect(s.rating.value).toBe('UNRATED');
      if (s.rating.value !== 'UNRATED') expect(s.rating.illustrative).toBe(true);
    }
    expect(sourceForDomain('www.reuters.com')?.name).toBe('Reuters');
    expect(sourceForDomain('edition.cnn.com')?.name).toBe('CNN');
    expect(sourceForDomain('example.org')).toBeNull();
  });
  it('relations reference known events', () => {
    const ids = new Set([...HISTORICAL_EVENTS, ...buildDemoNews(NOW).events].map((e) => e.id));
    for (const r of RELATIONS) {
      expect(EventRelationSchema.safeParse(r).success).toBe(true);
      expect(ids.has(r.fromId), r.fromId).toBe(true);
      expect(ids.has(r.toId), r.toId).toBe(true);
    }
  });
  it('take-action options are sandbox-only and tied to demo humanitarian events', () => {
    const demoIds = new Set(
      buildDemoNews(NOW)
        .events.filter((e) => e.hasTakeAction)
        .map((e) => e.id),
    );
    for (const a of ACTION_OPTIONS) {
      expect(ActionOptionSchema.safeParse(a).success).toBe(true);
      expect(a.sandbox).toBe(true);
      expect(a.beneficiary.kind).toBe('sandbox-demo-merchant');
      for (const id of a.eventIds) expect(demoIds.has(id)).toBe(true);
      expect(a.eventIds.length > 0 || a.appliesToLiveCategories.length > 0).toBe(true);
      for (const c of a.appliesToLiveCategories)
        expect(['disaster', 'humanitarian', 'health']).toContain(c);
    }
  });
  it('frontlines and conflicts are valid', () => {
    for (const f of FRONTLINES) expect(FrontlineSchema.safeParse(f).success).toBe(true);
    expect(new Set(CONFLICTS.map((c) => c.id)).size).toBe(CONFLICTS.length);
  });
});
