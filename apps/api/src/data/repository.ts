import type {
  ActionOption,
  Article,
  BBox,
  EventKind,
  EventRelation,
  EventSummary,
  Frontline,
  Granularity,
  NewsSource,
  Resolution,
  SearchResult,
  WorldEvent,
} from '@worldlens/shared';
import type { BuiltEvent } from '../pipeline/build-events';
import type { TimeWindow } from './search';

export interface ListEventsQuery {
  mode: 'live' | 'historical';
  timeMs: number;
  resolution: Resolution;
  nowMs: number;
  bbox: BBox | null;
  kinds: EventKind[];
  includeDemo: boolean;
  /** Wikidata battle layer (historical kind). Default: included. */
  includeBattles?: boolean;
  limit: number;
}

export interface ListEventsResult {
  events: EventSummary[];
  total: number;
  truncated: boolean;
  window: { startMs: number; endMs: number };
  /** Finest date precision among events in the window — drives navigator resolution limits. */
  finestPrecision: Granularity | null;
}

export interface RelatedEvent {
  relation: EventRelation;
  direction: 'out' | 'in';
  event: EventSummary;
}

export interface SearchOptions {
  limit: number;
  nowMs: number;
  includeDemo: boolean;
  window?: TimeWindow;
  /**
   * Also the news of the past (2000 to the live days, from Wikipedia) when the repository has
   * it, merged by score. Slower — it asks Wikipedia — so for the assistant; the search bar
   * shows them as their own group (searchPast).
   */
  includePast?: boolean;
}

/** Read/write access to events. Implementations: in-memory (curated + demo + live cache), PostgreSQL (Neon). */
export interface EventRepository {
  readonly name: string;
  listEvents(q: ListEventsQuery): Promise<ListEventsResult>;
  getEvent(id: string, nowMs: number): Promise<WorldEvent | null>;
  getArticles(eventId: string, nowMs: number): Promise<Article[]>;
  getSources(ids: string[]): Promise<NewsSource[]>;
  getRelated(eventId: string, nowMs: number): Promise<RelatedEvent[]>;
  search(query: string, opts: SearchOptions): Promise<SearchResult[]>;
  /**
   * Only the news of the past matching a query, best first (the search bar's "News since 2000").
   * Absent when the repository has none; rejects when its source cannot be reached.
   */
  searchPast?(query: string, opts: SearchOptions): Promise<SearchResult[]>;
  /** Load the live news another instance stored (database repositories only). */
  hydrateLive?(nowMs: number): Promise<void>;
  /** When any instance last stored live news (database repositories only). */
  latestIngestionMs?(nowMs: number): Promise<number | null>;
  density(fromMs: number, toMs: number, bins: number): Promise<number[]>;
  actionOptions(event: WorldEvent): ActionOption[];
  actionOption(id: string): ActionOption | null;
  frontlinesAt(dateMs: number, conflictId?: string): Promise<Frontline[]>;
  frontlinesFor(conflictId: string): Promise<Frontline[]>;
  replaceLiveNews(events: BuiltEvent[], nowMs: number): Promise<void>;
  liveNewsStatus(): { count: number; lastIngestedAt: string | null };
}

/** Level-of-detail filter: coarse resolutions only show more important events. */
export function minImportanceFor(resolution: Resolution): number {
  switch (resolution) {
    case 'century':
      return 4;
    case 'decade':
      return 3;
    default:
      return 1;
  }
}
