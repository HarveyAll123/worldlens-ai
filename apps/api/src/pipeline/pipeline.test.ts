import { describe, expect, it } from 'vitest';
import { ProviderHealth } from '../providers/health';
import { parseSeenDate, type GdeltArticle, type NewsProvider } from '../providers/gdelt';
import { categorize } from './categorize';
import { clusterArticles } from './cluster';
import { extractEntities } from './entities';
import { runIngestion } from './ingest';
import { locationCandidates, resolveLocation } from './locate';
import { canonicalizeUrl, dedupeArticles, normalizeGdelt, normalizeRss } from './normalize';
import type { RssItem } from '../providers/rss';

const BASE = Date.UTC(2026, 9, 14, 6, 0, 0);
function seen(minutes: number): string {
  const d = new Date(BASE + minutes * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
}
function art(title: string, domain: string, minutes: number, path = title): GdeltArticle {
  return {
    url: `https://www.${domain}/${encodeURIComponent(path.toLowerCase().replace(/\s+/g, '-'))}?utm_source=x`,
    title,
    seendate: seen(minutes),
    domain,
    language: 'English',
    sourcecountry: 'United States',
    socialimage: 'https://img.example.com/x.jpg',
  };
}

describe('normalisation and dedupe', () => {
  it('canonicalises URLs and strips tracking parameters', () => {
    expect(canonicalizeUrl('http://WWW.Example.com/a/?utm_source=x&id=2#frag')).toBe(
      'https://www.example.com/a?id=2',
    );
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
  });
  it('parses GDELT seendate', () => {
    expect(parseSeenDate('20261014T060000Z')).toBe(BASE);
    expect(parseSeenDate('bad')).toBeNull();
  });
  it('drops malformed records and sanitises headlines', () => {
    const out = normalizeGdelt([
      art('<b>Quake</b> hits Sulawesi', 'reuters.com', 0),
      { ...art('x', 'a.com', 0), url: 'not a url' },
      { ...art('y', 'a.com', 0), seendate: 'garbage' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.headline).toBe('Quake hits Sulawesi');
    expect(out[0]!.source.name).toBe('Reuters');
    expect(out[0]!.source.rating.value).toBe('UNRATED');
  });
  it('removes exact and same-publisher near-duplicates but keeps other publishers', () => {
    const n = normalizeGdelt([
      art('Quake hits Sulawesi, dozens hurt', 'reuters.com', 0, 'a'),
      art('Quake hits Sulawesi, dozens hurt', 'reuters.com', 5, 'a'),
      art('Quake hits Sulawesi; dozens hurt', 'reuters.com', 6, 'b'),
      art('Quake hits Sulawesi, dozens hurt', 'apnews.com', 7, 'c'),
    ]);
    const d = dedupeArticles(n);
    expect(d).toHaveLength(2);
    expect(d.find((a) => a.domain === 'reuters.com')!.duplicates).toBe(2);
  });
});

describe('entities, location and category', () => {
  it('extracts places, countries, regions and acronyms deterministically', () => {
    const e = extractEntities(
      "Russian missile strike hits Kharkiv as UN urges restraint in Ukraine's east",
    );
    expect(e.places.map((p) => p.name)).toContain('Kharkiv');
    expect(e.countries).toContain('UKR');
    expect(e.demonyms).toContain('RUS');
    expect(e.organizations).toContain('United Nations');
    const lower = extractEntities('who will tell us what happened');
    expect(lower.organizations).toHaveLength(0);
    expect(lower.countries).toHaveLength(0);
    expect(
      extractEntities('Tensions rise in the South China Sea').regions.map((r) => r.name),
    ).toEqual(['South China Sea']);
  });
  it('prefers a specific place over the containing country', () => {
    const loc = resolveLocation([
      locationCandidates(extractEntities('Missile strike hits Kharkiv, Ukraine')),
    ]);
    expect(loc?.name).toMatch(/Kharkiv/);
    expect(loc?.precision).toBe('city');
  });
  it('does not invent a location when none is mentioned', () => {
    expect(
      resolveLocation([locationCandidates(extractEntities('Markets rally on rate cut hopes'))]),
    ).toBeNull();
  });
  it('categorises headlines', () => {
    expect(categorize('Magnitude 6.8 earthquake strikes off Sulawesi').category).toBe('disaster');
    expect(categorize('Navy holds drills near Taiwan').category).toBe('military');
    expect(categorize('Ministers hold trade talks in Geneva').category).not.toBe('military');
  });
});

describe('clustering', () => {
  const titles = (c: ReturnType<typeof clusterArticles>[number]) =>
    c.members.map((m) => m.article.headline);

  it('groups different publishers covering the same event', () => {
    const clusters = clusterArticles(
      normalizeGdelt([
        art('Magnitude 6.8 earthquake strikes off Sulawesi, Indonesia', 'reuters.com', 0),
        art(
          "Strong quake hits Indonesia's Sulawesi island, tsunami warning issued",
          'apnews.com',
          20,
        ),
        art('Sulawesi earthquake kills at least 12, officials say', 'bbc.com', 90),
        art('Indonesia Sulawesi quake: rescuers search for survivors', 'aljazeera.com', 180),
      ]),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members).toHaveLength(4);
    expect(clusters[0]!.category).toBe('disaster');
  });

  it('keeps distinct attacks in different cities of the same country apart', () => {
    const clusters = clusterArticles(
      normalizeGdelt([
        art('Missile strike kills five in Kharkiv apartment block', 'reuters.com', 0),
        art('Drone attack hits Odesa port infrastructure', 'apnews.com', 30),
        art('Kharkiv strike: death toll rises to seven', 'bbc.com', 120),
        art('Odesa port damaged in overnight drone attack', 'kyivindependent.com', 140),
      ]),
    );
    expect(clusters).toHaveLength(2);
    for (const c of clusters) {
      const t = titles(c).join(' ');
      expect(t.includes('Kharkiv') && t.includes('Odesa')).toBe(false);
    }
  });

  it('separates unrelated stories that mention the same countries', () => {
    const clusters = clusterArticles(
      normalizeGdelt([
        art('China holds military drills near Taiwan', 'reuters.com', 0),
        art('Taiwan and China officials hold trade talks on tariffs', 'scmp.com', 10),
      ]),
    );
    expect(clusters).toHaveLength(2);
  });

  it('does not merge stories days apart', () => {
    const clusters = clusterArticles(
      normalizeGdelt([
        art('Flooding forces evacuations in Sylhet, Bangladesh', 'reuters.com', 0),
        art('Flooding forces evacuations in Sylhet, Bangladesh again', 'apnews.com', 60 * 24 * 4),
      ]),
    );
    expect(clusters).toHaveLength(2);
  });
});

describe('ingestion run', () => {
  it('survives provider failure and records the error', async () => {
    const failing: NewsProvider = {
      name: 'gdelt',
      fetchRecent: async () => {
        throw new Error('boom');
      },
    };
    const health = new ProviderHealth();
    const { run, events } = await runIngestion({
      provider: failing,
      queries: ['q'],
      health,
      nowMs: BASE,
    });
    expect(events).toHaveLength(0);
    expect(run.errors[0]).toContain('boom');
    expect(health.get('gdelt').state).toBe('down');
  });

  it('builds located events with attached sources and confidence', async () => {
    const provider: NewsProvider = {
      name: 'gdelt',
      fetchRecent: async () => [
        art('Magnitude 6.8 earthquake strikes off Sulawesi, Indonesia', 'reuters.com', 0),
        art("Strong quake hits Indonesia's Sulawesi island", 'apnews.com', 20),
        art('Markets rally on rate cut hopes', 'wsj.com', 30),
      ],
    };
    const health = new ProviderHealth();
    const { run, events } = await runIngestion({
      provider,
      queries: ['q'],
      health,
      nowMs: BASE + 3_600_000,
    });
    expect(run.fetched).toBe(3);
    expect(events).toHaveLength(1); // the market story has no location and is not placed
    const ev = events[0]!.event;
    expect(ev.kind).toBe('news');
    expect(ev.isDemo).toBe(false);
    expect(ev.sourceCount).toBe(2);
    expect(ev.location.name).toMatch(/Sulawesi/);
    expect(ev.confidence).toBeGreaterThan(0.4);
    expect(ev.image?.cachingPermitted).toBe(false);
    expect(health.get('gdelt').state).toBe('ok');
  });
});

describe('normalizeRss', () => {
  const feed = {
    name: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    domain: 'bbc.co.uk',
    country: 'GB',
    language: 'en',
    verified: true,
  };
  const item = (over: Partial<RssItem> = {}): RssItem => ({
    title: 'Quake hits Sulawesi, dozens hurt',
    link: 'https://www.bbc.co.uk/news/world-123?utm_source=rss&utm_medium=feed#top',
    published: 'Tue, 14 Oct 2026 06:00:00 GMT',
    summary: '<p>A short <b>lede</b> about the quake.</p>',
    feed,
    ...over,
  });

  it('marks the origin, strips tracking and HTML, keeps the feed publisher', () => {
    const [a] = normalizeRss([item()], BASE + 3_600_000);
    expect(a!.origin).toBe('rss');
    expect(a!.url).toBe('https://www.bbc.co.uk/news/world-123');
    expect(a!.snippet).toBe('A short lede about the quake.');
    expect(a!.domain).toBe('bbc.co.uk');
    expect(a!.source.rating.value).toBe('UNRATED');
    expect(a!.publishedAtMs).toBe(BASE);
  });

  it('drops items without a usable date instead of stamping the fetch time', () => {
    expect(normalizeRss([item({ published: null })], BASE)).toHaveLength(0);
    expect(normalizeRss([item({ published: 'not a date' })], BASE)).toHaveLength(0);
  });

  it('drops items dated far in the future', () => {
    expect(normalizeRss([item({ published: 'Fri, 16 Oct 2026 06:00:00 GMT' })], BASE)).toHaveLength(
      0,
    );
  });

  it('truncates long headlines and snippets', () => {
    const [a] = normalizeRss(
      [{ ...item(), title: 'T'.repeat(900), summary: 'S'.repeat(900) }],
      BASE + 3_600_000,
    );
    expect(a!.headline.length).toBeLessThanOrEqual(400);
    expect(a!.snippet!.length).toBeLessThanOrEqual(300);
  });
});
