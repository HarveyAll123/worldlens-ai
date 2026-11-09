/**
 * Integration tests for the PostgreSQL repository and payment store against a real
 * PostgreSQL + PostGIS database with the project's migrations and grants applied.
 * Run by `pnpm test:db`, which provides WORLDLENS_TEST_DATABASE_URL for the least-privilege
 * `worldlens_app` role; skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PaymentRecord } from '@worldlens/shared';
import type { GdeltArticle, NewsProvider } from '../providers/gdelt';
import { ProviderHealth } from '../providers/health';
import { runIngestion } from '../pipeline/ingest';
import { copy, ingestWindow, NOW as STORY_NOW } from '../testing/stories';
import type { BuiltEvent } from '../pipeline/build-events';
import { MemoryRepository } from './memory-repository';
import { PostgresNewsRepository, PostgresPaymentStore } from './postgres';
import { nodePostgresClient } from './sql-node';
import type { ListEventsQuery } from './repository';

const url = process.env.WORLDLENS_TEST_DATABASE_URL;
const NOW = Date.UTC(2026, 9, 14, 9, 0, 0);

function seen(minutesAgo: number): string {
  const d = new Date(NOW - minutesAgo * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
}
function art(title: string, domain: string, minutesAgo: number): GdeltArticle {
  return {
    url: `https://www.${domain}/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, '-'))}`,
    title,
    seendate: seen(minutesAgo),
    domain,
    language: 'English',
    sourcecountry: 'United States',
    socialimage: 'https://img.example.com/x.jpg',
  };
}

async function ingest(articles: GdeltArticle[]) {
  const provider: NewsProvider = { name: 'gdelt', fetchRecent: async () => articles };
  return runIngestion({ provider, queries: ['q'], health: new ProviderHealth(), nowMs: NOW });
}

const liveQuery = (bbox: ListEventsQuery['bbox'] = null): ListEventsQuery => ({
  mode: 'live',
  timeMs: NOW,
  resolution: 'day',
  nowMs: NOW,
  bbox,
  kinds: ['news'],
  includeDemo: false,
  limit: 100,
});

describe.skipIf(!url)('PostgreSQL repository (integration)', () => {
  let sql: ReturnType<typeof nodePostgresClient>;
  let built: BuiltEvent[];
  let quakeId: string;

  beforeAll(async () => {
    sql = nodePostgresClient(url!);
    const { events, run } = await ingest([
      art('Magnitude 6.8 earthquake strikes off Sulawesi, Indonesia', 'reuters.com', 50),
      art("Strong quake hits Indonesia's Sulawesi island", 'smallwire-example.org', 40),
      art('Cyclone batters Fiji as thousands shelter', 'apnews.com', 30),
      art('Fiji cyclone forces thousands into shelters', 'smallwire-example.org', 20),
    ]);
    built = events;
    const writerHealth = new ProviderHealth();
    writerHealth.register('database', true);
    const writer = new PostgresNewsRepository(new MemoryRepository(), sql, writerHealth);
    await writer.replaceLiveNews(built, NOW);
    await writer.recordIngestionRun(run);
    expect(writerHealth.get('database').state).toBe('ok');
    quakeId = built.find((b) => /Sulawesi/.test(b.event.location.name))!.event.id;
  });

  afterAll(async () => {
    await sql?.end();
  });

  /** A repository with an empty in-memory cache, as in a different Worker isolate. */
  function freshReader() {
    const health = new ProviderHealth();
    health.register('database', true);
    return { repo: new PostgresNewsRepository(new MemoryRepository(), sql, health), health };
  }

  it('ingested two located events', () => {
    expect(built).toHaveLength(2);
  });

  it('serves stored news to another isolate, with viewport filtering', async () => {
    const { repo, health } = freshReader();
    const all = await repo.listEvents(liveQuery());
    const ids = all.events.map((e) => e.id);
    for (const b of built) expect(ids).toContain(b.event.id);
    expect(health.get('database').state).toBe('ok');

    const indonesia = await repo.listEvents(
      liveQuery({ west: 110, south: -10, east: 130, north: 5 }),
    );
    expect(indonesia.events.map((e) => e.id)).toContain(quakeId);
    expect(indonesia.events.some((e) => /Fiji/.test(e.location.name))).toBe(false);

    // Viewport crossing the antimeridian (west > east) still finds Fiji.
    const pacific = await repo.listEvents(
      liveQuery({ west: 170, south: -30, east: -170, north: 0 }),
    );
    expect(pacific.events.some((e) => /Fiji/.test(e.location.name))).toBe(true);
    expect(pacific.events.map((e) => e.id)).not.toContain(quakeId);
  });

  it('returns the full event, its articles and unknown sources from the database', async () => {
    const { repo, health } = freshReader();
    const original = built.find((b) => b.event.id === quakeId)!;

    const e = await repo.getEvent(quakeId, NOW);
    expect(e).not.toBeNull();
    expect(e!.title).toBe(original.event.title);
    expect(e!.time).toEqual(original.event.time);
    expect(e!.location.lat).toBeCloseTo(original.event.location.lat, 6);
    expect(e!.location.lon).toBeCloseTo(original.event.location.lon, 6);
    expect(e!.provenance.provider).toBe('gdelt');
    expect(e!.sourceCount).toBe(2);

    const articles = await repo.getArticles(quakeId, NOW);
    expect(articles.map((a) => a.url).sort()).toEqual(original.articles.map((a) => a.url).sort());
    expect(articles[0]!.publishedAt).toMatch(/^2026-10-14T0\d:\d\d:00Z$/);

    const unknown = original.sources.find((s) => s.domain === 'smallwire-example.org')!;
    const sources = await repo.getSources([unknown.id]);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.domain).toBe('smallwire-example.org');
    expect(sources[0]!.rating.value).toBe('UNRATED');
    expect(health.get('database').state).toBe('ok');
  });

  it('re-ingesting the same stories is an idempotent upsert', async () => {
    const health = new ProviderHealth();
    health.register('database', true);
    const writer = new PostgresNewsRepository(new MemoryRepository(), sql, health);
    const updated = built.map((b) => ({ ...b, event: { ...b.event, importance: 5 } }));
    await writer.replaceLiveNews(updated, NOW + 60_000);
    expect(health.get('database').state).toBe('ok');
    const rows = await sql.query<{ n: string }>(
      'select count(*) as n from event_articles where event_id = $1',
      [quakeId],
    );
    expect(Number(rows[0]!.n)).toBe(2);
    const e = await freshReader().repo.getEvent(quakeId, NOW);
    expect(e!.importance).toBe(5);
  });

  it('a story ingested again under another first article stays one event; old copies lead to it', async () => {
    const reworded = 'Congress returns to a changed Washington after election wipeout for GOP';
    // Each run in a fresh isolate: only the database knows what earlier runs stored.
    const store = async (events: BuiltEvent[]) => {
      const health = new ProviderHealth();
      health.register('database', true);
      await new PostgresNewsRepository(new MemoryRepository(), sql, health).replaceLiveNews(
        events,
        STORY_NOW,
      );
      expect(health.get('database').state).toBe('ok');
    };
    const [first] = await ingestWindow([copy('wtop.com', 90), copy('kare11.com', 60)]);
    await store([first!]);
    // Another wording, no article in common: stored as a second copy of the story.
    const [second] = await ingestWindow([copy('kxan.com', 40, reworded)]);
    await store([second!]);
    expect(second!.event.id).not.toBe(first!.event.id);
    // A run that sees both clusters them together.
    const [both] = await ingestWindow([
      copy('wtop.com', 90),
      copy('kare11.com', 60),
      copy('kxan.com', 40, reworded),
    ]);
    await store([both!]);

    const { repo, health } = freshReader();
    const listed = await repo.listEvents({ ...liveQuery(), timeMs: STORY_NOW, nowMs: STORY_NOW });
    const ids = listed.events.map((e) => e.id);
    expect(ids).toContain(first!.event.id);
    expect(ids).not.toContain(second!.event.id);
    expect((await repo.getEvent(second!.event.id, STORY_NOW))?.id).toBe(first!.event.id);
    expect(await repo.getEvent(first!.event.id, STORY_NOW)).toMatchObject({
      articleCount: 3,
      sourceCount: 3,
    });
    expect(await repo.getArticles(first!.event.id, STORY_NOW)).toHaveLength(3);
    expect(health.get('database').state).toBe('ok');
  });

  it('records ingestion runs', async () => {
    const rows = await sql.query<{ provider: string; fetched: number; located: number }>(
      "select provider, fetched, located from ingestion_runs where provider = 'gdelt' order by id desc limit 1",
    );
    expect(rows[0]).toEqual({ provider: 'gdelt', fetched: 4, located: 2 });
  });

  it('stores timestamps before the common era', async () => {
    const health = new ProviderHealth();
    health.register('database', true);
    const writer = new PostgresNewsRepository(new MemoryRepository(), sql, health);
    const base = built[0]!;
    const ancient: BuiltEvent = {
      ...base,
      articles: [],
      event: {
        ...base.event,
        id: 'news-bce-storage-test',
        time: { start: '-000500-01-01T00:00:00Z', precision: 'year', approximate: true },
      },
    };
    await writer.replaceLiveNews([ancient], NOW);
    expect(health.get('database').state).toBe('ok');
    const e = await freshReader().repo.getEvent('news-bce-storage-test', NOW);
    expect(e!.time.start).toBe('-000500-01-01T00:00:00Z');
  });

  it('stores an ingestion even when one article would break a table constraint', async () => {
    const health = new ProviderHealth();
    health.register('database', true);
    const writer = new PostgresNewsRepository(new MemoryRepository(), sql, health);
    const base = built[0]!;
    const halfEmoji = 'Quake relief convoy arrives \uD83C';
    const odd: BuiltEvent = {
      ...base,
      event: { ...base.event, id: 'news-constraint-test', title: halfEmoji },
      articles: [
        {
          ...base.articles[0]!,
          id: 'art-constraint-test',
          url: 'https://www.example-wire.org/constraint-test',
          headline: halfEmoji,
          imageUrl: 'http://localhost/not-https.jpg',
          snippet: 'x'.repeat(700),
        },
      ],
    };
    await writer.replaceLiveNews([odd], NOW);
    expect(health.get('database').state).toBe('ok');
    const rows = await sql.query<{ image_url: string | null; snippet: string; headline: string }>(
      "select image_url, snippet, headline from articles where id = 'art-constraint-test'",
    );
    expect(rows[0]?.image_url).toBeNull();
    expect(rows[0]?.snippet).toHaveLength(600);
    expect(rows[0]?.headline.endsWith('\uFFFD')).toBe(true);
  });

  it('concurrent ingestions of overlapping batches do not deadlock', async () => {
    const base = built[0]!;
    // Each event has its own publisher, so both transactions lock many rows in every table.
    const batch: BuiltEvent[] = Array.from({ length: 300 }, (_, i) => {
      const n = String(i).padStart(3, '0');
      const source = {
        ...base.sources[0]!,
        id: `src-concurrency-${n}`,
        domain: `wire-${n}.example.org`,
      };
      return {
        ...base,
        sources: [source],
        event: { ...base.event, id: `news-concurrency-${n}` },
        articles: [
          {
            ...base.articles[0]!,
            id: `art-concurrency-${n}`,
            sourceId: source.id,
            url: `https://www.example-wire.org/concurrency-${n}`,
          },
        ],
      };
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      const healths = [new ProviderHealth(), new ProviderHealth()];
      for (const h of healths) h.register('database', true);
      await Promise.all([
        new PostgresNewsRepository(new MemoryRepository(), sql, healths[0]!).replaceLiveNews(
          batch,
          NOW,
        ),
        new PostgresNewsRepository(new MemoryRepository(), sql, healths[1]!).replaceLiveNews(
          [...batch].reverse(),
          NOW,
        ),
      ]);
      expect(healths.map((h) => h.get('database').state)).toEqual(['ok', 'ok']);
    }
  });

  it('a curated source sharing a domain with an earlier automatic source does not block ingestion', async () => {
    await sql.query(
      "insert into news_sources (id, name, domain) values ('src-auto-0000000000', 'AFP (auto)', 'afp.com') on conflict do nothing",
    );
    const { events } = await ingest([
      art('Flooding displaces thousands in Sylhet, Bangladesh', 'afp.com', 15),
      art('Sylhet floods force thousands from their homes in Bangladesh', 'reuters.com', 10),
    ]);
    expect(events.length).toBeGreaterThan(0);
    const health = new ProviderHealth();
    health.register('database', true);
    await new PostgresNewsRepository(new MemoryRepository(), sql, health).replaceLiveNews(
      events,
      NOW,
    );
    expect(health.get('database').state).toBe('ok');
  });

  it('degrades to memory and reports the database as down when queries fail', async () => {
    const health = new ProviderHealth();
    health.register('database', true);
    const broken = nodePostgresClient(url!.replace('worldlens_app', 'no_such_role'));
    const repo = new PostgresNewsRepository(new MemoryRepository(), broken, health);
    const result = await repo.listEvents(liveQuery());
    expect(result.events.every((e) => !built.some((b) => b.event.id === e.id))).toBe(true);
    expect(health.get('database').state).not.toBe('ok');
    await broken.end();
  });
});

describe.skipIf(!url)('PostgreSQL payment store (integration)', () => {
  let sql: ReturnType<typeof nodePostgresClient>;
  let store: PostgresPaymentStore;
  beforeAll(() => {
    sql = nodePostgresClient(url!);
    store = new PostgresPaymentStore(sql);
  });
  afterAll(async () => {
    await sql?.end();
  });

  const record: PaymentRecord = {
    id: 'wl_integration0001',
    paypalOrderId: null,
    actionOptionId: 'act-quake-relief-sandbox',
    eventId: 'demo-news-sulawesi-quake-relief',
    amount: '20.00',
    currency: 'USD',
    state: 'REVIEW',
    environment: 'sandbox',
    captureId: null,
    paypalStatus: null,
    createdAt: '2026-10-14T09:00:00Z',
    updatedAt: '2026-10-14T09:00:00Z',
    lastError: null,
  };

  it('creates, reads and updates payment records', async () => {
    await store.create(record);
    expect(await store.get(record.id)).toEqual(record);

    const created = await store.update(record.id, {
      state: 'CREATED',
      paypalOrderId: 'ORDER-INT-1',
      updatedAt: '2026-10-14T09:01:00Z',
    });
    expect(created).toMatchObject({ state: 'CREATED', paypalOrderId: 'ORDER-INT-1' });
    expect(await store.getByOrderId('ORDER-INT-1')).toMatchObject({ id: record.id });

    const captured = await store.update(record.id, {
      state: 'CAPTURED',
      captureId: 'CAPTURE-INT-1',
      paypalStatus: 'COMPLETED',
      updatedAt: '2026-10-14T09:02:00Z',
    });
    expect(captured).toEqual({
      ...record,
      state: 'CAPTURED',
      paypalOrderId: 'ORDER-INT-1',
      captureId: 'CAPTURE-INT-1',
      paypalStatus: 'COMPLETED',
      updatedAt: '2026-10-14T09:02:00Z',
    });
    expect(await store.get('wl_doesnotexist')).toBeNull();
    expect(await store.update('wl_doesnotexist', { state: 'FAILED' })).toBeNull();
  });

  it('rejects ids that do not match the payment id format', async () => {
    await expect(store.create({ ...record, id: 'not-a-payment-id' })).rejects.toThrow();
  });

  it('webhook leases: one delivery processes, copies wait, a failed attempt is retried', async () => {
    const claim = (id = 'WH-INT-1') => store.claimWebhook(id, 'PAYMENT.CAPTURE.COMPLETED', '{}');
    expect(await claim()).toBe('claimed');
    expect(await claim()).toBe('in-progress'); // a concurrent copy is told to come back later
    await store.releaseWebhook('WH-INT-1'); // processing failed
    expect(await claim()).toBe('claimed'); // PayPal's retry is processed
    await store.completeWebhook('WH-INT-1');
    expect(await claim()).toBe('done');

    // Simultaneous first deliveries: exactly one takes the lease.
    const results = await Promise.all(Array.from({ length: 8 }, () => claim('WH-INT-2')));
    expect(results.filter((r) => r === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r === 'in-progress')).toHaveLength(7);

    // An abandoned attempt (worker died) is taken over once its lease has expired.
    await sql.query(
      "update paypal_webhook_events set claimed_at = now() - interval '3 minutes' where event_id = 'WH-INT-2'",
    );
    expect(await claim('WH-INT-2')).toBe('claimed');
  });

  it('compare-and-set: an update based on a stale state changes nothing', async () => {
    const before = await store.get(record.id);
    expect(before?.state).toBe('CAPTURED');
    const stale = await store.update(
      record.id,
      { state: 'APPROVED', updatedAt: '2026-10-14T09:03:00Z' },
      { expectState: 'CREATED' },
    );
    expect(stale).toBeNull();
    expect(await store.get(record.id)).toEqual(before);
    const refunded = await store.update(
      record.id,
      { state: 'REFUNDED', updatedAt: '2026-10-14T09:04:00Z' },
      { expectState: 'CAPTURED' },
    );
    expect(refunded?.state).toBe('REFUNDED');
  });

  it('appends to the payment audit log', async () => {
    await store.log(record.id, 'capture', { captureId: 'CAPTURE-INT-1' });
    const rows = await sql.query<{ kind: string; detail: { captureId: string } }>(
      'select kind, detail from payment_transactions where payment_id = $1',
      [record.id],
    );
    expect(rows).toEqual([{ kind: 'capture', detail: { captureId: 'CAPTURE-INT-1' } }]);
  });
});
