import { describe, expect, it } from 'vitest';
import { WikipediaNewsProvider } from '../providers/wikipedia-news';
import { MemoryRepository } from './memory-repository';
import { WithPastNews } from './past-news';
import type { ListEventsQuery } from './repository';

const PAGE = `'''Disasters and accidents'''
*Six people are killed when their helicopter crashes near [[Joshimath]], [[Uttarakhand]], [[India]]. [https://www.reuters.com/a (Reuters)]`;

function repo() {
  const fetchImpl = (async (url: string | Request) => {
    const titles = new URL(typeof url === 'string' ? url : url.url).searchParams
      .get('titles')!
      .split('|');
    const pages = titles.map((title) =>
      title === 'Portal:Current events/2026 October 30'
        ? { title, revisions: [{ slots: { main: { content: PAGE } } }] }
        : { title, missing: true },
    );
    return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
  }) as typeof fetch;
  const now = Date.parse('2026-11-10T00:00:00Z');
  return new WithPastNews(
    new MemoryRepository(),
    new WikipediaNewsProvider('test', fetchImpl, () => now),
  );
}

const q = (o: Partial<ListEventsQuery>): ListEventsQuery => ({
  mode: 'historical',
  timeMs: Date.parse('2026-10-30T12:00:00Z'),
  resolution: 'day',
  nowMs: Date.parse('2026-11-10T00:00:00Z'),
  bbox: null,
  kinds: ['news', 'historical'],
  includeDemo: false,
  limit: 100,
  ...o,
});

describe('news of the past on the timeline', () => {
  it('a day since 2000 lists its news; opened by id, with its outlets; no Take Action', async () => {
    const r = repo();
    const day = await r.listEvents(q({}));
    const news = day.events.filter((e) => e.id.startsWith('wnews-'));
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ kind: 'news', category: 'disaster' });
    const full = await r.getEvent(news[0]!.id, Date.now());
    expect(full?.title).toMatch(/helicopter crashes/);
    const articles = await r.getArticles(news[0]!.id, Date.now());
    expect(articles.map((a) => a.url)).toEqual(['https://www.reuters.com/a']);
    const sources = await r.getSources(articles.map((a) => a.sourceId));
    expect(sources.map((s) => s.domain)).toEqual(['reuters.com']);
    expect(r.actionOptions(full!)).toEqual([]);
  });

  it('only for the past and for news: not LIVE, not history-only views, not elsewhere on the map', async () => {
    const r = repo();
    const has = async (o: Partial<ListEventsQuery>) =>
      (await r.listEvents(q(o))).events.some((e) => e.id.startsWith('wnews-'));
    expect(await has({ mode: 'live' })).toBe(false);
    expect(await has({ kinds: ['historical'] })).toBe(false);
    expect(await has({ bbox: { west: -10, south: 35, east: 30, north: 60 } })).toBe(false);
    expect(await has({ timeMs: Date.UTC(1995, 5, 1) })).toBe(false);
  });
});

/* ------------------------------------------------------------- the assistant's search */

const FUKUSHIMA = `'''Disasters and accidents'''
*[[2011 Tōhoku earthquake and tsunami]]
**[[Fukushima Daiichi nuclear disaster]]
***A hydrogen explosion damages a reactor building at the nuclear plant in [[Ōkuma, Fukushima|Ōkuma]], [[Japan]]. [https://www.bbc.co.uk/news/x (BBC)]
'''Sports'''
*Six teams reach the quarter-finals of the cup in [[Madrid]], [[Spain]]. [https://www.reuters.com/s (Reuters)]`;

const CONCORDE = `==Events==
===July===
* [[July 25]] – [[Air France Flight 4590]], a [[Concorde]], crashes after take-off from [[Paris]], [[France]], killing 113 people.`;

function searchable() {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | Request) => {
    const u = new URL(typeof url === 'string' ? url : url.url);
    calls.push(
      u.searchParams.get('list') === 'search'
        ? `search:${u.searchParams.get('srsearch')}`
        : `pages:${u.searchParams.get('titles')}`,
    );
    if (u.searchParams.get('list') === 'search') {
      const search = u.searchParams.get('srsearch')!.startsWith('Fukushima')
        ? [
            { title: 'Portal:Current events/2011 March 14' },
            { title: 'Portal:Current events/March 2011' },
          ]
        : [];
      return new Response(JSON.stringify({ query: { search } }), { status: 200 });
    }
    const pages = u.searchParams
      .get('titles')!
      .split('|')
      .map((title) =>
        title === 'Portal:Current events/2011 March 14'
          ? { title, revisions: [{ slots: { main: { content: FUKUSHIMA } } }] }
          : title === '2000'
            ? { title, revisions: [{ slots: { main: { content: CONCORDE } } }] }
            : { title, missing: true },
      );
    return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
  }) as typeof fetch;
  const now = Date.parse('2026-11-10T00:00:00Z');
  const r = new WithPastNews(
    new MemoryRepository(),
    new WikipediaNewsProvider('test', fetchImpl, () => now),
  );
  return { r, calls, now };
}

describe("news of the past in the assistant's searches", () => {
  it('finds the days Wikipedia matches, then only the items about it, ranked as news', async () => {
    const { r, calls, now } = searchable();
    const results = await r.search('Fukushima', {
      limit: 10,
      nowMs: now,
      includeDemo: false,
      includePast: true,
    });
    const past = results.filter((x) => x.id.startsWith('wnews-'));
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ type: 'NEWS', subtitle: expect.stringMatching(/Ōkuma|Japan/) });
    expect(past[0]!.title).toMatch(/hydrogen explosion/);
    // Wikipedia's search, with no operators of the user's own; then the matched day (not the
    // monthly page) with the year articles of 2000–2002, in one request.
    expect(calls[0]).toBe('search:Fukushima prefix:Portal:Current events/');
    expect(calls[1]).toBe('pages:Portal:Current events/2011 March 14|2000|2001|2002');
    expect(calls).toHaveLength(2);
    // Opened by id like any past news.
    expect((await r.getEvent(past[0]!.id, now))?.time.start).toBe('2011-03-14T00:00:00Z');
  });

  it('2000–2002 come from the year articles; the bar (no includePast) never asks Wikipedia', async () => {
    const { r, calls, now } = searchable();
    const concorde = await r.search('Concorde crash 2000', {
      limit: 10,
      nowMs: now,
      includeDemo: false,
      includePast: true,
    });
    expect(concorde.some((x) => /Air France Flight 4590/.test(x.title))).toBe(true);
    expect(calls).toEqual(['pages:2000']);
    calls.length = 0;
    await r.search('Fukushima', { limit: 10, nowMs: now, includeDemo: false });
    expect(calls).toEqual([]);
  });

  it('a short period is read whole; a failure leaves the other results', async () => {
    const { r, now } = searchable();
    const inMarch = await r.search('reactor', {
      limit: 10,
      nowMs: now,
      includeDemo: false,
      includePast: true,
      window: {
        startMs: Date.parse('2011-03-10T00:00:00Z'),
        endMs: Date.parse('2011-03-20T00:00:00Z'),
      },
    });
    expect(inMarch.some((x) => /reactor/.test(x.title))).toBe(true);
    const broken = new WithPastNews(
      new MemoryRepository(),
      new WikipediaNewsProvider(
        'test',
        (async () => new Response('', { status: 503 })) as typeof fetch,
        () => now,
      ),
    );
    await expect(
      broken.search('Waterloo', { limit: 5, nowMs: now, includeDemo: false, includePast: true }),
    ).resolves.toEqual(expect.any(Array));
  });
});
