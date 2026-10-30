import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseFeed, RssProvider, RSS_FEEDS, type RssFeedConfig } from './rss';

const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, '__fixtures__', name), 'utf8');

const FEED_A: RssFeedConfig = {
  name: 'Feed A',
  url: 'https://a.example.org/feed.xml',
  domain: 'a.example.org',
  country: 'GB',
  language: 'en',
  verified: true,
};
const FEED_B: RssFeedConfig = {
  name: 'Feed B',
  url: 'https://b.example.org/feed.xml',
  domain: 'b.example.org',
  country: 'US',
  language: 'en',
  verified: true,
};

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/xml' }, ...init });
}

describe('parseFeed', () => {
  it('parses RSS 2.0 with CDATA, entities and RFC 822 dates', () => {
    const feed = parseFeed(fixture('rss2.xml'));
    expect(feed.kind).toBe('rss');
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]!.title).toBe('Quake hits Sulawesi, dozens hurt');
    expect(feed.items[0]!.link).toBe(
      'https://www.example.com/world/quake?utm_source=rss&utm_medium=feed',
    );
    expect(feed.items[0]!.published).toBe('Tue, 14 Oct 2026 06:00:00 GMT');
    expect(feed.items[0]!.summary).toContain('magnitude 6.8 quake');
    expect(feed.items[1]!.title).toBe('Flooding forces evacuations in Sylhet & nearby districts');
  });

  it('parses Atom with link href and ISO dates', () => {
    const feed = parseFeed(fixture('atom.xml'));
    expect(feed.kind).toBe('atom');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]!.link).toBe('https://atom.example.org/story/kharkiv');
    expect(feed.items[0]!.published).toBe('2026-10-14T07:15:00Z');
  });

  it('parses RSS 1.0 / RDF with dc:date', () => {
    const feed = parseFeed(fixture('rdf.xml'));
    expect(feed.kind).toBe('rdf');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]!.title).toBe('Trade ministers meet in Geneva');
    expect(feed.items[0]!.published).toBe('2026-10-14T08:00:00Z');
  });

  it('returns no items for malformed XML instead of throwing', () => {
    expect(parseFeed(fixture('malformed.xml')).items).toEqual([]);
  });

  it('throws for a document that is not a feed', () => {
    expect(() => parseFeed('<html><body>nope</body></html>')).toThrow('not a feed');
  });

  it('returns no items for an empty channel', () => {
    expect(parseFeed(fixture('empty.xml')).items).toEqual([]);
  });

  it('never expands DOCTYPE entities', () => {
    const feed = parseFeed(fixture('doctype-entities.xml'));
    expect(feed.items[0]!.title).toContain('&xxe;');
    expect(feed.items[0]!.title).toContain('&hello;');
    expect(feed.items[0]!.title).not.toContain('EXPANDED');
  });
});

describe('RssProvider', () => {
  it('keeps the other feeds when one fails', async () => {
    const fetchImpl = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes('a.example')) return response('<html>blocked</html>');
      return response(fixture('rss2.xml'));
    });
    const provider = new RssProvider({ feeds: [FEED_A, FEED_B], fetchImpl });
    const { items, errors } = await provider.fetchRecent({ maxItems: 10 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Feed A');
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.feed.name === 'Feed B')).toBe(true);
  });

  it('records a backoff after a 5xx and skips the feed while it lasts', async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 }));
    const provider = new RssProvider({ feeds: [FEED_A], fetchImpl, now: () => now });
    expect((await provider.fetchRecent({ maxItems: 5 })).items).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 1_000;
    expect((await provider.fetchRecent({ maxItems: 5 })).items).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 60_000;
    await provider.fetchRecent({ maxItems: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('treats 304 as an unchanged feed', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304 }));
    const provider = new RssProvider({ feeds: [FEED_A], fetchImpl });
    const { items, errors } = await provider.fetchRecent({ maxItems: 5 });
    expect(items).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('rejects a feed above the size cap', async () => {
    const huge = `<rss><channel><item><title>${'x'.repeat(600_000)}</title><link>https://a.example.org/x</link></item></channel></rss>`;
    const fetchImpl = vi.fn(async () => response(huge));
    const provider = new RssProvider({ feeds: [FEED_A], fetchImpl });
    const { items, errors } = await provider.fetchRecent({ maxItems: 5 });
    expect(items).toHaveLength(0);
    expect(errors[0]).toContain('too large');
  });

  it('caps the number of items per feed', async () => {
    const fetchImpl = vi.fn(async () => response(fixture('rss2.xml')));
    const provider = new RssProvider({ feeds: [FEED_A], fetchImpl });
    const { items } = await provider.fetchRecent({ maxItems: 1 });
    expect(items).toHaveLength(1);
  });

  it('only requests the configured URLs', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: string | Request) => {
      seen.push(String(input));
      return response(fixture('rss2.xml'));
    });
    await new RssProvider({ feeds: [FEED_A, FEED_B], fetchImpl }).fetchRecent({ maxItems: 5 });
    expect(seen.sort()).toEqual([FEED_A.url, FEED_B.url].sort());
  });

  it('ships only HTTPS feeds', () => {
    for (const f of RSS_FEEDS) expect(f.url.startsWith('https://')).toBe(true);
  });
});
