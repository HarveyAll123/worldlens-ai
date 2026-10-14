/**
 * PostgreSQL + PostGIS persistence (Neon in production, local Postgres in development/tests)
 * through the small `SqlClient` interface. All SQL is parameterised; bulk writes pass rows as
 * one JSON parameter expanded with `jsonb_to_recordset`, inside a single transaction.
 *
 * Curated history and labelled demo scenarios are shipped with the code and served from the
 * in-memory repository; the database stores ingested live news and all payment state. If the
 * database is unreachable, reads fall back to memory and the provider is reported as degraded.
 */
import {
  parseIso,
  toIso,
  type ActionOption,
  type Article,
  type EventSummary,
  type Frontline,
  type NewsSource,
  type PaymentRecord,
  type PaymentState,
  type SearchResult,
  type WorldEvent,
} from '@worldlens/shared';
import type { BuiltEvent } from '../pipeline/build-events';
import type { IngestionRun } from '../pipeline/ingest';
import type { ProviderHealth } from '../providers/health';
import type { PaymentPatch, PaymentStore } from '../payments/store';
import { toSummary, type MemoryRepository } from './memory-repository';
import type {
  EventRepository,
  ListEventsQuery,
  ListEventsResult,
  RelatedEvent,
} from './repository';
import { sqlState, type SqlClient } from './sql';

/** Drivers return timestamptz as Date (pg-types); keep a string form for the shared schemas. */
type Ts = Date | string;
const tsToIso = (v: Ts): string => toIso(v instanceof Date ? v.getTime() : parseIso(v));

export interface EventRow {
  id: string;
  kind: 'news' | 'historical';
  is_demo: boolean;
  title: string;
  summary: string | null;
  why_it_matters: string | null;
  category: WorldEvent['category'];
  tags: string[] | null;
  time_start: Ts;
  time_end: Ts | null;
  date_precision: WorldEvent['time']['precision'];
  date_approximate: boolean;
  importance: number;
  confidence: number;
  article_count: number;
  source_count: number;
  location_name: string;
  location_precision: WorldEvent['location']['precision'];
  location_confidence: number;
  country_code: string | null;
  lat: number;
  lon: number;
  participants: WorldEvent['participants'] | null;
  image: WorldEvent['image'] | null;
  provenance: WorldEvent['provenance'];
  updated_at: Ts | null;
}

export function rowToEvent(r: EventRow): WorldEvent {
  return {
    id: r.id,
    kind: r.kind,
    isDemo: r.is_demo,
    title: r.title,
    ...(r.summary ? { summary: r.summary } : {}),
    ...(r.why_it_matters ? { whyItMatters: r.why_it_matters } : {}),
    category: r.category,
    tags: r.tags ?? [],
    time: {
      start: tsToIso(r.time_start),
      ...(r.time_end ? { end: tsToIso(r.time_end) } : {}),
      precision: r.date_precision,
      approximate: r.date_approximate,
    },
    location: {
      name: r.location_name,
      lat: r.lat,
      lon: r.lon,
      precision: r.location_precision,
      ...(r.country_code ? { countryCode: r.country_code.trim() } : {}),
      confidence: r.location_confidence,
    },
    extraLocations: [],
    participants: r.participants ?? [],
    ...(r.image ? { image: r.image } : {}),
    references: [],
    importance: r.importance,
    confidence: r.confidence,
    articleCount: r.article_count,
    sourceCount: r.source_count,
    hasTakeAction: false,
    provenance: r.provenance,
    ...(r.updated_at ? { updatedAt: tsToIso(r.updated_at) } : {}),
  };
}

/**
 * PostgreSQL does not accept ISO-8601 extended years ("-000500-01-01"); it uses "0501-01-01 BC"
 * (astronomical year 0 = 1 BC). Convert so pre-common-era records can be stored later.
 */
export function toPgTimestamp(iso: string): string {
  const ms = parseIso(iso);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  if (y > 0) return toIso(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(1 - y, 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00 BC`;
}

export function eventToRow(e: WorldEvent, nowMs: number) {
  return {
    id: e.id,
    kind: e.kind,
    is_demo: e.isDemo,
    title: e.title,
    summary: e.summary ?? null,
    why_it_matters: e.whyItMatters ?? null,
    category: e.category,
    tags: e.tags,
    time_start: toPgTimestamp(e.time.start),
    time_end: e.time.end ? toPgTimestamp(e.time.end) : null,
    date_precision: e.time.precision,
    date_approximate: e.time.approximate,
    importance: e.importance,
    confidence: e.confidence,
    article_count: e.articleCount,
    source_count: e.sourceCount,
    location_name: e.location.name,
    location_precision: e.location.precision,
    location_confidence: e.location.confidence,
    country_code: e.location.countryCode ?? null,
    lat: e.location.lat,
    lon: e.location.lon,
    participants: e.participants,
    image: e.image ?? null,
    provenance: e.provenance,
    updated_at: e.updatedAt ?? toIso(nowMs),
  };
}

/** Deduplicated and sorted by key: every transaction then locks rows in the same order. */
const uniqueSortedBy = <T>(items: T[], key: (t: T) => string): T[] =>
  [...new Map(items.map((i) => [key(i), i])).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, v]) => v);

/**
 * What provider health (public) may say about a database failure: PostgreSQL's own message
 * for SQL errors, a fixed text for connection/configuration errors — driver messages for the
 * latter can contain the connection string.
 */
export function describeDbError(err: unknown): Error {
  const code = sqlState(err);
  if (code)
    return new Error(`${err instanceof Error ? err.message : 'SQL error'} (SQLSTATE ${code})`);
  return new Error('could not reach the database (connection or configuration error)');
}

/** Lone UTF-16 surrogates (e.g. an emoji cut in half) are invalid in jsonb; replace them. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const toJsonParam = (rows: unknown[]): string =>
  JSON.stringify(rows, (_k, v: unknown) =>
    typeof v === 'string' ? v.replace(LONE_SURROGATE, '\uFFFD') : v,
  );
const httpsOrNull = (u: string | null | undefined): string | null =>
  u && u.startsWith('https://') ? u : null;

const EVENT_COLUMNS = `id, kind, is_demo, title, summary, why_it_matters, category, tags, time_start,
  time_end, date_precision, date_approximate, importance, confidence, article_count, source_count,
  location_name, location_precision, location_confidence, country_code, lat, lon, participants,
  image, provenance, updated_at`;

const UPSERT_SOURCES = `
insert into news_sources (id, name, domain, country, source_type, ownership, national_perspective, is_demo)
select id, name, domain, country, source_type, ownership, national_perspective, is_demo
from jsonb_to_recordset($1::jsonb) as x(id text, name text, domain text, country text, source_type text,
  ownership text, national_perspective text, is_demo boolean)
on conflict (id) do update set name = excluded.name, country = excluded.country,
  source_type = excluded.source_type, ownership = excluded.ownership,
  national_perspective = excluded.national_perspective`;

const UPSERT_EVENTS = `
insert into events (id, kind, is_demo, title, summary, why_it_matters, category, tags, time_start, time_end,
  date_precision, date_approximate, importance, confidence, article_count, source_count, location_name,
  location_precision, location_confidence, country_code, geom, participants, image, provenance, updated_at)
select id, kind, is_demo, title, summary, why_it_matters, category, coalesce(tags, '{}'), time_start, time_end,
  date_precision, date_approximate, importance, confidence, article_count, source_count, location_name,
  location_precision, location_confidence, country_code,
  st_setsrid(st_makepoint(lon, lat), 4326)::geography, coalesce(participants, '[]'::jsonb), image,
  provenance, updated_at
from jsonb_to_recordset($1::jsonb) as x(id text, kind text, is_demo boolean, title text, summary text,
  why_it_matters text, category text, tags text[], time_start timestamptz, time_end timestamptz,
  date_precision text, date_approximate boolean, importance smallint, confidence real, article_count integer,
  source_count integer, location_name text, location_precision text, location_confidence real,
  country_code text, lat double precision, lon double precision, participants jsonb, image jsonb,
  provenance jsonb, updated_at timestamptz)
on conflict (id) do update set title = excluded.title, summary = excluded.summary,
  why_it_matters = excluded.why_it_matters, category = excluded.category, tags = excluded.tags,
  time_start = excluded.time_start, time_end = excluded.time_end, date_precision = excluded.date_precision,
  date_approximate = excluded.date_approximate, importance = excluded.importance,
  confidence = excluded.confidence, article_count = excluded.article_count,
  source_count = excluded.source_count, location_name = excluded.location_name,
  location_precision = excluded.location_precision, location_confidence = excluded.location_confidence,
  country_code = excluded.country_code, geom = excluded.geom, participants = excluded.participants,
  image = excluded.image, provenance = excluded.provenance, updated_at = excluded.updated_at`;

const UPSERT_ARTICLES = `
insert into articles (id, source_id, headline, url, published_at, language, source_country, snippet, image_url, is_demo)
select id, source_id, headline, url, published_at, language, source_country, snippet, image_url, false
from jsonb_to_recordset($1::jsonb) as x(id text, source_id text, headline text, url text,
  published_at timestamptz, language text, source_country text, snippet text, image_url text)
on conflict (id) do update set headline = excluded.headline, snippet = excluded.snippet,
  image_url = excluded.image_url`;

const LINK_ARTICLES = `
insert into event_articles (event_id, article_id)
select event_id, article_id from jsonb_to_recordset($1::jsonb) as x(event_id text, article_id text)
on conflict do nothing`;

export class PostgresNewsRepository implements EventRepository {
  readonly name: string;
  private lastIngestedAt: string | null = null;
  private lastCount = 0;

  constructor(
    private readonly memory: MemoryRepository,
    private readonly db: SqlClient,
    private readonly health: ProviderHealth,
  ) {
    this.name = `${db.kind === 'neon-http' ? 'neon' : 'postgres'}+memory`;
  }

  private async guard<T>(fn: () => Promise<T>, fallback: () => Promise<T> | T): Promise<T> {
    try {
      const v = await fn();
      this.health.ok('database');
      return v;
    } catch (err) {
      this.health.fail('database', describeDbError(err));
      return fallback();
    }
  }

  async listEvents(q: ListEventsQuery): Promise<ListEventsResult> {
    const base = await this.memory.listEvents(q);
    if (!q.kinds.includes('news')) return base;
    return this.guard(
      async () => {
        const rows = await this.db.query<EventRow>(
          `select ${EVENT_COLUMNS}
           from events_in_window($1::timestamptz, $2::timestamptz, $3::text[], $4::boolean,
                                 $5::float8, $6::float8, $7::float8, $8::float8, $9::integer)`,
          [
            toIso(base.window.startMs),
            toIso(base.window.endMs),
            ['news'],
            false,
            q.bbox?.west ?? null,
            q.bbox?.south ?? null,
            q.bbox?.east ?? null,
            q.bbox?.north ?? null,
            q.limit,
          ],
          { idempotent: true },
        );
        const dbEvents: EventSummary[] = rows.map((r) => toSummary(rowToEvent(r)));
        const fresh = dbEvents.filter((e) => !base.events.some((b) => b.id === e.id));
        const merged = [...base.events, ...fresh];
        merged.sort(
          (a, b) => b.importance - a.importance || parseIso(b.time.start) - parseIso(a.time.start),
        );
        return {
          ...base,
          events: merged.slice(0, q.limit),
          total: base.total + fresh.length,
          truncated: base.truncated || merged.length > q.limit,
          finestPrecision: dbEvents.length ? 'hour' : base.finestPrecision,
        };
      },
      () => base,
    );
  }

  async getEvent(id: string, nowMs: number): Promise<WorldEvent | null> {
    const local = await this.memory.getEvent(id, nowMs);
    if (local || !id.startsWith('news-')) return local;
    return this.guard(
      async () => {
        const rows = await this.db.query<EventRow>(
          `select ${EVENT_COLUMNS} from event_by_id($1::text)`,
          [id],
          { idempotent: true },
        );
        if (!rows[0]) return null;
        const e = rowToEvent(rows[0]);
        return { ...e, hasTakeAction: this.memory.actionOptions(e).length > 0 };
      },
      () => null,
    );
  }

  async getArticles(eventId: string, nowMs: number): Promise<Article[]> {
    if (!eventId.startsWith('news-')) return this.memory.getArticles(eventId, nowMs);
    return this.guard(
      async () => {
        const rows = await this.db.query<{
          id: string;
          source_id: string;
          headline: string;
          url: string;
          published_at: Ts;
          language: string | null;
          source_country: string | null;
          snippet: string | null;
          image_url: string | null;
        }>(
          `select a.id, a.source_id, a.headline, a.url, a.published_at, a.language, a.source_country,
                  a.snippet, a.image_url
           from event_articles ea join articles a on a.id = ea.article_id
           where ea.event_id = $1
           order by a.published_at desc, a.id
           limit 200`,
          [eventId],
          { idempotent: true },
        );
        return rows.map((a) => ({
          id: a.id,
          sourceId: a.source_id,
          headline: a.headline,
          url: a.url,
          publishedAt: tsToIso(a.published_at),
          language: a.language,
          sourceCountry: a.source_country,
          ...(a.snippet ? { snippet: a.snippet } : {}),
          ...(a.image_url ? { imageUrl: a.image_url } : {}),
          isDemo: false,
        }));
      },
      () => this.memory.getArticles(eventId, nowMs),
    );
  }

  async getSources(ids: string[]): Promise<NewsSource[]> {
    const known = await this.memory.getSources(ids);
    const missing = ids.filter((id) => !known.some((s) => s.id === id));
    if (missing.length === 0) return known;
    return this.guard(
      async () => {
        const rows = await this.db.query<{
          id: string;
          name: string;
          domain: string;
          country: string | null;
          source_type: NewsSource['sourceType'];
          ownership: string | null;
          national_perspective: string | null;
        }>(
          `select id, name, domain, country, source_type, ownership, national_perspective
           from news_sources where id = any($1::text[])`,
          [missing],
          { idempotent: true },
        );
        return [
          ...known,
          ...rows.map((r) => ({
            id: r.id,
            name: r.name,
            domain: r.domain,
            country: r.country ? r.country.trim() : null,
            sourceType: r.source_type,
            ownership: r.ownership,
            nationalPerspective: r.national_perspective,
            // Ratings need provenance; ingested sources are never rated automatically.
            rating: {
              value: 'UNRATED' as const,
              methodology: null,
              source: null,
              sourceUrl: null,
              confidence: null,
              lastReviewed: null,
              illustrative: false,
            },
            isDemo: false,
          })),
        ];
      },
      () => known,
    );
  }

  getRelated(eventId: string, nowMs: number): Promise<RelatedEvent[]> {
    return this.memory.getRelated(eventId, nowMs);
  }
  search(
    query: string,
    opts: { limit: number; nowMs: number; includeDemo: boolean },
  ): Promise<SearchResult[]> {
    return this.memory.search(query, opts);
  }
  density(fromMs: number, toMs: number, bins: number): Promise<number[]> {
    return this.memory.density(fromMs, toMs, bins);
  }
  actionOptions(event: WorldEvent): ActionOption[] {
    return this.memory.actionOptions(event);
  }
  actionOption(id: string): ActionOption | null {
    return this.memory.actionOption(id);
  }
  frontlinesAt(dateMs: number, conflictId?: string): Promise<Frontline[]> {
    return this.memory.frontlinesAt(dateMs, conflictId);
  }
  frontlinesFor(conflictId: string): Promise<Frontline[]> {
    return this.memory.frontlinesFor(conflictId);
  }

  async replaceLiveNews(events: BuiltEvent[], nowMs: number): Promise<void> {
    await this.memory.replaceLiveNews(events, nowMs);
    this.lastIngestedAt = new Date(nowMs).toISOString();
    this.lastCount = events.length;
    if (events.length === 0) return;
    // Rows are shaped to satisfy the table constraints, so one odd article (an http:// image,
    // an over-long snippet) cannot roll back the whole ingestion.
    const sources = uniqueSortedBy(
      events.flatMap((b) => b.sources),
      (s) => s.id,
    ).map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      country: s.country && s.country.length === 2 ? s.country : null,
      source_type: s.sourceType,
      ownership: s.ownership,
      national_perspective: s.nationalPerspective,
      is_demo: s.isDemo,
    }));
    const eventRows = uniqueSortedBy(
      events.map((b) => eventToRow(b.event, nowMs)),
      (e) => e.id,
    );
    const articles = uniqueSortedBy(
      events.flatMap((b) => b.articles).filter((a) => a.url.startsWith('https://')),
      (a) => a.id,
    ).map((a) => ({
      id: a.id,
      source_id: a.sourceId,
      headline: a.headline,
      url: a.url,
      published_at: a.publishedAt,
      language: a.language,
      source_country: a.sourceCountry,
      snippet: a.snippet ? a.snippet.slice(0, 600) : null,
      image_url: httpsOrNull(a.imageUrl),
    }));
    const stored = new Set(articles.map((a) => a.id));
    const links = uniqueSortedBy(
      events.flatMap((b) =>
        b.articles
          .filter((a) => stored.has(a.id))
          .map((a) => ({ event_id: b.event.id, article_id: a.id })),
      ),
      (l) => `${l.event_id}|${l.article_id}`,
    );
    await this.guard(
      () =>
        this.db.transaction([
          { text: UPSERT_SOURCES, params: [toJsonParam(sources)] },
          { text: UPSERT_EVENTS, params: [toJsonParam(eventRows)] },
          { text: UPSERT_ARTICLES, params: [toJsonParam(articles)] },
          { text: LINK_ARTICLES, params: [toJsonParam(links)] },
        ]),
      () => undefined,
    );
  }

  async recordIngestionRun(run: IngestionRun): Promise<void> {
    await this.guard(
      () =>
        this.db.query(
          `insert into ingestion_runs (provider, started_at, finished_at, queries, fetched, normalized,
             deduplicated, clusters, located, errors)
           values ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
          [
            run.provider,
            run.startedAt,
            run.finishedAt,
            run.queries,
            run.fetched,
            run.normalized,
            run.deduplicated,
            run.clusters,
            run.located,
            JSON.stringify(run.errors),
          ],
        ),
      () => undefined,
    );
  }

  liveNewsStatus(): { count: number; lastIngestedAt: string | null } {
    return { count: this.lastCount, lastIngestedAt: this.lastIngestedAt };
  }
}

interface PaymentRow {
  id: string;
  paypal_order_id: string | null;
  action_option_id: string;
  event_id: string;
  amount: string;
  currency: string;
  state: PaymentRecord['state'];
  environment: PaymentRecord['environment'];
  capture_id: string | null;
  paypal_status: string | null;
  created_at: Ts;
  updated_at: Ts;
  last_error: string | null;
}

const PAYMENT_COLUMNS = `id, paypal_order_id, action_option_id, event_id, amount::text as amount, currency,
  state, environment, capture_id, paypal_status, created_at, updated_at, last_error`;

const toRecord = (r: PaymentRow): PaymentRecord => ({
  id: r.id,
  paypalOrderId: r.paypal_order_id,
  actionOptionId: r.action_option_id,
  eventId: r.event_id,
  amount: Number(r.amount).toFixed(2),
  currency: r.currency.trim(),
  state: r.state,
  environment: r.environment,
  captureId: r.capture_id,
  paypalStatus: r.paypal_status,
  createdAt: tsToIso(r.created_at),
  updatedAt: tsToIso(r.updated_at),
  lastError: r.last_error,
});

/** Updatable field → column. Only these fixed names are ever interpolated into SQL. */
const PAYMENT_FIELDS = {
  paypalOrderId: 'paypal_order_id',
  state: 'state',
  captureId: 'capture_id',
  paypalStatus: 'paypal_status',
  lastError: 'last_error',
  updatedAt: 'updated_at',
} as const satisfies Record<keyof PaymentPatch, string>;

/**
 * Server-side payment state. Webhook idempotency relies on the primary key of
 * paypal_webhook_events plus its processed_at column (see claimWebhook).
 */
export class PostgresPaymentStore implements PaymentStore {
  readonly name: string;
  constructor(private readonly db: SqlClient) {
    this.name = db.kind === 'neon-http' ? 'neon' : 'postgres';
  }

  async create(record: PaymentRecord): Promise<void> {
    await this.db.query(
      `insert into payment_actions (id, paypal_order_id, action_option_id, event_id, amount, currency, state,
         environment, capture_id, paypal_status, created_at, updated_at, last_error)
       values ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, $13)`,
      [
        record.id,
        record.paypalOrderId,
        record.actionOptionId,
        record.eventId,
        record.amount,
        record.currency,
        record.state,
        record.environment,
        record.captureId,
        record.paypalStatus,
        record.createdAt,
        record.updatedAt,
        record.lastError,
      ],
    );
  }

  async get(id: string): Promise<PaymentRecord | null> {
    const rows = await this.db.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS} from payment_actions where id = $1`,
      [id],
      { idempotent: true },
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async getByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const rows = await this.db.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS} from payment_actions where paypal_order_id = $1`,
      [orderId],
      { idempotent: true },
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async update(
    id: string,
    patch: PaymentPatch,
    opts: { expectState?: PaymentState } = {},
  ): Promise<PaymentRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [field, column] of Object.entries(PAYMENT_FIELDS) as Array<
      [keyof typeof PAYMENT_FIELDS, string]
    >) {
      const value = patch[field];
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    let where = 'id = $1';
    if (opts.expectState !== undefined) {
      params.push(opts.expectState);
      where += ` and state = $${params.length}`;
    }
    if (sets.length === 0) {
      const current = await this.get(id);
      return current && (opts.expectState === undefined || current.state === opts.expectState)
        ? current
        : null;
    }
    const rows = await this.db.query<PaymentRow>(
      `update payment_actions set ${sets.join(', ')} where ${where} returning ${PAYMENT_COLUMNS}`,
      params,
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async claimWebhook(eventId: string, eventType: string, payload: string): Promise<boolean> {
    // A row comes back for a new event id, or for one whose earlier processing never
    // completed (processed_at is null); a fully processed event returns nothing.
    const rows = await this.db.query<{ event_id: string }>(
      `insert into paypal_webhook_events (event_id, event_type, payload) values ($1, $2, $3)
       on conflict (event_id) do update set processed_at = null
         where paypal_webhook_events.processed_at is null
       returning event_id`,
      [eventId, eventType, payload],
    );
    return rows.length > 0;
  }

  async completeWebhook(eventId: string): Promise<void> {
    await this.db.query(
      'update paypal_webhook_events set processed_at = now() where event_id = $1',
      [eventId],
    );
  }

  async log(paymentId: string, kind: string, detail: Record<string, unknown>): Promise<void> {
    await this.db
      .query(
        'insert into payment_transactions (payment_id, kind, detail) values ($1, $2, $3::jsonb)',
        [paymentId, kind, JSON.stringify(detail)],
      )
      .catch(() => undefined);
  }
}
