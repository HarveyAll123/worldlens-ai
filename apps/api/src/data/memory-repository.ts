/**
 * In-memory repository: curated history + labelled demo scenarios + the latest live-news
 * ingestion held in this isolate. Used when no database is configured and as the
 * always-available fallback when it is (curated history is shipped with the code).
 */
import {
  floorTo,
  intersects,
  parseIso,
  periodAt,
  TEMPORAL_CONFIG,
  bboxContains,
  finestOf,
  temporalSpan,
  type ActionOption,
  type Article,
  type EventSummary,
  type Frontline,
  type NewsSource,
  type SearchResult,
  type WorldEvent,
} from '@worldlens/shared';
import {
  ACTION_OPTIONS,
  ACTIONABLE_CATEGORIES,
  FRONTLINES,
  HISTORICAL_EVENTS,
  NEWS_SOURCES,
  RELATIONS,
  buildDemoNews,
  type DemoNews,
} from '@worldlens/shared/data';
import type { BuiltEvent } from '../pipeline/build-events';
import {
  minImportanceFor,
  type EventRepository,
  type ListEventsQuery,
  type ListEventsResult,
  type RelatedEvent,
} from './repository';
import { SearchIndex } from './search';

const HOUR = 3_600_000;

export function toSummary(e: WorldEvent): EventSummary {
  return {
    id: e.id,
    kind: e.kind,
    isDemo: e.isDemo,
    title: e.title,
    category: e.category,
    time: e.time,
    location: e.location,
    importance: e.importance,
    confidence: e.confidence,
    articleCount: e.articleCount,
    sourceCount: e.sourceCount,
    hasTakeAction: e.hasTakeAction,
  };
}

export class MemoryRepository implements EventRepository {
  readonly name: string = 'memory';
  private demo: { builtAtHour: number; data: DemoNews } | null = null;
  private live = new Map<string, BuiltEvent>();
  private lastIngestedAt: string | null = null;
  private sources = new Map<string, NewsSource>(NEWS_SOURCES.map((s) => [s.id, s]));
  private index = new SearchIndex();
  private indexBuiltForHour = -1;
  private indexLiveVersion = -1;
  private liveVersion = 0;

  /** Demo timestamps are relative to "now"; rebuild hourly so they stay in the LIVE window. */
  private demoData(nowMs: number): DemoNews {
    const hour = Math.floor(nowMs / HOUR);
    if (!this.demo || this.demo.builtAtHour !== hour)
      this.demo = { builtAtHour: hour, data: buildDemoNews(nowMs) };
    return this.demo.data;
  }

  private allEvents(nowMs: number): WorldEvent[] {
    return [
      ...HISTORICAL_EVENTS,
      ...this.demoData(nowMs).events,
      ...[...this.live.values()].map((b) => b.event),
    ];
  }

  private ensureIndex(nowMs: number): void {
    const hour = Math.floor(nowMs / HOUR);
    if (hour !== this.indexBuiltForHour || this.indexLiveVersion !== this.liveVersion) {
      this.index.setEvents(this.allEvents(nowMs));
      this.indexBuiltForHour = hour;
      this.indexLiveVersion = this.liveVersion;
    }
  }

  async listEvents(q: ListEventsQuery): Promise<ListEventsResult> {
    const window =
      q.mode === 'live'
        ? { startMs: q.nowMs - TEMPORAL_CONFIG.liveWindowHours * HOUR, endMs: q.nowMs + HOUR }
        : periodAt(q.timeMs, q.resolution);
    const minImportance = q.mode === 'live' ? 1 : minImportanceFor(q.resolution);
    const matches: WorldEvent[] = [];
    for (const e of this.allEvents(q.nowMs)) {
      if (!q.kinds.includes(e.kind)) continue;
      if (e.isDemo && !q.includeDemo) continue;
      if (e.importance < minImportance) continue;
      if (!intersects(temporalSpan(e.time), window)) continue;
      if (q.bbox && !bboxContains(q.bbox, e.location.lat, e.location.lon)) continue;
      matches.push(e);
    }
    matches.sort(
      (a, b) => b.importance - a.importance || parseIso(b.time.start) - parseIso(a.time.start),
    );
    return {
      events: matches.slice(0, q.limit).map(toSummary),
      total: matches.length,
      truncated: matches.length > q.limit,
      window,
      finestPrecision: finestOf(matches.map((e) => e.time.precision)),
    };
  }

  async getEvent(id: string, nowMs: number): Promise<WorldEvent | null> {
    const live = this.live.get(id)?.event;
    if (live) return this.withActions(live);
    const e = this.allEvents(nowMs).find((x) => x.id === id) ?? null;
    return e ? this.withActions(e) : null;
  }

  private withActions(e: WorldEvent): WorldEvent {
    return { ...e, hasTakeAction: this.actionOptions(e).length > 0 };
  }

  async getArticles(eventId: string, nowMs: number): Promise<Article[]> {
    const live = this.live.get(eventId);
    if (live) return live.articles;
    return this.demoData(nowMs).articles.get(eventId) ?? [];
  }

  async getSources(ids: string[]): Promise<NewsSource[]> {
    const out: NewsSource[] = [];
    for (const id of new Set(ids)) {
      const s = this.sources.get(id);
      if (s) out.push(s);
    }
    return out;
  }

  async getRelated(eventId: string, nowMs: number): Promise<RelatedEvent[]> {
    const all = new Map(this.allEvents(nowMs).map((e) => [e.id, e]));
    const out: RelatedEvent[] = [];
    for (const relation of RELATIONS) {
      if (relation.fromId === eventId) {
        const ev = all.get(relation.toId);
        if (ev) out.push({ relation, direction: 'out', event: toSummary(ev) });
      } else if (relation.toId === eventId) {
        const ev = all.get(relation.fromId);
        if (ev) out.push({ relation, direction: 'in', event: toSummary(ev) });
      }
    }
    // Earlier context first for THEN ↔ NOW navigation.
    return out.sort((a, b) => parseIso(b.event.time.start) - parseIso(a.event.time.start));
  }

  async search(
    query: string,
    opts: { limit: number; nowMs: number; includeDemo: boolean },
  ): Promise<SearchResult[]> {
    this.ensureIndex(opts.nowMs);
    return this.index.search(query, opts);
  }

  async density(fromMs: number, toMs: number, bins: number): Promise<number[]> {
    const counts = new Array<number>(bins).fill(0);
    const width = (toMs - fromMs) / bins;
    if (width <= 0) return counts;
    for (const e of HISTORICAL_EVENTS) {
      const t = parseIso(e.time.start);
      if (t < fromMs || t >= toMs) continue;
      counts[Math.min(bins - 1, Math.floor((t - fromMs) / width))]! += e.importance >= 4 ? 2 : 1;
    }
    return counts;
  }

  actionOptions(event: WorldEvent): ActionOption[] {
    if (!ACTIONABLE_CATEGORIES.has(event.category)) return [];
    return ACTION_OPTIONS.filter((o) =>
      event.isDemo
        ? o.eventIds.includes(event.id)
        : event.kind === 'news' &&
          event.confidence >= 0.5 &&
          o.appliesToLiveCategories.includes(event.category),
    );
  }

  actionOption(id: string): ActionOption | null {
    return ACTION_OPTIONS.find((o) => o.id === id) ?? null;
  }

  async frontlinesAt(dateMs: number, conflictId?: string): Promise<Frontline[]> {
    return FRONTLINES.filter((f) => {
      if (conflictId && f.conflictId !== conflictId) return false;
      const from = floorTo(parseIso(f.validFrom), f.datePrecision);
      const to = f.validTo ? parseIso(f.validTo) : Number.POSITIVE_INFINITY;
      return dateMs >= from && dateMs <= to;
    });
  }

  async frontlinesFor(conflictId: string): Promise<Frontline[]> {
    return FRONTLINES.filter((f) => f.conflictId === conflictId);
  }

  async replaceLiveNews(events: BuiltEvent[], nowMs: number): Promise<void> {
    // Keep only events inside the live window; newest ingestion wins for an id.
    const cutoff = nowMs - TEMPORAL_CONFIG.liveWindowHours * HOUR;
    for (const [id, b] of this.live)
      if (parseIso(b.event.updatedAt ?? b.event.time.start) < cutoff) this.live.delete(id);
    for (const b of events) {
      this.live.set(b.event.id, b);
      for (const s of b.sources) if (!this.sources.has(s.id)) this.sources.set(s.id, s);
    }
    this.lastIngestedAt = new Date(nowMs).toISOString();
    this.liveVersion++;
  }

  liveNewsStatus(): { count: number; lastIngestedAt: string | null } {
    return { count: this.live.size, lastIngestedAt: this.lastIngestedAt };
  }
}
