import { describe, expect, it } from 'vitest';
import { ProviderHealth } from '../providers/health';
import { runCombinedIngestion, type FallbackStore, type IngestionSource } from './ingest';
import { unknownSource, type NormalizedArticle } from './normalize';

const BASE = Date.UTC(2026, 9, 14, 6, 0, 0);

function mk(
  origin: 'gdelt' | 'rss',
  domain: string,
  headline: string,
  minutes: number,
): NormalizedArticle {
  return {
    id: `art-${origin}-${domain}-${minutes}`,
    origin,
    url: `https://${domain}/${minutes}/${encodeURIComponent(headline.slice(0, 24))}`,
    headline,
    publishedAtMs: BASE + minutes * 60_000,
    domain,
    language: 'en',
    sourceCountry: null,
    imageUrl: null,
    source: unknownSource(domain, null),
    duplicates: 0,
  };
}

function source(
  name: string,
  items: NormalizedArticle[],
  opts: { fail?: boolean } = {},
): IngestionSource {
  return {
    name,
    fetch: async () => {
      if (opts.fail) throw new Error(`${name} unreachable`);
      return items;
    },
    normalize: (raw) => raw as NormalizedArticle[],
  };
}

describe('combined ingestion', () => {
  it('merges both providers into one run and one cluster', async () => {
    const health = new ProviderHealth();
    const gdelt = source('gdelt', [
      mk('gdelt', 'reuters.com', 'Magnitude 6.8 earthquake strikes off Sulawesi, Indonesia', 0),
    ]);
    const rss = source('rss', [
      mk('rss', 'bbc.co.uk', "Strong quake hits Indonesia's Sulawesi island", 20),
    ]);
    const { run, events } = await runCombinedIngestion({
      sources: [gdelt, rss],
      health,
      nowMs: BASE + 3_600_000,
    });
    expect(run.sources.map((s) => s.name)).toEqual(['gdelt', 'rss']);
    expect(run.fetched).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]!.event.sourceCount).toBe(2);
    expect(events[0]!.articles.map((a) => a.origin).sort()).toEqual(['gdelt', 'rss']);
    expect(health.get('gdelt').state).toBe('ok');
    expect(health.get('rss').state).toBe('ok');
  });

  it('keeps going when GDELT fails', async () => {
    const health = new ProviderHealth();
    const { run, events } = await runCombinedIngestion({
      sources: [
        source('gdelt', [], { fail: true }),
        source('rss', [
          mk('rss', 'bbc.co.uk', 'Flooding forces evacuations in Sylhet, Bangladesh', 0),
        ]),
      ],
      health,
      nowMs: BASE + 3_600_000,
    });
    expect(events).toHaveLength(1);
    expect(run.sources[0]).toMatchObject({ name: 'gdelt', failed: true, kept: 0 });
    expect(run.sources[1]).toMatchObject({ name: 'rss', failed: false, kept: 1 });
    expect(health.get('gdelt').state).toBe('down');
    expect(health.get('rss').state).toBe('ok');
  });

  it('keeps going when RSS fails', async () => {
    const health = new ProviderHealth();
    const { run, events } = await runCombinedIngestion({
      sources: [
        source('gdelt', [
          mk('gdelt', 'reuters.com', 'Flooding forces evacuations in Sylhet, Bangladesh', 0),
        ]),
        source('rss', [], { fail: true }),
      ],
      health,
      nowMs: BASE + 3_600_000,
    });
    expect(events).toHaveLength(1);
    expect(run.sources[1]).toMatchObject({ name: 'rss', failed: true });
    expect(health.get('rss').state).toBe('down');
  });

  it('produces no events when both sources fail', async () => {
    const { run, events } = await runCombinedIngestion({
      sources: [source('gdelt', [], { fail: true }), source('rss', [], { fail: true })],
      health: new ProviderHealth(),
      nowMs: BASE,
    });
    expect(events).toHaveLength(0);
    expect(run.errors).toHaveLength(2);
    expect(run.sources.every((s) => s.failed)).toBe(true);
  });

  it('reuses the last good batch inside the fallback window', async () => {
    const fallback: FallbackStore = new Map();
    const health = new ProviderHealth();
    await runCombinedIngestion({
      sources: [
        source('gdelt', [mk('gdelt', 'reuters.com', 'Quake hits Sulawesi', 0)]),
        source('rss', [mk('rss', 'bbc.co.uk', 'Quake hits Sulawesi island', 5)]),
      ],
      health,
      nowMs: BASE,
      fallback,
    });
    const second = await runCombinedIngestion({
      sources: [
        source('gdelt', [], { fail: true }),
        source('rss', [mk('rss', 'bbc.co.uk', 'Quake hits Sulawesi island', 5)]),
      ],
      health,
      nowMs: BASE + 6 * 3_600_000,
      fallback,
    });
    expect(second.run.sources[0]).toMatchObject({
      name: 'gdelt',
      failed: true,
      usedFallback: true,
    });
    expect(second.run.sources[0]!.kept).toBe(1);
    expect(second.events.length).toBeGreaterThan(0);
  });

  it('drops a fallback batch that is older than the window', async () => {
    const fallback: FallbackStore = new Map([
      [
        'gdelt',
        { articles: [mk('gdelt', 'reuters.com', 'Old quake story', 0)], fetchedAtMs: BASE },
      ],
    ]);
    const { run, events } = await runCombinedIngestion({
      sources: [source('gdelt', [], { fail: true })],
      health: new ProviderHealth(),
      nowMs: BASE + 13 * 3_600_000,
      fallback,
    });
    expect(run.sources[0]).toMatchObject({ failed: true, kept: 0, usedFallback: false });
    expect(events).toHaveLength(0);
  });

  it('dedupes the same URL reported by both providers', async () => {
    const shared = mk('gdelt', 'reuters.com', 'Trade ministers meet in Geneva', 0);
    const copy = { ...shared, id: 'art-rss-copy', origin: 'rss' as const };
    const { run } = await runCombinedIngestion({
      sources: [source('gdelt', [shared]), source('rss', [copy])],
      health: new ProviderHealth(),
      nowMs: BASE + 3_600_000,
    });
    expect(run.normalized).toBe(2);
    expect(run.deduplicated).toBe(1);
  });

  it('reports per-source fetched and kept counts', async () => {
    const { run } = await runCombinedIngestion({
      sources: [
        source('gdelt', [
          mk('gdelt', 'reuters.com', 'A quake in Sulawesi', 0),
          mk('gdelt', 'reuters.com', 'A flood in Sylhet', 1),
        ]),
        source('rss', [mk('rss', 'bbc.co.uk', 'A quake in Sulawesi', 2)]),
      ],
      health: new ProviderHealth(),
      nowMs: BASE + 3_600_000,
    });
    expect(run.sources[0]).toMatchObject({ fetched: 2, kept: 2 });
    expect(run.sources[1]).toMatchObject({ fetched: 1, kept: 1 });
  });
});
