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
  TEMPORAL_CONFIG,
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
import { importanceFor } from '../pipeline/build-events';
import {
  continueStories,
  duplicateCopies,
  headlineKey,
  mergePriors,
  SAME_STORY_MS,
  type PriorEvent,
} from '../pipeline/continuity';
import type { IngestionRun } from '../pipeline/ingest';
import type { ProviderHealth } from '../providers/health';
import {
  WEBHOOK_LEASE_MS,
  type PaymentPatch,
  type PaymentStore,
  type WebhookClaim,
} from '../payments/store';
import { toSummary, type MemoryRepository } from './memory-repository';
import type {
  EventRepository,
  ListEventsQuery,
  ListEventsResult,
  RelatedEvent,
} from './repository';
import type { TimeWindow } from './search';
import { sqlState, type SqlClient } from './sql';

/** Drivers return timestamptz as Date (pg-types); keep a string form for the shared schemas. */
type Ts = Date | string;

/** How often an instance reloads the stored live news for its search. */
const HYDRATE_EVERY_MS = 5 * 60_000;
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

/** A stored news event with all its articles and their publishers (see PriorRow). */
const PRIOR_COLUMNS = `e.id, e.title, e.time_start, e.time_end, st_y(e.geom::geometry) as lat,
  st_x(e.geom::geometry) as lon, e.location_precision, e.country_code,
  coalesce((select array_agg(ea.article_id order by ea.article_id) from event_articles ea
            where ea.event_id = e.id), '{}') as article_ids,
  coalesce((select array_agg(distinct a.source_id) from event_articles ea
            join articles a on a.id = ea.article_id where ea.event_id = e.id), '{}') as source_ids`;

/** Stored news events no ingestion merged into another. */
const LIVE_STORED = `e.kind = 'news' and not e.is_demo and (e.provenance->>'mergedInto') is null`;

/**
 * Earlier news events that share an article or the headline with a run ($1 its article ids,
 * $2 its headlines in lower case, $3 the earliest start worth looking at). Events already
 * merged into another are not continued again.
 */
const PRIOR_NEWS = `
select ${PRIOR_COLUMNS}
from events e
where ${LIVE_STORED} and e.period && tstzrange($3::timestamptz, null)
  and (lower(e.title) = any($2::text[])
       or exists (select 1 from event_articles ea
                  where ea.event_id = e.id and ea.article_id = any($1::text[])))
order by e.id`;

/** Every stored news event, for the one-off tidy-up of earlier copies (mergeStoredCopies). */
const STORED_NEWS = `select ${PRIOR_COLUMNS} from events e where ${LIVE_STORED} order by e.id`;

/** The event a story is kept in takes on its copies' coverage and time span ($1 rows). */
const ADD_UP_KEPT = `
update events e set article_count = greatest(e.article_count, x.article_count),
  source_count = greatest(e.source_count, x.source_count),
  importance = greatest(e.importance, x.importance),
  time_start = least(e.time_start, x.time_start),
  time_end = case when x.time_end is null then e.time_end
                  else greatest(coalesce(e.time_end, e.time_start), x.time_end) end
from jsonb_to_recordset($1::jsonb) as x(id text, article_count integer, source_count integer,
  importance smallint, time_start timestamptz, time_end timestamptz)
where e.id = x.id and e.kind = 'news'`;

/**
 * Marks news events as merged into the event that now carries their story ($1 [{id, into_id}]).
 * Nothing is deleted: listings skip them and event_by_id callers follow the mark.
 */
const MARK_MERGED = `
update events e set provenance = e.provenance || jsonb_build_object('mergedInto', x.into_id)
from jsonb_to_recordset($1::jsonb) as x(id text, into_id text)
where e.id = x.id and e.kind = 'news'`;

interface PriorRow {
  id: string;
  title: string;
  time_start: Ts;
  time_end: Ts | null;
  lat: number;
  lon: number;
  location_precision: WorldEvent['location']['precision'];
  country_code: string | null;
  article_ids: string[] | null;
  source_ids: string[] | null;
}

/** The event a merged one now lives on in (see MARK_MERGED), if any. */
const mergedInto = (r: EventRow): string | null => r.provenance?.mergedInto ?? null;

const priorFromRow = (r: PriorRow): PriorEvent => ({
  id: r.id,
  title: r.title,
  startMs: parseIso(tsToIso(r.time_start)),
  endMs: parseIso(tsToIso(r.time_end ?? r.time_start)),
  lat: r.lat,
  lon: r.lon,
  precision: r.location_precision,
  countryCode: r.country_code?.trim() || null,
  articleIds: new Set(r.article_ids ?? []),
  sourceIds: new Set(r.source_ids ?? []),
});

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
            // A little extra: events merged into another are skipped below.
            Math.min(1000, q.limit + Math.ceil(q.limit / 4)),
          ],
          { idempotent: true },
        );
        const dbEvents: EventSummary[] = rows
          .filter((r) => !mergedInto(r))
          .map((r) => toSummary(rowToEvent(r)));
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
        // An event merged into another (the same story, found by a later run) leads to it.
        let current = id;
        for (let hop = 0; hop < 5; hop++) {
          const rows = await this.db.query<EventRow>(
            `select ${EVENT_COLUMNS} from event_by_id($1::text)`,
            [current],
            { idempotent: true },
          );
          if (!rows[0]) return null;
          const next = mergedInto(rows[0]);
          if (!next) {
            const e = rowToEvent(rows[0]);
            return { ...e, hasTakeAction: this.memory.actionOptions(e).length > 0 };
          }
          const local = await this.memory.getEvent(next, nowMs);
          if (local) return local;
          current = next;
        }
        return null;
      },
      () => null,
    );
  }

  async getArticles(requestedId: string, nowMs: number): Promise<Article[]> {
    if (!requestedId.startsWith('news-')) return this.memory.getArticles(requestedId, nowMs);
    const eventId = this.memory.resolveLiveId(requestedId);
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
        return rows.map((a): Article => ({
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
  async search(
    query: string,
    opts: { limit: number; nowMs: number; includeDemo: boolean; window?: TimeWindow },
  ): Promise<SearchResult[]> {
    // The live news another instance stored (on the Worker, the cron), for this one's search.
    await this.hydrateLive(opts.nowMs);
    return this.memory.search(query, opts);
  }

  private hydratedAt = Number.NEGATIVE_INFINITY;
  private hydration: Promise<void> | null = null;

  /**
   * Loads the live news stored in the database into this instance's memory, at most every few
   * minutes: on the Worker each instance has its own memory and only the cron's ingests, so
   * search (the bar, the assistant) would otherwise miss stories the globe shows.
   */
  async hydrateLive(nowMs: number): Promise<void> {
    if (nowMs - this.hydratedAt < HYDRATE_EVERY_MS) return;
    this.hydration ??= this.guard(
      async () => {
        const rows = await this.db.query<EventRow>(
          `select ${EVENT_COLUMNS}
           from events_in_window($1::timestamptz, $2::timestamptz, $3::text[], $4::boolean,
                                 null, null, null, null, $5::integer)`,
          [
            toIso(nowMs - TEMPORAL_CONFIG.liveWindowHours * 3_600_000),
            toIso(nowMs + 3_600_000),
            ['news'],
            false,
            1000,
          ],
          { idempotent: true },
        );
        this.memory.adoptStoredLive(rows.filter((r) => !mergedInto(r)).map(rowToEvent), nowMs);
        this.hydratedAt = nowMs;
      },
      () => undefined,
    ).finally(() => {
      this.hydration = null;
    });
    await this.hydration;
  }

  private latestRun: { atMs: number | null; checkedMs: number } | null = null;

  /**
   * When live news was last stored by any instance (the ingestion log), checked at most once a
   * minute: an instance whose own memory is empty then loads it instead of reading GDELT again.
   */
  async latestIngestionMs(nowMs: number): Promise<number | null> {
    if (this.latestRun && nowMs - this.latestRun.checkedMs < 60_000) return this.latestRun.atMs;
    const atMs = await this.guard(
      async () => {
        const rows = await this.db.query<{ at: Ts | null }>(
          'select max(finished_at) as at from ingestion_runs',
          [],
          { idempotent: true },
        );
        const at = rows[0]?.at;
        return at ? new Date(at).getTime() : null;
      },
      () => null,
    );
    this.latestRun = { atMs, checkedMs: nowMs };
    return atMs;
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

  /** Earlier live events in the database that share an article or the headline with a run. */
  private async storedPriors(events: BuiltEvent[]): Promise<PriorEvent[]> {
    const articleIds = [...new Set(events.flatMap((b) => b.articles.map((a) => a.id)))];
    const headlines = [
      ...new Set(
        events.filter((b) => headlineKey(b.event.title)).map((b) => b.event.title.toLowerCase()),
      ),
    ];
    const earliest = events.reduce((m, b) => Math.min(m, parseIso(b.event.time.start)), Infinity);
    const rows = await this.db.query<PriorRow>(
      PRIOR_NEWS,
      [articleIds, headlines, toPgTimestamp(toIso(earliest - SAME_STORY_MS))],
      { idempotent: true },
    );
    return rows.map(priorFromRow);
  }

  /**
   * One-off tidy-up (pnpm db:merge-duplicates) for news stored before stories kept their ids
   * across runs: copies of one story the window no longer brings back are merged into the copy
   * with the most articles, which links their articles and adds up their coverage and time span.
   * Nothing is deleted, and running it again changes nothing. Throws when the database fails.
   */
  async mergeStoredCopies(): Promise<{ stories: number; merged: number }> {
    const stored = (await this.db.query<PriorRow>(STORED_NEWS, [], { idempotent: true })).map(
      priorFromRow,
    );
    const into = duplicateCopies(stored);
    const byIdMap = new Map(stored.map((p) => [p.id, p]));
    const stories = new Map<string, PriorEvent[]>();
    for (const [copy, kept] of into)
      stories.set(kept, [...(stories.get(kept) ?? []), byIdMap.get(copy)!]);
    const kept = [];
    const links = [];
    for (const [id, copies] of stories) {
      const k = byIdMap.get(id)!;
      const articles = new Set(k.articleIds);
      const sources = new Set(k.sourceIds);
      let start = k.startMs;
      let end = k.endMs;
      for (const c of copies) {
        for (const a of c.articleIds) {
          if (!articles.has(a)) links.push({ event_id: id, article_id: a });
          articles.add(a);
        }
        for (const src of c.sourceIds) sources.add(src);
        start = Math.min(start, c.startMs);
        end = Math.max(end, c.endMs);
      }
      kept.push({
        id,
        article_count: articles.size,
        source_count: sources.size,
        importance: importanceFor(sources.size),
        time_start: toPgTimestamp(toIso(start)),
        time_end: end - start > 3_600_000 ? toPgTimestamp(toIso(end)) : null,
      });
    }
    if (into.size > 0)
      await this.db.transaction([
        { text: ADD_UP_KEPT, params: [toJsonParam(uniqueSortedBy(kept, (k) => k.id))] },
        {
          text: LINK_ARTICLES,
          params: [toJsonParam(uniqueSortedBy(links, (l) => `${l.event_id}|${l.article_id}`))],
        },
        {
          text: MARK_MERGED,
          params: [
            toJsonParam(
              uniqueSortedBy(
                [...into].map(([copy, k]) => ({ id: copy, into_id: k })),
                (m) => m.id,
              ),
            ),
          ],
        },
      ]);
    return { stories: stories.size, merged: into.size };
  }

  async replaceLiveNews(built: BuiltEvent[], nowMs: number): Promise<void> {
    // One event per story across runs and isolates: earlier copies come from this isolate's
    // memory and from the database every isolate shares.
    const stored: PriorEvent[] = built.length
      ? await this.guard(
          () => this.storedPriors(built),
          () => [],
        )
      : [];
    const run = continueStories(built, mergePriors(this.memory.livePriors(nowMs), stored));
    this.memory.applyLiveNews(run, nowMs);
    const events = run.events;
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
    const saved = new Set(articles.map((a) => a.id));
    // Articles of earlier copies of a story are linked to the event that carries it now; only
    // those known to be stored (the database returned them), so a link never lacks its article.
    const inDb = new Set(stored.flatMap((p) => [...p.articleIds]));
    const links = uniqueSortedBy(
      events.flatMap((b) => [
        ...b.articles
          .filter((a) => saved.has(a.id))
          .map((a) => ({ event_id: b.event.id, article_id: a.id })),
        ...b.carriedArticleIds
          .filter((id) => inDb.has(id))
          .map((id) => ({ event_id: b.event.id, article_id: id })),
      ]),
      (l) => `${l.event_id}|${l.article_id}`,
    );
    const ok = await this.guard(
      async () => {
        await this.db.transaction([
          { text: UPSERT_SOURCES, params: [toJsonParam(sources)] },
          { text: UPSERT_EVENTS, params: [toJsonParam(eventRows)] },
          { text: UPSERT_ARTICLES, params: [toJsonParam(articles)] },
          { text: LINK_ARTICLES, params: [toJsonParam(links)] },
        ]);
        return true;
      },
      () => false,
    );
    // Earlier copies are marked once the events that carry their stories are stored; on its own
    // so it locks few rows. Repeating it is harmless, and a failure leaves a duplicate until the
    // next run marks it.
    const merged = uniqueSortedBy(
      [...run.mergedInto].map(([id, into]) => ({ id, into_id: into })),
      (m) => m.id,
    );
    if (ok && merged.length > 0)
      await this.guard(
        () => this.db.query(MARK_MERGED, [toJsonParam(merged)], { idempotent: true }),
        () => [],
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
 * paypal_webhook_events plus its processed_at / claimed_at columns (see claimWebhook).
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

  async claimWebhook(eventId: string, eventType: string, payload: string): Promise<WebhookClaim> {
    // A row comes back when this call took the lease: a new event id, or one that is neither
    // processed nor held by a live lease (an earlier attempt failed or was abandoned).
    const rows = await this.db.query<{ event_id: string }>(
      `insert into paypal_webhook_events (event_id, event_type, payload, claimed_at)
       values ($1, $2, $3, now())
       on conflict (event_id) do update set claimed_at = now()
         where paypal_webhook_events.processed_at is null
           and (paypal_webhook_events.claimed_at is null
                or paypal_webhook_events.claimed_at < now() - $4::interval)
       returning event_id`,
      [eventId, eventType, payload, `${WEBHOOK_LEASE_MS / 1000} seconds`],
    );
    if (rows.length > 0) return 'claimed';
    const state = await this.db.query<{ processed_at: Ts | null }>(
      'select processed_at from paypal_webhook_events where event_id = $1',
      [eventId],
      { idempotent: true },
    );
    return state[0]?.processed_at ? 'done' : 'in-progress';
  }

  async completeWebhook(eventId: string): Promise<void> {
    await this.db.query(
      'update paypal_webhook_events set processed_at = now(), claimed_at = null where event_id = $1',
      [eventId],
    );
  }

  async releaseWebhook(eventId: string): Promise<void> {
    await this.db.query(
      'update paypal_webhook_events set claimed_at = null where event_id = $1 and processed_at is null',
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
