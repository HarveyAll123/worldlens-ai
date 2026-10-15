import { describe, expect, it } from 'vitest';
import {
  ACTION_OPTIONS,
  BATTLE_EVENTS,
  CONFLICTS,
  FRONTLINES,
  HISTORICAL_EVENTS,
  NEWS_SOURCES,
  RELATIONS,
  buildDemoNews,
  isBattleLayerEvent,
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

describe('Wikidata battle layer', () => {
  it('every record satisfies the event schema', () => {
    expect(BATTLE_EVENTS.length).toBeGreaterThan(4000);
    for (const e of BATTLE_EVENTS) {
      const r = EventSchema.safeParse(e);
      if (!r.success) throw new Error(`${e.id}: ${r.error.message}`);
    }
  });
  it('is dated, cited to Wikidata, ranked below curated history and never duplicates it', () => {
    const curatedIds = new Set(HISTORICAL_EVENTS.map((e) => e.id));
    const curatedArticles = new Set(HISTORICAL_EVENTS.map((e) => e.wikipediaTitle));
    const conflictIds = new Set(CONFLICTS.map((c) => c.id));
    const ids = new Set<string>();
    for (const e of BATTLE_EVENTS) {
      expect(e.id).toMatch(/^wd-Q\d+$/);
      expect(ids.has(e.id) || curatedIds.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(isBattleLayerEvent(e)).toBe(true);
      expect(e.provenance.provider).toBe('wikidata');
      expect(e.references[0]?.url).toBe(`https://www.wikidata.org/wiki/${e.id.slice(3)}`);
      expect(e.importance).toBeLessThanOrEqual(4);
      expect(parseIso(e.time.start)).toBeGreaterThanOrEqual(minNavigableMs());
      if (e.time.end) expect(parseIso(e.time.end)).toBeGreaterThanOrEqual(parseIso(e.time.start));
      if (e.wikipediaTitle) expect(curatedArticles.has(e.wikipediaTitle)).toBe(false);
      if (e.conflictId) expect(conflictIds.has(e.conflictId)).toBe(true);
    }
    for (const e of HISTORICAL_EVENTS) expect(isBattleLayerEvent(e)).toBe(false);
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
    const conflictIds = new Set(CONFLICTS.map((c) => c.id));
    for (const f of FRONTLINES) expect(conflictIds.has(f.conflictId)).toBe(true);
  });
  it('loads the Natural Earth ceasefire lines where they belong', () => {
    const bbox = (id: string) => {
      const f = FRONTLINES.find((x) => x.id === id);
      if (!f) throw new Error(`missing ${id}`);
      const pts =
        f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
      const lons = pts.map((p) => p[0]!);
      const lats = pts.map((p) => p[1]!);
      return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    };
    const inside = (b: number[], w: number, s: number, e: number, n: number) =>
      b[0]! >= w && b[1]! >= s && b[2]! <= e && b[3]! <= n;
    expect(inside(bbox('line-korea-mdl-1953'), 126, 37.5, 129, 39)).toBe(true);
    expect(inside(bbox('line-kashmir-loc-1972'), 73, 32, 78, 36)).toBe(true);
    expect(inside(bbox('line-golan-1974'), 35.5, 32.5, 36.1, 33.5)).toBe(true);
    expect(inside(bbox('line-cyprus-1974'), 32.5, 34.9, 34.2, 35.3)).toBe(true);
    expect(inside(bbox('line-western-sahara-berm'), -17.2, 21, -8.5, 28)).toBe(true);
  });
});
