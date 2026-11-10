import { describe, expect, it } from 'vitest';
import {
  PoliticalRatingSchema,
  publisherDomains,
  publisherShard,
  type NewsSource,
  type PublisherEntryRaw,
} from '@worldlens/shared';
import { NEWS_SOURCES } from '@worldlens/shared/data';
import { PublisherDirectory } from '../providers/publisher-directory';
import { unknownSource } from '../pipeline/normalize';
import { describePublishers, publisherPlace } from './publishers';

/** The directory as the web app serves it: one file per hash bucket. */
function directory(listed: Record<string, PublisherEntryRaw>) {
  const files = new Map<number, Record<string, PublisherEntryRaw>>();
  for (const [d, v] of Object.entries(listed))
    files.set(publisherShard(d), { ...files.get(publisherShard(d)), [d]: v });
  const fetched: string[] = [];
  const fetchImpl = (async (url: string | Request) => {
    const u = typeof url === 'string' ? url : url.url;
    fetched.push(u);
    return Response.json(files.get(Number(/(\d\d)\.json$/.exec(u)?.[1])) ?? {});
  }) as typeof fetch;
  return { dir: new PublisherDirectory('https://app.test/data/publishers/', fetchImpl), fetched };
}

describe('publishers: who they are and where they are based', () => {
  it('registry publishers: from their own record ("China (PRC)", a city-state without outline)', () => {
    const xinhua = NEWS_SOURCES.find((s) => s.nationalPerspective === 'China (PRC)')!;
    expect(publisherPlace(xinhua)).toMatchObject({ iso3: 'CHN', name: 'China', basis: 'registry' });
    const hk = NEWS_SOURCES.find((s) => s.nationalPerspective === 'Hong Kong')!;
    expect(publisherPlace(hk)).toMatchObject({ iso3: null, name: 'Hong Kong' });
    const us = NEWS_SOURCES.find((s) => s.nationalPerspective === 'United States')!;
    expect(publisherPlace(us)).toMatchObject({ iso3: 'USA', name: 'United States' });
  });

  it('outlets Wikidata knows: named, typed, owned, placed by headquarters — over GDELT’s list', async () => {
    const { dir } = directory({
      // GDELT's 2018 list put this London-based Saudi daily in Syria; Wikidata knows better.
      'aawsat.com': ['GBR', 'Asharq Al-Awsat', 'd', 'Saudi Research and Media Group', 'Q724844'],
      'wctv.tv': ['USA', 'WCTV', 't', 'Gray Media', 'Q2536991'],
      'xinhua-mirror.example': ['CHN', 'Some State Agency', 's', null, 'Q1'],
    });
    const sources = ['aawsat.com', 'wctv.tv', 'xinhua-mirror.example'].map((d) =>
      unknownSource(d, null),
    );
    const { sources: out, places } = await describePublishers(sources, dir);
    expect(out[0]).toMatchObject({
      name: 'Asharq Al-Awsat',
      format: 'Daily newspaper',
      ownership: 'Saudi Research and Media Group',
      wikidata: 'Q724844',
      sourceType: 'unknown',
    });
    expect(places[sources[0]!.id]).toMatchObject({ iso3: 'GBR', basis: 'wikidata' });
    expect(out[1]).toMatchObject({ name: 'WCTV', format: 'TV station' });
    // A class that is a publisher type sets it.
    expect(out[2]).toMatchObject({ sourceType: 'state-media', format: 'State media' });
  });

  it('a Wikidata alignment is a rating with its source, words and (low/medium) confidence', async () => {
    const { dir } = directory({
      'theguardian.com': [
        'GBR',
        'The Guardian',
        'd',
        null,
        'Q11148',
        'CENTER-LEFT',
        'centre-left',
        1,
      ],
      'example-paper.com': ['USA', 'Example Paper', 'n', null, 'Q2', 'RIGHT', 'right-wing', 0],
    });
    const guardian = NEWS_SOURCES.find((s) => s.domain === 'theguardian.com');
    const sources: NewsSource[] = [
      guardian ?? unknownSource('theguardian.com', null),
      unknownSource('example-paper.com', null),
    ];
    const { sources: out } = await describePublishers(sources, dir);
    expect(out[0]!.rating).toMatchObject({
      value: 'CENTER-LEFT',
      source: 'Wikidata (Q11148)',
      sourceUrl: 'https://www.wikidata.org/wiki/Q11148',
      confidence: 'medium',
      statement: 'centre-left',
    });
    // The registry stays authoritative for its own outlets' names.
    if (guardian) expect(out[0]!.name).toBe(guardian.name);
    expect(out[1]!.rating).toMatchObject({ value: 'RIGHT', confidence: 'low' });
    for (const s of out) expect(PoliticalRatingSchema.safeParse(s.rating).success).toBe(true);
  });

  it('GDELT’s list only places; unknown sites stay as they are; each file is read once', async () => {
    const { dir, fetched } = directory({ 'wsmv.com': 'USA', 'timesofmalta.com': 'Malta' });
    const sources: NewsSource[] = [
      unknownSource('www.wsmv.com', null),
      unknownSource('timesofmalta.com', null),
      unknownSource('nowhere.example', null),
    ];
    const { sources: out, places } = await describePublishers(sources, dir);
    expect(places[sources[0]!.id]).toMatchObject({ iso3: 'USA', basis: 'gdelt-list' });
    expect(out[0]).toEqual(sources[0]);
    expect(places[sources[1]!.id]).toEqual({ iso3: null, name: 'Malta', basis: 'gdelt-list' });
    expect(places[sources[2]!.id]).toBeUndefined();
    const files = fetched.length;
    await describePublishers(sources, dir);
    expect(fetched).toHaveLength(files);
  });

  it('demo outlets are never looked up', async () => {
    const { dir, fetched } = directory({});
    const demo = { ...unknownSource('demo.invalid', null), isDemo: true };
    expect(await describePublishers([demo], dir)).toEqual({ sources: [demo], places: {} });
    expect(fetched).toEqual([]);
  });

  it('looks up the outlet, never a bare ending; files out of reach leave outlets as they are', async () => {
    expect(publisherDomains('www.news.bbc.co.uk')).toEqual(['news.bbc.co.uk', 'bbc.co.uk']);
    expect(publisherDomains('m.example.com')).toEqual(['example.com']);
    const down = new PublisherDirectory(
      'https://app.test/data/publishers/',
      (async () => new Response('', { status: 503 })) as typeof fetch,
    );
    const s = unknownSource('wsmv.com', null);
    expect(await describePublishers([s], down)).toEqual({ sources: [s], places: {} });
  });
});
