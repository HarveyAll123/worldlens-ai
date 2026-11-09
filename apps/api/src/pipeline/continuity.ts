/**
 * Step 8: one event per story across ingestion runs.
 *
 * Every run re-clusters the whole news window and names each cluster after its earliest article.
 * That article changes from run to run: after a restart the GDELT window refills from the newest
 * file backwards (on Workers every run starts afresh), and the window slides as time passes. The
 * same story then came back under a new id while the copies from earlier runs stayed — one
 * syndicated headline was listed six times.
 *
 * A cluster continues an earlier event when it holds at least half of that event's articles that
 * this run still sees, or carries the same specific headline at the same place within 72 hours.
 * It takes the earlier id (an open card or a link in a chat keeps working), and the story's
 * articles, sources and time span add up across the copies. Any other earlier event of the same
 * story is merged into it. Nothing is deleted: repositories hide merged events and send their ids
 * on to the event that now carries the story.
 */
import {
  haversineKm,
  parseIso,
  toIso,
  type Article,
  type EventLocation,
  type WorldEvent,
} from '@worldlens/shared';
import { fnv1a64 } from '../lib/cache';
import { importanceFor, type BuiltEvent } from './build-events';

/** An event stored by an earlier run. */
export interface PriorEvent {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  lat: number;
  lon: number;
  precision: EventLocation['precision'];
  countryCode: string | null;
  articleIds: ReadonlySet<string>;
  sourceIds: ReadonlySet<string>;
  /** The articles themselves, when the event is held in memory. */
  articles?: readonly Article[];
}

/** An event of this run, with what it carries over from earlier copies of its story. */
export interface StoryEvent extends BuiltEvent {
  /** Articles of earlier copies that are stored already (not in `articles`): link them too. */
  carriedArticleIds: string[];
}

export interface Continuity {
  events: StoryEvent[];
  /** Earlier event id → id of the event that now carries its story. */
  mergedInto: Map<string, string>;
}

const HOUR = 3_600_000;
/** The clustering's limit too: articles further apart are never one event. */
export const SAME_STORY_MS = 72 * HOUR;
const SAME_PLACE_KM = 300;
/** Shorter headlines ("Live updates", "Photos of the day") recur for different stories. */
const MIN_HEADLINE_WORDS = 5;

/**
 * "Floods hit Selangor – 3,000 evacuated" → "floods hit selangor 3 000 evacuated"; null when
 * the headline is too short to stand for one story.
 */
export function headlineKey(title: string): string | null {
  const words = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words.length >= MIN_HEADLINE_WORDS ? words.join(' ') : null;
}

/** An event held in memory, as a prior for the next run. */
export function priorOf(b: BuiltEvent): PriorEvent {
  const e = b.event;
  return {
    id: e.id,
    title: e.title,
    startMs: parseIso(e.time.start),
    endMs: parseIso(e.time.end ?? e.time.start),
    lat: e.location.lat,
    lon: e.location.lon,
    precision: e.location.precision,
    countryCode: e.location.countryCode ?? null,
    articleIds: new Set(b.articles.map((a) => a.id)),
    sourceIds: new Set([...b.sources.map((s) => s.id), ...b.articles.map((a) => a.sourceId)]),
    articles: b.articles,
  };
}

/** One prior per id: what memory and the database know about it together. */
export function mergePriors(...lists: readonly PriorEvent[][]): PriorEvent[] {
  const byId = new Map<string, PriorEvent>();
  for (const list of lists)
    for (const p of list) {
      const known = byId.get(p.id);
      byId.set(
        p.id,
        known
          ? {
              ...known,
              articleIds: new Set([...known.articleIds, ...p.articleIds]),
              sourceIds: new Set([...known.sourceIds, ...p.sourceIds]),
              articles: known.articles ?? p.articles,
            }
          : p,
      );
    }
  return [...byId.values()];
}

interface Match {
  prior: PriorEvent;
  /** Articles the two have in common. */
  shared: number;
  sameHeadline: boolean;
}

/** When and where an event is, to compare two copies of a headline. */
type Whereabouts = Pick<
  PriorEvent,
  'startMs' | 'endMs' | 'lat' | 'lon' | 'precision' | 'countryCode'
>;

const whereabouts = (b: BuiltEvent): Whereabouts => ({
  startMs: parseIso(b.event.time.start),
  endMs: parseIso(b.event.time.end ?? b.event.time.start),
  lat: b.event.location.lat,
  lon: b.event.location.lon,
  precision: b.event.location.precision,
  countryCode: b.event.location.countryCode ?? null,
});

/**
 * Two copies of one headline tell one story within 72 hours of each other and at the same
 * place: within 300 km, or in the same country when either is placed only by its country or
 * region (GDELT puts "Washington" in the city or in the state).
 */
function oneStory(a: Whereabouts, b: Whereabouts): boolean {
  if (Math.max(a.startMs, b.startMs) - Math.min(a.endMs, b.endMs) > SAME_STORY_MS) return false;
  if (haversineKm(a.lat, a.lon, b.lat, b.lon) <= SAME_PLACE_KM) return true;
  const coarse = (x: EventLocation['precision']) => x === 'country' || x === 'region';
  return (
    (coarse(a.precision) || coarse(b.precision)) &&
    !!a.countryCode &&
    a.countryCode === b.countryCode
  );
}

/** Most shared articles first, then the same headline, then the bigger story. */
const stronger = (a: Match, b: Match) =>
  b.shared - a.shared ||
  Number(b.sameHeadline) - Number(a.sameHeadline) ||
  a.prior.startMs - b.prior.startMs ||
  (a.prior.id < b.prior.id ? -1 : a.prior.id > b.prior.id ? 1 : 0);

const byId = <T>(m: Map<string, T[]>, k: string, v: T) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

/** A new id for a cluster whose own is spoken for (by the earlier copy another cluster continues). */
function freshId(b: BuiltEvent, taken: (id: string) => boolean): string {
  const urls = b.articles.map((a) => a.url).sort();
  for (let i = 0; ; i++) {
    const id = `news-${fnv1a64(`${urls.join('\n')}#${i}`).slice(0, 14)}`;
    if (!taken(id)) return id;
  }
}

export function continueStories(
  built: readonly BuiltEvent[],
  priors: readonly PriorEvent[],
): Continuity {
  const inRun = new Set(built.flatMap((b) => b.articles.map((a) => a.id)));
  const priorsByArticle = new Map<string, PriorEvent[]>();
  const priorsByHeadline = new Map<string, PriorEvent[]>();
  // How many of a prior's articles this run still sees: the rest left the window.
  const stillSeen = new Map<string, number>();
  for (const p of priors) {
    let n = 0;
    for (const a of p.articleIds)
      if (inRun.has(a)) {
        n++;
        byId(priorsByArticle, a, p);
      }
    stillSeen.set(p.id, n);
    const key = headlineKey(p.title);
    if (key) byId(priorsByHeadline, key, p);
  }

  // Bigger stories first, ties in id order: a run is deterministic.
  const order = [...built].sort(
    (x, y) =>
      y.articles.length - x.articles.length ||
      (x.event.id < y.event.id ? -1 : x.event.id > y.event.id ? 1 : 0),
  );
  const rank = new Map(order.map((b, i) => [b, i]));
  const matches = new Map<BuiltEvent, Match[]>();
  for (const b of order) {
    const shared = new Map<PriorEvent, number>();
    for (const a of b.articles)
      for (const p of priorsByArticle.get(a.id) ?? []) shared.set(p, (shared.get(p) ?? 0) + 1);
    const found = new Map<PriorEvent, Match>();
    for (const [p, n] of shared)
      if (2 * n >= stillSeen.get(p.id)!) found.set(p, { prior: p, shared: n, sameHeadline: false });
    const key = headlineKey(b.event.title);
    const here = whereabouts(b);
    for (const p of key ? (priorsByHeadline.get(key) ?? []) : []) {
      if (!oneStory(here, p)) continue;
      const m = found.get(p);
      if (m) m.sameHeadline = true;
      else found.set(p, { prior: p, shared: shared.get(p) ?? 0, sameHeadline: true });
    }
    matches.set(b, [...found.values()].sort(stronger));
  }

  // Strongest links first, across all clusters: shared articles outweigh a shared headline, so
  // a big cluster with the same headline cannot take the copy whose articles another one holds.
  const pairs = [...matches]
    .flatMap(([b, ms]) => ms.map((m) => ({ b, m })))
    .sort((x, y) => stronger(x.m, y.m) || rank.get(x.b)! - rank.get(y.b)!);
  // Each cluster continues at most one earlier copy, and each copy goes on in one cluster.
  const continued = new Map<BuiltEvent, PriorEvent>();
  const claimed = new Set<string>();
  for (const { b, m } of pairs) {
    if (continued.has(b) || claimed.has(m.prior.id)) continue;
    continued.set(b, m.prior);
    claimed.add(m.prior.id);
  }

  // Ids: the continued one; else the cluster's own, unless an earlier copy of a story has it.
  const spoken = new Set<string>();
  for (const ms of matches.values()) for (const m of ms) spoken.add(m.prior.id);
  const idOf = new Map<BuiltEvent, string>();
  for (const [b, p] of continued) idOf.set(b, p.id);
  const used = new Set(idOf.values());
  for (const b of order) {
    if (idOf.has(b)) continue;
    const taken = (id: string) => spoken.has(id) || used.has(id);
    const id = taken(b.event.id) ? freshId(b, taken) : b.event.id;
    idOf.set(b, id);
    used.add(id);
  }

  // Earlier copies nobody continues join the cluster they match best.
  const mergedInto = new Map<string, string>();
  const absorbed = new Map<BuiltEvent, PriorEvent[]>();
  for (const { b, m } of pairs) {
    if (claimed.has(m.prior.id) || mergedInto.has(m.prior.id)) continue;
    mergedInto.set(m.prior.id, idOf.get(b)!);
    absorbed.set(b, [...(absorbed.get(b) ?? []), m.prior]);
  }

  const events = built.map((b): StoryEvent => {
    const copies = [continued.get(b), ...(absorbed.get(b) ?? [])].filter(
      (p): p is PriorEvent => !!p,
    );
    const id = idOf.get(b)!;
    if (copies.length === 0 && id === b.event.id) return { ...b, carriedArticleIds: [] };
    // The story's articles: this run's, those earlier copies hold in memory, then the ids of
    // the ones only the database has.
    const articles = [...b.articles];
    const held = new Set(articles.map((a) => a.id));
    for (const p of copies)
      for (const a of p.articles ?? [])
        if (!held.has(a.id)) {
          held.add(a.id);
          articles.push(a);
        }
    const carried = new Set<string>();
    for (const p of copies) for (const a of p.articleIds) if (!held.has(a)) carried.add(a);
    const sources = new Set([...b.sources.map((s) => s.id), ...b.articles.map((a) => a.sourceId)]);
    let { startMs, endMs } = whereabouts(b);
    for (const p of copies) {
      startMs = Math.min(startMs, p.startMs);
      endMs = Math.max(endMs, p.endMs);
      for (const s of p.sourceIds) sources.add(s);
    }
    const time = { ...b.event.time, start: toIso(startMs) };
    if (endMs - startMs > HOUR) time.end = toIso(endMs);
    else delete time.end;
    const updatedMs = Math.max(endMs, parseIso(b.event.updatedAt ?? b.event.time.start));
    return {
      ...b,
      articles,
      carriedArticleIds: [...carried].sort(),
      event: {
        ...b.event,
        id,
        time,
        articleCount: Math.max(b.event.articleCount, held.size + carried.size),
        sourceCount: Math.max(b.event.sourceCount, sources.size),
        importance: Math.max(
          b.event.importance,
          importanceFor(sources.size),
        ) as WorldEvent['importance'],
        updatedAt: toIso(updatedMs),
      },
    };
  });
  return { events, mergedInto };
}

/**
 * Copies of one story among stored events, as ingestions left them before stories kept their
 * ids: two are one story when most of the smaller one's articles are in the other, or they carry
 * the same specific headline close in time and place. Each copy → the event its story is kept
 * in: the one with the most articles, then the first reported.
 */
export function duplicateCopies(stored: readonly PriorEvent[]): Map<string, string> {
  const root = new Map(stored.map((p) => [p.id, p.id]));
  const find = (id: string): string => {
    let r = id;
    while (root.get(r) !== r) r = root.get(r)!;
    root.set(id, r);
    return r;
  };
  const join = (a: PriorEvent, b: PriorEvent) => root.set(find(a.id), find(b.id));
  const byArticle = new Map<string, PriorEvent[]>();
  const byHeadline = new Map<string, PriorEvent[]>();
  for (const p of stored) {
    for (const a of p.articleIds) byId(byArticle, a, p);
    const key = headlineKey(p.title);
    if (key) byId(byHeadline, key, p);
  }
  const tried = new Set<string>();
  for (const group of byArticle.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const pair = a.id < b.id ? `${a.id} ${b.id}` : `${b.id} ${a.id}`;
        if (tried.has(pair)) continue;
        tried.add(pair);
        let shared = 0;
        for (const x of a.articleIds) if (b.articleIds.has(x)) shared++;
        if (2 * shared >= Math.min(a.articleIds.size, b.articleIds.size)) join(a, b);
      }
  for (const group of byHeadline.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (oneStory(group[i]!, group[j]!)) join(group[i]!, group[j]!);

  const stories = new Map<string, PriorEvent[]>();
  for (const p of stored) byId(stories, find(p.id), p);
  const kept = (a: PriorEvent, b: PriorEvent) =>
    b.articleIds.size - a.articleIds.size ||
    a.startMs - b.startMs ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const into = new Map<string, string>();
  for (const copies of stories.values()) {
    if (copies.length < 2) continue;
    const [keeper, ...others] = [...copies].sort(kept);
    for (const c of others) into.set(c.id, keeper!.id);
  }
  return into;
}
