/**
 * Adds the news of the past — 2000 up to the live window, from Wikipedia
 * (providers/wikipedia-news.ts) — to an events repository: listed for the timeline's period,
 * opened by id with their articles and outlets. Before 2000 the timeline shows history only.
 */
import {
  bboxContains,
  finestOf,
  parseIso,
  type ActionOption,
  type Article,
  type NewsSource,
  type SearchResult,
  type WorldEvent,
} from '@worldlens/shared';
import type { BuiltEvent } from '../pipeline/build-events';
import type { ProviderHealth } from '../providers/health';
import { GDELT_FILES_WINDOW_HOURS } from '../providers/gdelt-files';
import type { PastEvent, WikipediaNewsProvider } from '../providers/wikipedia-news';
import { toSummary } from './memory-repository';
import {
  minImportanceFor,
  type EventRepository,
  type ListEventsQuery,
  type ListEventsResult,
  type RelatedEvent,
  type SearchOptions,
} from './repository';
import { SearchIndex } from './search';

const HOUR = 3_600_000;
/**
 * The news of the past runs up to a day ago, where the live news reads GDELT from: stored live
 * news has gaps for any day ingestion was not running (it never reads further back), so
 * Wikipedia covers every day before that. The two may overlap on the last day or so.
 */
export const PAST_NEWS_LAG_MS = GDELT_FILES_WINDOW_HOURS * HOUR;
const isPast = (id: string) => id.startsWith('wnews-');

export class WithPastNews implements EventRepository {
  readonly name: string;

  constructor(
    private readonly inner: EventRepository,
    private readonly past: WikipediaNewsProvider,
    private readonly health?: ProviderHealth,
  ) {
    this.name = inner.name;
  }

  async listEvents(q: ListEventsQuery): Promise<ListEventsResult> {
    const base = await this.inner.listEvents(q);
    if (q.mode !== 'historical' || !q.kinds.includes('news')) return base;
    // Up to where live news takes over.
    const until = q.nowMs - PAST_NEWS_LAG_MS;
    let past;
    try {
      past = await this.past.eventsIn(base.window, until);
      if (past.length) this.health?.ok('wikipedia');
    } catch (err) {
      this.health?.fail('wikipedia', err);
      return base;
    }
    const min = minImportanceFor(q.resolution);
    const known = new Set(base.events.map((e) => e.id));
    const extra = past
      .map((p) => p.event)
      .filter(
        (e) =>
          !known.has(e.id) &&
          e.importance >= min &&
          (!q.bbox || bboxContains(q.bbox, e.location.lat, e.location.lon)),
      )
      .map(toSummary);
    if (extra.length === 0) return base;
    const merged = [...base.events, ...extra].sort(
      (a, b) => b.importance - a.importance || parseIso(b.time.start) - parseIso(a.time.start),
    );
    return {
      ...base,
      events: merged.slice(0, q.limit),
      total: base.total + extra.length,
      truncated: base.truncated || merged.length > q.limit,
      finestPrecision: finestOf(merged.map((e) => e.time.precision)),
    };
  }

  async getEvent(id: string, nowMs: number): Promise<WorldEvent | null> {
    if (!isPast(id)) return this.inner.getEvent(id, nowMs);
    return (await this.past.find(id).catch(() => null))?.event ?? null;
  }

  async getArticles(eventId: string, nowMs: number): Promise<Article[]> {
    if (!isPast(eventId)) return this.inner.getArticles(eventId, nowMs);
    return (await this.past.find(eventId).catch(() => null))?.articles ?? [];
  }

  async getSources(ids: string[]): Promise<NewsSource[]> {
    const known = await this.inner.getSources(ids);
    const have = new Set(known.map((s) => s.id));
    return [...known, ...this.past.sourcesById(ids.filter((i) => !have.has(i)))];
  }

  getRelated(eventId: string, nowMs: number): Promise<RelatedEvent[]> {
    return isPast(eventId) ? Promise.resolve([]) : this.inner.getRelated(eventId, nowMs);
  }

  /**
   * The news of the past matching a query, best first: Wikipedia finds the candidates (the days
   * whose Current events page mentions it; 2000–2002 from the year articles), ranked here with
   * the same scoring as every other search. Rejects when Wikipedia cannot be reached.
   */
  async searchPast(query: string, opts: SearchOptions): Promise<SearchResult[]> {
    const until = opts.nowMs - PAST_NEWS_LAG_MS;
    let past: PastEvent[];
    try {
      past = await this.past.matching(query, {
        untilMs: until,
        ...(opts.window ? { window: opts.window } : {}),
      });
    } catch (err) {
      this.health?.fail('wikipedia', err);
      throw err;
    }
    if (past.length === 0) return [];
    this.health?.ok('wikipedia');
    // The topic articles an item links (its first reference) count as its words.
    const index = new SearchIndex();
    index.setEvents(
      past.map(({ event }) => ({
        ...event,
        tags: [...event.tags, ...event.references.map((r) => r.title)],
      })),
    );
    return index
      .search(query, {
        limit: opts.limit,
        includeDemo: false,
        ...(opts.window ? { window: opts.window } : {}),
      })
      .filter((r) => r.type === 'NEWS');
  }

  /** With `includePast` (the assistant's searches), the news of the past too, merged by score. */
  async search(query: string, opts: SearchOptions): Promise<SearchResult[]> {
    if (!opts.includePast) return this.inner.search(query, opts);
    const [base, past] = await Promise.all([
      this.inner.search(query, opts),
      this.searchPast(query, opts).catch((): SearchResult[] => []),
    ]);
    if (past.length === 0) return base;
    const known = new Set(base.map((r) => r.eventId ?? r.id));
    const extra = past.filter((r) => !known.has(r.id));
    return [...base, ...extra].sort((a, b) => b.score - a.score).slice(0, opts.limit);
  }

  density(fromMs: number, toMs: number, bins: number): Promise<number[]> {
    return this.inner.density(fromMs, toMs, bins);
  }

  /** News of the past offers no donation: Take Action is for what is happening now. */
  actionOptions(event: WorldEvent): ActionOption[] {
    return isPast(event.id) ? [] : this.inner.actionOptions(event);
  }

  actionOption(id: string): ActionOption | null {
    return this.inner.actionOption(id);
  }

  frontlinesAt(dateMs: number, conflictId?: string) {
    return this.inner.frontlinesAt(dateMs, conflictId);
  }

  frontlinesFor(conflictId: string) {
    return this.inner.frontlinesFor(conflictId);
  }

  hydrateLive(nowMs: number): Promise<void> {
    return this.inner.hydrateLive?.(nowMs) ?? Promise.resolve();
  }

  latestIngestionMs(nowMs: number): Promise<number | null> {
    return this.inner.latestIngestionMs?.(nowMs) ?? Promise.resolve(null);
  }

  replaceLiveNews(events: BuiltEvent[], nowMs: number): Promise<void> {
    return this.inner.replaceLiveNews(events, nowMs);
  }

  liveNewsStatus() {
    return this.inner.liveNewsStatus();
  }

  /** The Postgres repository records ingestion runs; others do not. */
  async recordIngestionRun(run: unknown): Promise<void> {
    const rec = this.inner as unknown as { recordIngestionRun?: (r: unknown) => Promise<void> };
    await rec.recordIngestionRun?.(run);
  }
}
