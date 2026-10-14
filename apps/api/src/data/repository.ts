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

export interface ListEventsQuery {
  mode: 'live' | 'historical';
  timeMs: number;
  resolution: Resolution;
  nowMs: number;
  bbox: BBox | null;
  kinds: EventKind[];
  includeDemo: boolean;
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

/** Read/write access to events. Implementations: in-memory (curated + demo + live cache), PostgreSQL (Neon). */
export interface EventRepository {
  readonly name: string;
  listEvents(q: ListEventsQuery): Promise<ListEventsResult>;
  getEvent(id: string, nowMs: number): Promise<WorldEvent | null>;
  getArticles(eventId: string, nowMs: number): Promise<Article[]>;
  getSources(ids: string[]): Promise<NewsSource[]>;
  getRelated(eventId: string, nowMs: number): Promise<RelatedEvent[]>;
  search(
    query: string,
    opts: { limit: number; nowMs: number; includeDemo: boolean },
  ): Promise<SearchResult[]>;
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
