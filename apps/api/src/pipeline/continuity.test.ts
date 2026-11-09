import { describe, expect, it } from 'vitest';
import { toIso } from '@worldlens/shared';
import { MemoryRepository } from '../data/memory-repository';
import type { ListEventsQuery } from '../data/repository';
import type { PlaceHint } from '../providers/gdelt';
import { CONGRESS, copy, DC, ingestWindow as run, MIN, NOW, publisherOf } from '../testing/stories';
import { continueStories, duplicateCopies, headlineKey, type PriorEvent } from './continuity';

const HOUR = 60 * MIN;
const FLOODS = 'Floods hit Selangor as thousands are evacuated overnight';
const SELANGOR: PlaceHint = {
  name: 'Selangor, Malaysia',
  lat: 3.07,
  lon: 101.52,
  precision: 'region',
};

/** An event an earlier run stored (in the database: ids only, no article objects). */
function prior(id: string, articleIds: string[], o: Partial<PriorEvent> = {}): PriorEvent {
  return {
    id,
    title: CONGRESS,
    startMs: NOW - 200 * MIN,
    endMs: NOW - 100 * MIN,
    lat: DC.lat,
    lon: DC.lon,
    precision: 'city',
    countryCode: 'USA',
    articleIds: new Set(articleIds),
    sourceIds: new Set(articleIds.map(publisherOf)),
    ...o,
  };
}

const live: ListEventsQuery = {
  mode: 'live',
  timeMs: NOW,
  resolution: 'day',
  nowMs: NOW,
  bbox: null,
  kinds: ['news'],
  includeDemo: false,
  limit: 100,
};

const titled = async (repo: MemoryRepository, title: string) =>
  (await repo.listEvents(live)).events.filter((e) => e.title === title);

describe('one event per story across ingestion runs', () => {
  it('a story re-clustered with an earlier first article stays one event under its first id', async () => {
    const repo = new MemoryRepository();
    // The first run after a restart reads only the newest GDELT files…
    const first = await run([copy('apnews.com', 30), copy('wtop.com', 20), copy('kxan.com', 10)]);
    expect(first).toHaveLength(1);
    const id = first[0]!.event.id;
    await repo.replaceLiveNews(first, NOW);
    // …the next reads older ones too: the cluster's first article, and so its own id, change.
    const second = await run([
      copy('apnews.com', 30),
      copy('wtop.com', 20),
      copy('kxan.com', 10),
      copy('wral.com', 150),
      copy('kare11.com', 120),
    ]);
    expect(second[0]!.event.id).not.toBe(id);
    await repo.replaceLiveNews(second, NOW);

    const copies = await titled(repo, CONGRESS);
    expect(copies.map((e) => e.id)).toEqual([id]);
    expect(copies[0]).toMatchObject({ articleCount: 5, sourceCount: 5 });
    expect(copies[0]!.time.start).toBe(toIso(NOW - 150 * MIN));
  });

  it('as the window slides on, the story keeps its id, first report and coverage', async () => {
    const repo = new MemoryRepository();
    const before = await run([copy('apnews.com', 300), copy('wtop.com', 200)]);
    await repo.replaceLiveNews(before, NOW);
    // The 300-minute copy has left the window; another outlet reported since.
    await repo.replaceLiveNews(await run([copy('wtop.com', 200), copy('kxan.com', 10)]), NOW);

    const [story, ...more] = await titled(repo, CONGRESS);
    expect(more).toHaveLength(0);
    expect(story!.id).toBe(before[0]!.event.id);
    expect(story).toMatchObject({ articleCount: 3, sourceCount: 3 });
    expect(story!.time.start).toBe(toIso(NOW - 300 * MIN));
    expect(await repo.getArticles(story!.id, NOW)).toHaveLength(3);
  });

  it('copies left by earlier runs are merged into the one that goes on; their ids lead there', async () => {
    const repo = new MemoryRepository();
    const reworded = 'Congress returns to a changed Washington after election wipeout for GOP';
    const one = await run([copy('apnews.com', 90)]);
    await repo.replaceLiveNews(one, NOW);
    // Another wording, no article in common: a second copy of the story.
    const two = await run([copy('wtop.com', 40, reworded)]);
    await repo.replaceLiveNews(two, NOW);
    expect((await repo.listEvents(live)).events).toHaveLength(2);

    // A run that sees both clusters them together.
    await repo.replaceLiveNews(
      await run([copy('apnews.com', 90), copy('wtop.com', 40, reworded)]),
      NOW,
    );
    const events = (await repo.listEvents(live)).events;
    expect(events.map((e) => e.id)).toEqual([one[0]!.event.id]);
    expect(events[0]).toMatchObject({ articleCount: 2, sourceCount: 2 });
    // An open card or a link in a chat to the merged copy still finds the story.
    expect((await repo.getEvent(two[0]!.event.id, NOW))?.id).toBe(one[0]!.event.id);
    expect(await repo.getArticles(two[0]!.event.id, NOW)).toHaveLength(2);
  });

  it('the stored copies a run continues add up: earliest start, all articles and sources', async () => {
    const [story] = await run([
      copy('apnews.com', 30),
      copy('wtop.com', 20),
      copy('kxan.com', 10),
      copy('wral.com', 150),
    ]);
    const { events, mergedInto } = continueStories(
      [story!],
      [
        prior('news-stored-first', ['art-apnews.com-30', 'art-wtop.com-20'], {
          startMs: NOW - 30 * MIN,
          endMs: NOW - 20 * MIN,
        }),
        // Its other article left the window; the one it still has is in this cluster.
        prior('news-stored-again', ['art-kxan.com-10', 'art-gone.com-900'], {
          startMs: NOW - 900 * MIN,
          endMs: NOW - 10 * MIN,
        }),
      ],
    );
    const e = events[0]!;
    expect(e.event.id).toBe('news-stored-first');
    expect([...mergedInto]).toEqual([['news-stored-again', 'news-stored-first']]);
    expect(e.carriedArticleIds).toEqual(['art-gone.com-900']);
    expect(e.event.articleCount).toBe(5);
    // Its four outlets and gone.com.
    expect(e.event.sourceCount).toBe(5);
    expect(e.event.importance).toBe(3);
    expect(e.event.time.start).toBe(toIso(NOW - 900 * MIN));
  });

  it('the same specific headline at the same place within 72 hours goes on without shared articles', async () => {
    // After a restart the window refills from the newest file: nothing in common with the copy
    // stored before, only the headline.
    const [story] = await run([copy('kxan.com', 10)]);
    const stored = prior('news-before-restart', ['art-apnews.com-400'], {
      startMs: NOW - 400 * MIN,
      endMs: NOW - 400 * MIN,
    });
    const e = continueStories([story!], [stored]).events[0]!;
    expect(e.event.id).toBe('news-before-restart');
    expect(e.carriedArticleIds).toEqual(['art-apnews.com-400']);
    expect(e.event.articleCount).toBe(2);
    // GDELT places "Washington" in the city or in the state: the same country is enough then.
    const state = prior('news-in-the-state', [], {
      lat: 47.4,
      lon: -120.5,
      precision: 'region',
    });
    expect(continueStories([story!], [state]).events[0]!.event.id).toBe('news-in-the-state');
  });

  it('a short, distant or old headline match is another story', async () => {
    const [story] = await run([copy('kxan.com', 10)]);
    const id = story!.event.id;
    const goesOn = (p: PriorEvent) => continueStories([story!], [p]).events[0]!.event.id !== id;
    expect(goesOn(prior('news-london', [], { lat: 51.5, lon: -0.13, countryCode: 'GBR' }))).toBe(
      false,
    );
    expect(goesOn(prior('news-seattle', [], { lat: 47.6, lon: -122.33 }))).toBe(false);
    expect(
      goesOn(
        prior('news-last-week', [], { startMs: NOW - 4 * 24 * HOUR, endMs: NOW - 4 * 24 * HOUR }),
      ),
    ).toBe(false);
    const [short] = await run([copy('kxan.com', 10, 'Live updates')]);
    const stored = prior('news-live-updates', [], { title: 'Live updates' });
    expect(continueStories([short!], [stored]).events[0]!.event.id).toBe(short!.event.id);
  });

  it('the cluster holding most of an earlier event goes on with it, not one with a stray article', async () => {
    const events = await run([
      copy('apnews.com', 30),
      copy('wtop.com', 20),
      copy('kxan.com', 10),
      copy('reuters.com', 25, FLOODS, SELANGOR),
    ]);
    const congress = events.find((b) => b.event.title === CONGRESS)!;
    const floods = events.find((b) => b.event.title === FLOODS)!;
    // Two of its three articles went to the Congress cluster, one to the floods cluster — and
    // its id is the one the floods cluster would take for itself.
    const stored = prior(floods.event.id, [
      'art-apnews.com-30',
      'art-wtop.com-20',
      'art-reuters.com-25',
    ]);
    const { events: out, mergedInto } = continueStories(events, [stored]);
    const ids = out.map((b) => b.event.id);
    expect(ids[events.indexOf(congress)]).toBe(floods.event.id);
    expect(ids[events.indexOf(floods)]).not.toBe(floods.event.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mergedInto.size).toBe(0);
  });

  it('new stories keep their own ids', async () => {
    const events = await run([copy('kxan.com', 10), copy('reuters.com', 25, FLOODS, SELANGOR)]);
    const { events: out, mergedInto } = continueStories(events, [
      prior('news-unrelated', ['art-other.com-5'], {
        title: 'Parliament passes the budget in Canberra',
      }),
    ]);
    expect(out.map((b) => b.event.id)).toEqual(events.map((b) => b.event.id));
    expect(out.every((b) => b.carriedArticleIds.length === 0)).toBe(true);
    expect(mergedInto.size).toBe(0);
  });

  it('headline keys ignore case, accents and punctuation; short headlines have none', () => {
    expect(headlineKey('Floods hit Selangor – 3,000 evacuated')).toBe(
      'floods hit selangor 3 000 evacuated',
    );
    expect(headlineKey('São Paulo protesters march downtown again')).toBe(
      'sao paulo protesters march downtown again',
    );
    expect(headlineKey('Live updates')).toBeNull();
  });
});

describe('copies stored before stories kept their ids', () => {
  it('are grouped under the copy with the most articles', () => {
    const into = duplicateCopies([
      prior('news-kept', ['art-a.com-1', 'art-b.com-2', 'art-c.com-3', 'art-d.com-4']),
      // All its articles are in the kept one.
      prior('news-subset', ['art-b.com-2', 'art-c.com-3']),
      // Another wording; half its articles are in the kept one.
      prior('news-reworded', ['art-d.com-4', 'art-e.com-5'], {
        title: 'Congress is back in a Washington changed by the midterms',
      }),
      // No article in common, but the same headline close by.
      prior('news-same-headline', ['art-f.com-6'], {
        startMs: NOW - 30 * HOUR,
        endMs: NOW - 29 * HOUR,
      }),
    ]);
    expect(Object.fromEntries(into)).toEqual({
      'news-subset': 'news-kept',
      'news-reworded': 'news-kept',
      'news-same-headline': 'news-kept',
    });
  });

  it('a stray shared article, or the same headline a month apart, is not one story', () => {
    const into = duplicateCopies([
      prior('news-congress', ['art-a.com-1', 'art-b.com-2', 'art-c.com-3', 'art-d.com-4']),
      prior('news-budget', ['art-a.com-1', 'art-x.com-1', 'art-y.com-1', 'art-z.com-1'], {
        title: 'Parliament passes the budget in Canberra after a long night',
      }),
      prior('news-last-month', ['art-g.com-7'], {
        startMs: NOW - 30 * 24 * HOUR,
        endMs: NOW - 30 * 24 * HOUR,
      }),
    ]);
    expect(into.size).toBe(0);
  });
});
