/**
 * Supabase (PostgreSQL + PostGIS) persistence via Supabase's REST interface (PostgREST):
 *   {SUPABASE_URL}/rest/v1/{table}     and     {SUPABASE_URL}/rest/v1/rpc/{function}
 * authenticated with the service-role key (server-side only; RLS blocks anonymous writes).
 *
 * Curated history and labelled demo scenarios are shipped with the code and served from the
 * in-memory repository; Supabase stores ingested live news and all payment state. If Supabase
 * is unreachable, reads fall back to memory and the provider is reported as degraded.
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
  type SearchResult,
  type WorldEvent,
} from '@worldlens/shared';
import { fetchWithTimeout, UpstreamError, type FetchLike } from '../lib/http';
import type { BuiltEvent } from '../pipeline/build-events';
import type { ProviderHealth } from '../providers/health';
import type { PaymentStore } from '../payments/store';
import { toSummary, type MemoryRepository } from './memory-repository';
import type {
  EventRepository,
  ListEventsQuery,
  ListEventsResult,
  RelatedEvent,
} from './repository';

export class PostgrestClient {
  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    prefer?: string,
  ): Promise<T> {
    const res = await fetchWithTimeout(`${this.url.replace(/\/$/, '')}/rest/v1/${path}`, {
      provider: 'supabase',
      method,
      timeoutMs: 8000,
      retries: method === 'GET' ? 1 : 0,
      fetchImpl: this.fetchImpl,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok)
      throw new UpstreamError(
        `supabase ${method} ${path.split('?')[0]}: HTTP ${res.status}`,
        'supabase',
        res.status,
        text.slice(0, 300),
      );
    return (text ? JSON.parse(text) : null) as T;
  }
}

interface EventRow {
  id: string;
  kind: 'news' | 'historical';
  is_demo: boolean;
  title: string;
  summary: string | null;
  why_it_matters: string | null;
  category: WorldEvent['category'];
  tags: string[] | null;
  time_start: string;
  time_end: string | null;
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
  updated_at: string | null;
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
      start: toIso(parseIso(r.time_start)),
      ...(r.time_end ? { end: toIso(parseIso(r.time_end)) } : {}),
      precision: r.date_precision,
      approximate: r.date_approximate,
    },
    location: {
      name: r.location_name,
      lat: r.lat,
      lon: r.lon,
      precision: r.location_precision,
      ...(r.country_code ? { countryCode: r.country_code } : {}),
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
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
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

export function eventToRow(e: WorldEvent) {
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
    geom: `SRID=4326;POINT(${e.location.lon} ${e.location.lat})`,
    participants: e.participants,
    image: e.image ?? null,
    provenance: e.provenance,
    updated_at: e.updatedAt ?? toIso(Date.now()),
  };
}

export class SupabaseNewsRepository implements EventRepository {
  readonly name = 'supabase+memory';
  private db: PostgrestClient;
  private lastIngestedAt: string | null = null;
  private lastCount = 0;

  constructor(
    private readonly memory: MemoryRepository,
    url: string,
    key: string,
    private readonly health: ProviderHealth,
    fetchImpl: FetchLike,
  ) {
    this.db = new PostgrestClient(url, key, fetchImpl);
  }

  private async guard<T>(fn: () => Promise<T>, fallback: () => Promise<T> | T): Promise<T> {
    try {
      const v = await fn();
      this.health.ok('supabase');
      return v;
    } catch (err) {
      this.health.fail('supabase', err);
      return fallback();
    }
  }

  async listEvents(q: ListEventsQuery): Promise<ListEventsResult> {
    const base = await this.memory.listEvents(q);
    if (!q.kinds.includes('news')) return base;
    return this.guard(
      async () => {
        const rows = await this.db.request<EventRow[]>('POST', 'rpc/events_in_window', {
          p_start: toIso(base.window.startMs),
          p_end: toIso(base.window.endMs),
          p_kinds: ['news'],
          p_include_demo: false,
          p_west: q.bbox?.west ?? null,
          p_south: q.bbox?.south ?? null,
          p_east: q.bbox?.east ?? null,
          p_north: q.bbox?.north ?? null,
          p_limit: q.limit,
        });
        const dbEvents: EventSummary[] = rows.map((r) => toSummary(rowToEvent(r)));
        const merged = [
          ...base.events,
          ...dbEvents.filter((e) => !base.events.some((b) => b.id === e.id)),
        ];
        merged.sort(
          (a, b) => b.importance - a.importance || parseIso(b.time.start) - parseIso(a.time.start),
        );
        return {
          ...base,
          events: merged.slice(0, q.limit),
          total: base.total + dbEvents.length,
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
        const rows = await this.db.request<EventRow[]>('POST', 'rpc/event_by_id', { p_id: id });
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
        const rows = await this.db.request<
          Array<{
            articles: {
              id: string;
              source_id: string;
              headline: string;
              url: string;
              published_at: string;
              language: string | null;
              source_country: string | null;
              snippet: string | null;
              image_url: string | null;
            };
          }>
        >('GET', `event_articles?event_id=eq.${encodeURIComponent(eventId)}&select=articles(*)`);
        return rows.map(({ articles: a }) => ({
          id: a.id,
          sourceId: a.source_id,
          headline: a.headline,
          url: a.url,
          publishedAt: a.published_at,
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
        const rows = await this.db.request<
          Array<{
            id: string;
            name: string;
            domain: string;
            country: string | null;
            source_type: NewsSource['sourceType'];
            ownership: string | null;
            national_perspective: string | null;
          }>
        >(
          'GET',
          `news_sources?id=in.(${missing.map((m) => `"${m.replace(/"/g, '')}"`).join(',')})`,
        );
        return [
          ...known,
          ...rows.map((r) => ({
            id: r.id,
            name: r.name,
            domain: r.domain,
            country: r.country,
            sourceType: r.source_type,
            ownership: r.ownership,
            nationalPerspective: r.national_perspective,
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
    await this.guard(
      async () => {
        const sources = new Map<string, NewsSource>();
        for (const b of events) for (const s of b.sources) sources.set(s.id, s);
        await this.db.request(
          'POST',
          'news_sources?on_conflict=id',
          [...sources.values()].map((s) => ({
            id: s.id,
            name: s.name,
            domain: s.domain,
            country: s.country,
            source_type: s.sourceType,
            ownership: s.ownership,
            national_perspective: s.nationalPerspective,
            is_demo: s.isDemo,
          })),
          'resolution=merge-duplicates,return=minimal',
        );
        await this.db.request(
          'POST',
          'events?on_conflict=id',
          events.map((b) => eventToRow(b.event)),
          'resolution=merge-duplicates,return=minimal',
        );
        const articles = events.flatMap((b) => b.articles);
        await this.db.request(
          'POST',
          'articles?on_conflict=id',
          articles.map((a) => ({
            id: a.id,
            source_id: a.sourceId,
            headline: a.headline,
            url: a.url,
            published_at: a.publishedAt,
            language: a.language,
            source_country: a.sourceCountry,
            snippet: a.snippet ?? null,
            image_url: a.imageUrl ?? null,
            is_demo: false,
          })),
          'resolution=merge-duplicates,return=minimal',
        );
        await this.db.request(
          'POST',
          'event_articles?on_conflict=event_id,article_id',
          events.flatMap((b) =>
            b.articles.map((a) => ({ event_id: b.event.id, article_id: a.id })),
          ),
          'resolution=ignore-duplicates,return=minimal',
        );
      },
      () => undefined,
    );
  }

  async recordIngestionRun(run: Record<string, unknown>): Promise<void> {
    await this.guard(
      () => this.db.request('POST', 'ingestion_runs', run, 'return=minimal'),
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
  created_at: string;
  updated_at: string;
  last_error: string | null;
}

const toRecord = (r: PaymentRow): PaymentRecord => ({
  id: r.id,
  paypalOrderId: r.paypal_order_id,
  actionOptionId: r.action_option_id,
  eventId: r.event_id,
  amount: Number(r.amount).toFixed(2),
  currency: r.currency,
  state: r.state,
  environment: r.environment,
  captureId: r.capture_id,
  paypalStatus: r.paypal_status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastError: r.last_error,
});

const toRow = (p: Partial<PaymentRecord>) => {
  const out: Record<string, unknown> = {};
  if (p.id !== undefined) out.id = p.id;
  if (p.paypalOrderId !== undefined) out.paypal_order_id = p.paypalOrderId;
  if (p.actionOptionId !== undefined) out.action_option_id = p.actionOptionId;
  if (p.eventId !== undefined) out.event_id = p.eventId;
  if (p.amount !== undefined) out.amount = p.amount;
  if (p.currency !== undefined) out.currency = p.currency;
  if (p.state !== undefined) out.state = p.state;
  if (p.environment !== undefined) out.environment = p.environment;
  if (p.captureId !== undefined) out.capture_id = p.captureId;
  if (p.paypalStatus !== undefined) out.paypal_status = p.paypalStatus;
  if (p.createdAt !== undefined) out.created_at = p.createdAt;
  if (p.updatedAt !== undefined) out.updated_at = p.updatedAt;
  if (p.lastError !== undefined) out.last_error = p.lastError;
  return out;
};

/** Payment state in Postgres. Webhook idempotency relies on the primary key of paypal_webhook_events. */
export class SupabasePaymentStore implements PaymentStore {
  readonly name = 'supabase';
  private db: PostgrestClient;
  constructor(url: string, key: string, fetchImpl: FetchLike) {
    this.db = new PostgrestClient(url, key, fetchImpl);
  }
  async create(record: PaymentRecord): Promise<void> {
    await this.db.request('POST', 'payment_actions', toRow(record), 'return=minimal');
  }
  async get(id: string): Promise<PaymentRecord | null> {
    const rows = await this.db.request<PaymentRow[]>(
      'GET',
      `payment_actions?id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
  async getByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const rows = await this.db.request<PaymentRow[]>(
      'GET',
      `payment_actions?paypal_order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
  async update(id: string, patch: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const rows = await this.db.request<PaymentRow[]>(
      'PATCH',
      `payment_actions?id=eq.${encodeURIComponent(id)}`,
      toRow(patch),
      'return=representation',
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
  async markWebhookProcessed(
    eventId: string,
    eventType: string,
    payload: string,
  ): Promise<boolean> {
    // ignore-duplicates + return=representation → empty array when the id already existed.
    const rows = await this.db.request<unknown[]>(
      'POST',
      'paypal_webhook_events?on_conflict=event_id',
      { event_id: eventId, event_type: eventType, payload },
      'resolution=ignore-duplicates,return=representation',
    );
    return Array.isArray(rows) && rows.length > 0;
  }
  async log(paymentId: string, kind: string, detail: Record<string, unknown>): Promise<void> {
    await this.db
      .request(
        'POST',
        'payment_transactions',
        { payment_id: paymentId, kind, detail },
        'return=minimal',
      )
      .catch(() => undefined);
  }
}
