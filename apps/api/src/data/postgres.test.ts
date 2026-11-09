/**
 * The PostgreSQL repository's story continuity, against a fake SQL client (no database): which
 * statements it sends and how it reads merged events. postgres.integration.test.ts runs the same
 * SQL against PostgreSQL + PostGIS (`pnpm test:db`).
 */
import { describe, expect, it } from 'vitest';
import { ProviderHealth } from '../providers/health';
import { CONGRESS, copy, DC, ingestWindow, MIN, NOW, publisherOf } from '../testing/stories';
import { MemoryRepository } from './memory-repository';
import { eventToRow, PostgresNewsRepository } from './postgres';
import type { ListEventsQuery } from './repository';
import type { SqlClient, SqlQuery } from './sql';

/** Answers queries from `rows`; records every query and transaction statement. */
class FakeDb implements SqlClient {
  readonly kind = 'node-postgres' as const;
  readonly queries: SqlQuery[] = [];
  readonly transactions: SqlQuery[][] = [];
  constructor(private readonly rows: (text: string, params: unknown[]) => unknown[]) {}
  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    this.queries.push({ text, params });
    return this.rows(text, params) as T[];
  }
  async transaction(queries: SqlQuery[]): Promise<void> {
    this.transactions.push(queries);
  }
  /** The JSON rows a transaction statement wrote. */
  written(table: string): Array<Record<string, unknown>> {
    const q = this.transactions.flat().find((t) => t.text.includes(`insert into ${table} `));
    return JSON.parse(q!.params![0] as string);
  }
}

/** The statement marking events merged (the lookup mentions mergedInto too). */
const isMergeMark = (q: SqlQuery) => q.text.trimStart().startsWith('update events');

function repoOn(db: FakeDb) {
  const health = new ProviderHealth();
  health.register('database', true);
  return { repo: new PostgresNewsRepository(new MemoryRepository(), db, health), health };
}

/** A row of PRIOR_NEWS: a stored event and all its articles. */
const storedCopy = (id: string, articleIds: string[], startMs: number) => ({
  id,
  title: CONGRESS,
  time_start: new Date(startMs),
  time_end: new Date(NOW - 10 * MIN),
  lat: DC.lat,
  lon: DC.lon,
  location_precision: 'city',
  country_code: 'USA',
  article_ids: articleIds,
  source_ids: articleIds.map(publisherOf),
});

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

describe('PostgreSQL repository: one event per story', () => {
  it('continues the stored copy, links its stored articles, then marks the other copy merged', async () => {
    const [story] = await ingestWindow([
      copy('apnews.com', 30),
      copy('wtop.com', 20),
      copy('kxan.com', 10),
    ]);
    const db = new FakeDb((text) =>
      text.includes('lower(e.title) = any')
        ? [
            storedCopy(
              'news-stored-first',
              ['art-apnews.com-30', 'art-gone.com-900'],
              NOW - 900 * MIN,
            ),
            storedCopy('news-stored-again', ['art-wtop.com-20'], NOW - 20 * MIN),
          ]
        : [],
    );
    const { repo, health } = repoOn(db);
    await repo.replaceLiveNews([story!], NOW);
    expect(health.get('database').state).toBe('ok');

    // The lookup asked for this run's articles and headline.
    const lookup = db.queries.find((q) => q.text.includes('lower(e.title) = any'))!;
    expect(lookup.params![0]).toEqual(
      expect.arrayContaining(['art-apnews.com-30', 'art-wtop.com-20', 'art-kxan.com-10']),
    );
    expect(lookup.params![1]).toEqual([CONGRESS.toLowerCase()]);

    const [event] = db.written('events');
    expect(event).toMatchObject({ id: 'news-stored-first', article_count: 4, source_count: 4 });
    expect(event!.time_start).toBe(new Date(NOW - 900 * MIN).toISOString().replace('.000', ''));
    expect(db.written('event_articles')).toContainEqual({
      event_id: 'news-stored-first',
      article_id: 'art-gone.com-900',
    });
    // Marked after the transaction, in a statement of its own.
    const mark = db.queries.find(isMergeMark)!;
    expect(db.queries.indexOf(mark)).toBe(db.queries.length - 1);
    expect(JSON.parse(mark.params![0] as string)).toEqual([
      { id: 'news-stored-again', into_id: 'news-stored-first' },
    ]);
    // This isolate answers for the merged id too.
    expect((await repo.getEvent('news-stored-again', NOW))?.id).toBe('news-stored-first');
  });

  it('marks nothing when the stories are new', async () => {
    const [story] = await ingestWindow([copy('kxan.com', 10)]);
    const db = new FakeDb(() => []);
    await repoOn(db).repo.replaceLiveNews([story!], NOW);
    expect(db.written('events').map((e) => e.id)).toEqual([story!.event.id]);
    expect(db.queries.some(isMergeMark)).toBe(false);
  });

  it('lists no merged copies, and a merged id leads to the event that carries the story', async () => {
    const [story] = await ingestWindow([copy('kxan.com', 10)]);
    const kept = eventToRow(story!.event, NOW);
    const merged = {
      ...kept,
      id: 'news-merged-copy',
      provenance: { ...kept.provenance, mergedInto: kept.id },
    };
    const db = new FakeDb((text, params) => {
      if (text.includes('events_in_window')) return [kept, merged];
      if (text.includes('event_by_id')) return [kept, merged].filter((r) => r.id === params[0]);
      return [];
    });
    const { repo } = repoOn(db);
    expect((await repo.listEvents(live)).events.map((e) => e.id)).toEqual([kept.id]);
    // A little over the limit is asked for, as merged rows are skipped.
    const listing = db.queries.find((q) => q.text.includes('events_in_window'))!;
    expect(listing.params![8]).toBe(125);
    const e = await repo.getEvent('news-merged-copy', NOW);
    expect(e?.id).toBe(kept.id);
    expect(e?.provenance.mergedInto).toBeUndefined();
  });
});

describe('PostgreSQL repository: tidying up copies stored earlier', () => {
  const isStoredNews = (text: string) =>
    text.includes('order by e.id') && !text.includes('tstzrange');

  it('merges them into the copy with the most articles, which adds up their coverage', async () => {
    const db = new FakeDb((text) =>
      isStoredNews(text)
        ? [
            storedCopy(
              'news-kept',
              ['art-apnews.com-30', 'art-wtop.com-20', 'art-kxan.com-10'],
              NOW - 30 * MIN,
            ),
            storedCopy('news-copy', ['art-wtop.com-20', 'art-wral.com-150'], NOW - 150 * MIN),
          ]
        : [],
    );
    expect(await repoOn(db).repo.mergeStoredCopies()).toEqual({ stories: 1, merged: 1 });
    const [statements] = db.transactions;
    const json = (i: number) => JSON.parse(statements![i]!.params![0] as string);
    expect(statements![0]!.text).toContain('update events e set article_count');
    expect(json(0)).toEqual([
      {
        id: 'news-kept',
        article_count: 4,
        source_count: 4,
        importance: 3,
        time_start: new Date(NOW - 150 * MIN).toISOString().replace('.000', ''),
        time_end: new Date(NOW - 10 * MIN).toISOString().replace('.000', ''),
      },
    ]);
    expect(json(1)).toEqual([{ event_id: 'news-kept', article_id: 'art-wral.com-150' }]);
    expect(json(2)).toEqual([{ id: 'news-copy', into_id: 'news-kept' }]);
  });

  it('changes nothing when there are no copies', async () => {
    const db = new FakeDb((text) =>
      isStoredNews(text) ? [storedCopy('news-alone', ['art-kxan.com-10'], NOW - 10 * MIN)] : [],
    );
    expect(await repoOn(db).repo.mergeStoredCopies()).toEqual({ stories: 0, merged: 0 });
    expect(db.transactions).toHaveLength(0);
  });
});
