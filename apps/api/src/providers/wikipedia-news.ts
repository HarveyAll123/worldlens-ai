/**
 * News of the past, from 2000 to the live window: Wikipedia's Current events portal (one page
 * per day, written and sourced by editors, with links to the outlets) and, for the years before
 * its daily pages and for whole years, the year articles ("2001" → Events). Before 2000 the
 * globe shows history (curated events and battles), not news.
 *
 * Pages are fetched when the timeline shows them (one request per month of days, or per year),
 * read as wikitext, and placed on the globe with the same locating as live news; items that
 * name no place stay off the globe. Results are cached: past pages rarely change.
 */
import {
  extractYears,
  toIso,
  utcMs,
  type Article,
  type EventCategory,
  type EventLocation,
  type NewsSource,
  type WorldEvent,
} from '@worldlens/shared';
import { NEWS_SOURCES } from '@worldlens/shared/data';
import { fnv1a64 } from '../lib/cache';
import { fetchWithTimeout, type FetchLike } from '../lib/http';
import { categorize } from '../pipeline/categorize';
import { extractEntities } from '../pipeline/entities';
import { locationCandidates, resolveLocation, type LocationCandidate } from '../pipeline/locate';
import { unknownSource } from '../pipeline/normalize';

/** News starts here; earlier dates are history. */
export const PAST_NEWS_FROM_MS = Date.UTC(2000, 0, 1);
/** The portal's daily pages begin in 2003; 2000–2002 come from the year articles. */
export const PORTAL_DAYS_FROM_YEAR = 2003;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const PORTAL_PREFIX = 'Portal:Current events/';
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** One news item as Wikipedia lists it. */
export interface PastItem {
  date: string; // YYYY-MM-DD
  text: string;
  /** The topics it sits under (portal): "2026 Iran war", "2026 Strait of Hormuz crisis". */
  topics: string[];
  /** The portal's section ("Disasters and accidents"). */
  heading: string | null;
  sources: { url: string; name: string }[];
  /** Linked articles, first the most specific. */
  links: string[];
  origin: 'portal' | 'year';
}

export interface PastEvent {
  event: WorldEvent;
  articles: Article[];
  sources: NewsSource[];
}

/* ------------------------------------------------------------------------ wikitext */

function stripTemplates(s: string): string {
  let out = s;
  for (let i = 0; i < 8; i++) {
    const next = out.replace(/\{\{[^{}]*\}\}/g, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Wikitext of one line → plain text, with its links and its external sources. */
export function plainText(wikitext: string): {
  text: string;
  links: string[];
  sources: { url: string; name: string }[];
} {
  const links: string[] = [];
  const sources: { url: string; name: string }[] = [];
  let s = wikitext.replace(/<!--[\s\S]*?-->/g, '');
  // References: their cited URLs are sources too (year articles).
  s = s
    .replace(/<ref[^>/]*\/>/g, '')
    .replace(/<ref[^>]*>([\s\S]*?)<\/ref>/g, (_all, inner: string) => {
      const url = /\burl\s*=\s*(https?:\/\/[^\s|}]+)/.exec(inner)?.[1];
      const name =
        /\b(?:work|website|publisher|newspaper|agency)\s*=\s*([^|}]+)/.exec(inner)?.[1]?.trim() ??
        '';
      if (url) sources.push({ url, name: stripTemplates(name).replace(/\[\[|\]\]|'''?/g, '') });
      return '';
    });
  s = stripTemplates(s);
  // [https://… (Reuters)] → a source, not text.
  s = s.replace(/\[(https?:\/\/[^\s\]]+)\s*([^\]]*)\]/g, (_all, url: string, label: string) => {
    sources.push({
      url,
      name: label
        .replace(/^\(|\)$/g, '')
        .replace(/''/g, '')
        .trim(),
    });
    return '';
  });
  // [[target|label]] → label, [[target]] → target; links kept in reading order.
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_all, target: string, label?: string) => {
    if (/^(File|Image|Category):/i.test(target.trim())) return '';
    links.push(target.trim());
    return label ?? target;
  });
  s = s
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
  return { text: s, links, sources };
}

/** "Portal:Current events/2020 March 15" for 2020-03-15. */
/** "Portal:Current events/2011 March 14" → "2011-03-14" (monthly and other pages: null). */
export function dayOfPortalTitle(title: string): string | null {
  const m = /^Portal:Current events\/(\d{4}) ([A-Z][a-z]+) (\d{1,2})$/.exec(title);
  const month = m ? MONTHS.indexOf(m[2]!) : -1;
  if (!m || month < 0) return null;
  return `${m[1]}-${String(month + 1).padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
}

/** Words for Wikipedia's search: no operators (prefix:, intitle:, quotes, regexes). */
export function searchWords(query: string): string {
  return query
    .replace(/\b(1[0-9]{3}|2[0-9]{3})s?\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/(^|\s)-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function portalTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `Portal:Current events/${y} ${MONTHS[m - 1]} ${d}`;
}

/** The items of one day of the Current events portal (the leaves under their topics). */
export function parseCurrentEventsDay(wikitext: string, date: string): PastItem[] {
  const out: PastItem[] = [];
  let heading: string | null = null;
  const topics: string[] = [];
  for (const line of wikitext.split('\n')) {
    // Sections: '''Disasters and accidents''' (recent pages) or ;Disasters and accidents.
    const head = /^(?:'''([^']+)'''|;\s*(.+))\s*$/.exec(line.trim());
    if (head) {
      heading = (head[1] ?? head[2]!).trim();
      topics.length = 0;
      continue;
    }
    const bullet = /^(\*+)\s*(.*)$/.exec(line);
    if (!bullet) continue;
    const level = bullet[1]!.length;
    const { text, links, sources } = plainText(bullet[2]!);
    if (!text) continue;
    topics.length = level - 1;
    // A topic line only names articles ("2026 Iran war"); a news line is a sentence.
    const sentence = /[.!?]["”']?$/.test(text) || text.split(' ').length > 14;
    if (!sentence && sources.length === 0) {
      topics[level - 1] = text;
      continue;
    }
    out.push({
      date,
      text,
      topics: topics.filter(Boolean),
      heading,
      sources,
      links,
      origin: 'portal',
    });
  }
  return out;
}

/** The Events section of a year article: "* [[January 13]] – A 7.6-magnitude earthquake…". */
export function parseYearEvents(wikitext: string, year: number): PastItem[] {
  const start = wikitext.search(/^==\s*Events\s*==\s*$/m);
  if (start < 0) return [];
  const rest = wikitext.slice(start).replace(/^==\s*Events\s*==\s*$/m, '');
  const end = rest.search(/^==[^=]/m);
  const section = end < 0 ? rest : rest.slice(0, end);
  const out: PastItem[] = [];
  let month = 0;
  let dated: string | null = null;
  const dateRe = new RegExp(`^(${MONTHS.join('|')})\\s+(\\d{1,2})\\s*(?:[–—-]\\s*(.*))?$`);
  for (const line of section.split('\n')) {
    const head = /^===\s*([A-Za-z]+)\s*===/.exec(line);
    if (head) {
      const i = MONTHS.indexOf(head[1]!);
      if (i >= 0) month = i + 1;
      dated = null;
      continue;
    }
    const bullet = /^(\*+)\s*(.*)$/.exec(line);
    if (!bullet || !month) continue;
    const { text, links, sources } = plainText(bullet[2]!);
    const m = dateRe.exec(text);
    let body = text;
    if (m) {
      const day = Number(m[2]);
      dated = `${year}-${String(MONTHS.indexOf(m[1]!) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      body = (m[3] ?? '').trim();
      if (!body) continue; // a date over several items ("* September 11" then "** …")
    } else if (bullet[1]!.length === 1) dated = null;
    if (!dated || body.length < 20) continue;
    out.push({
      date: dated,
      text: body,
      topics: [],
      heading: null,
      sources,
      links: links.filter((l) => !dateRe.test(l)),
      origin: 'year',
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- events */

const HEADING_CATEGORY: Record<string, EventCategory> = {
  'armed conflicts and attacks': 'conflict',
  'disasters and accidents': 'disaster',
  'politics and elections': 'politics',
  'international relations': 'diplomacy',
  'business and economy': 'economy',
  'health and environment': 'health',
  'science and technology': 'science',
  'law and crime': 'society',
  'arts and culture': 'society',
  sports: 'society',
};

/** The first sentence, for the title. */
function firstSentence(text: string): string {
  const m = /^(.{30,}?[.!?])\s+[A-Z“"]/.exec(text);
  const s = (m ? m[1]! : text).trim();
  return s.length > 200 ? `${s.slice(0, s.lastIndexOf(' ', 197))}…` : s;
}

const sourceByDomain = (host: string): NewsSource =>
  NEWS_SOURCES.find((s) => host === s.domain || host.endsWith(`.${s.domain}`)) ??
  unknownSource(host, null);

const wikiUrl = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':')}`;

/**
 * The place a news sentence is about: the first specific place it names (a city, sea or region
 * — "a tanker in the Strait of Hormuz"), else the first country it names, else the usual vote.
 */
function placeOf(text: string): EventLocation | null {
  const candidates = locationCandidates(extractEntities(text));
  if (candidates.length === 0) return null;
  const lower = text.toLowerCase();
  const at = (c: LocationCandidate) => {
    const name = c.location.name.split(',')[0]!.trim().toLowerCase();
    const m = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(lower);
    return m ? m.index : Infinity;
  };
  const first = (cs: LocationCandidate[]) =>
    cs
      .map((c) => ({ c, i: at(c) }))
      .filter((x) => x.i < Infinity)
      .sort((a, b) => a.i - b.i || b.c.score - a.c.score)[0]?.c.location ?? null;
  return (
    first(candidates.filter((c) => c.location.precision !== 'country')) ??
    first(candidates.filter((c) => c.location.precision === 'country')) ??
    resolveLocation([candidates])
  );
}

export function buildPastEvent(item: PastItem, nowMs: number): PastEvent | null {
  if (item.text.length < 25) return null;
  // News sentences name their place first ("…in Oleshky, Ukraine, as a convoy … brokered by the
  // United States"): the first sentence decides; the rest of the item, then its topics, only
  // when it names no place.
  const title = firstSentence(item.text);
  const location =
    placeOf(title) ??
    placeOf(item.text) ??
    resolveLocation([item.topics.flatMap((t) => locationCandidates(extractEntities(t)))]);
  if (!location) return null;
  const byHeading = item.heading ? HEADING_CATEGORY[item.heading.toLowerCase()] : undefined;
  const category = byHeading ?? categorize(item.text).category;
  const id = `wnews-${item.date}-${fnv1a64(`${item.origin}|${item.text}`).slice(0, 12)}`;
  const sources = new Map<string, NewsSource>();
  const articles: Article[] = [];
  for (const s of item.sources) {
    let url: URL;
    try {
      url = new URL(s.url);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:') continue;
    const source = sourceByDomain(url.hostname.replace(/^www\./, ''));
    sources.set(source.id, source);
    articles.push({
      id: `art-${fnv1a64(url.toString())}`,
      sourceId: source.id,
      headline: title,
      url: url.toString(),
      publishedAt: `${item.date}T12:00:00Z`,
      language: 'English',
      sourceCountry: null,
      isDemo: false,
    });
  }
  const page =
    item.origin === 'portal'
      ? portalTitle(item.date)
      : `${item.date.slice(0, 4)}#${MONTHS[Number(item.date.slice(5, 7)) - 1]}`;
  const topic = item.links.find((l) => !/^(File|Image|Category):/i.test(l));
  const event: WorldEvent = {
    id,
    kind: 'news',
    isDemo: false,
    title,
    summary: item.text.length > 600 ? `${item.text.slice(0, 597)}…` : item.text,
    category,
    tags: item.topics.slice(0, 4),
    time: { start: `${item.date}T00:00:00Z`, precision: 'day', approximate: false },
    location,
    extraLocations: [],
    participants: [],
    references: [
      ...(topic
        ? [
            {
              title: topic,
              url: wikiUrl(topic),
              publisher: 'Wikipedia',
              kind: 'encyclopedia' as const,
              license: 'CC BY-SA 4.0',
            },
          ]
        : []),
      {
        title:
          item.origin === 'portal'
            ? `Current events, ${item.date}`
            : `Events of ${item.date.slice(0, 4)}`,
        url: wikiUrl(page.split('#')[0]!) + (page.includes('#') ? `#${page.split('#')[1]}` : ''),
        publisher: 'Wikipedia',
        kind: 'encyclopedia' as const,
        license: 'CC BY-SA 4.0',
      },
    ],
    // A year article's events are the year's notable ones; a day's, the day's news.
    importance: (item.origin === 'year'
      ? 4
      : Math.min(3, 1 + Math.min(2, sources.size))) as WorldEvent['importance'],
    confidence: Math.min(0.9, location.confidence + 0.1),
    articleCount: articles.length,
    sourceCount: sources.size,
    hasTakeAction: false,
    provenance: {
      provider: 'wikipedia',
      note:
        item.origin === 'portal'
          ? `From Wikipedia's Current events portal (${item.date}), written and sourced by its editors.`
          : `From Wikipedia's article on ${item.date.slice(0, 4)} (Events).`,
      retrievedAt: toIso(nowMs),
    },
    updatedAt: `${item.date}T00:00:00Z`,
  };
  return { event, articles, sources: [...sources.values()] };
}

/* ------------------------------------------------------------------------ provider */

interface Cached {
  events: PastEvent[];
  /** The page does not exist (a day before the portal's daily pages). */
  missing: boolean;
  atMs: number;
}

export class WikipediaNewsProvider {
  private cache = new Map<string, Cached>();
  private inflight = new Map<string, Promise<void>>();
  /** Wikipedia search answers (query → days), kept an hour. */
  private searches = new Map<string, { days: string[]; atMs: number }>();

  constructor(
    private readonly userAgent: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Past days keep a week; the last few days are rechecked hourly (editors still add news). */
  private fresh(key: string, c: Cached): boolean {
    const date = key.slice(key.indexOf(':') + 1);
    const recent =
      this.now() - Date.parse(`${date.length === 4 ? `${date}-12-31` : date}T00:00:00Z`) < 10 * DAY;
    return this.now() - c.atMs < (recent ? 3_600_000 : 7 * DAY);
  }

  private async fetchPages(titles: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(batch.join('|'))}`;
      const res = await fetchWithTimeout(url, {
        provider: 'wikipedia',
        timeoutMs: 20_000,
        retries: 1,
        fetchImpl: this.fetchImpl,
        headers: { 'User-Agent': this.userAgent, 'Api-User-Agent': this.userAgent },
      });
      if (!res.ok) throw new Error(`wikipedia: HTTP ${res.status}`);
      const body = (await res.json()) as {
        query?: {
          normalized?: { from: string; to: string }[];
          pages?: {
            title: string;
            missing?: boolean;
            revisions?: { slots: { main: { content: string } } }[];
          }[];
        };
      };
      const back = new Map((body.query?.normalized ?? []).map((n) => [n.to, n.from]));
      for (const p of body.query?.pages ?? []) {
        const title = back.get(p.title) ?? p.title;
        out.set(title, p.missing ? null : (p.revisions?.[0]?.slots.main.content ?? null));
      }
    }
    return out;
  }

  /** Loads the given days and years that are not cached (one request per 50 pages). */
  private async load(days: string[], years: number[]): Promise<void> {
    const want: { key: string; title: string; parse: (w: string) => PastItem[] }[] = [];
    for (const d of days) {
      const key = `day:${d}`;
      const c = this.cache.get(key);
      if (!c || !this.fresh(key, c))
        want.push({ key, title: portalTitle(d), parse: (w) => parseCurrentEventsDay(w, d) });
    }
    for (const y of years) {
      const key = `year:${y}`;
      const c = this.cache.get(key);
      if (!c || !this.fresh(key, c))
        want.push({ key, title: String(y), parse: (w) => parseYearEvents(w, y) });
    }
    if (want.length === 0) return;
    const flightKey = want.map((w) => w.key).join(',');
    let flight = this.inflight.get(flightKey);
    if (!flight) {
      flight = (async () => {
        const pages = await this.fetchPages(want.map((w) => w.title));
        const at = this.now();
        for (const w of want) {
          const text = pages.get(w.title);
          const events =
            text === undefined || text === null
              ? []
              : w.parse(text).flatMap((item) => buildPastEvent(item, at) ?? []);
          this.cache.set(w.key, { events, missing: text === undefined || text === null, atMs: at });
        }
      })().finally(() => this.inflight.delete(flightKey));
      this.inflight.set(flightKey, flight);
    }
    await flight;
  }

  /**
   * Past news in a window (clamped to 2000 … `untilMs`): a day's or month's portal pages, the
   * year article for days without one; whole years (coarser views) from year articles only.
   */
  async eventsIn(
    window: { startMs: number; endMs: number },
    untilMs: number,
  ): Promise<PastEvent[]> {
    const from = Math.max(window.startMs, PAST_NEWS_FROM_MS);
    const to = Math.min(window.endMs, untilMs);
    if (from >= to) return [];
    const startDay = Math.floor(from / DAY) * DAY;
    const yearsOf = (a: number, b: number) => {
      const out: number[] = [];
      for (let y = new Date(a).getUTCFullYear(); y <= new Date(b - 1).getUTCFullYear(); y++)
        out.push(y);
      return out;
    };
    const inWindow = (e: PastEvent) => {
      const t = Date.parse(e.event.time.start);
      return t >= startDay && t < to;
    };
    if (to - startDay <= 62 * DAY) {
      const days: string[] = [];
      for (let t = startDay; t < to; t += DAY) days.push(toIso(t).slice(0, 10));
      await this.load(days, []);
      const covered = new Set(days.filter((d) => !this.cache.get(`day:${d}`)?.missing));
      const fromPortal = days.flatMap((d) => this.cache.get(`day:${d}`)?.events ?? []);
      if (covered.size === days.length) return fromPortal;
      // Days the portal has no page for (before its daily pages): the year article's events.
      const years = yearsOf(startDay, to);
      await this.load([], years);
      const fromYears = years
        .flatMap((y) => this.cache.get(`year:${y}`)?.events ?? [])
        .filter((e) => inWindow(e) && !covered.has(e.event.time.start.slice(0, 10)));
      return [...fromPortal, ...fromYears];
    }
    const years = yearsOf(startDay, to).slice(-30);
    await this.load([], years);
    return years.flatMap((y) => this.cache.get(`year:${y}`)?.events ?? []).filter(inWindow);
  }

  /** Days whose Current events page mentions the words (Wikipedia's own search), best first. */
  private async searchDays(words: string, prefix: string, limit: number): Promise<string[]> {
    const key = `${prefix}|${words.toLowerCase()}`;
    const hit = this.searches.get(key);
    if (hit && this.now() - hit.atMs < HOUR) return hit.days;
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srnamespace=100&srprop=&format=json&formatversion=2&srlimit=${limit}&srsearch=${encodeURIComponent(`${words} prefix:${prefix}`)}`;
    const res = await fetchWithTimeout(url, {
      provider: 'wikipedia',
      timeoutMs: 10_000,
      retries: 1,
      fetchImpl: this.fetchImpl,
      headers: { 'User-Agent': this.userAgent, 'Api-User-Agent': this.userAgent },
    });
    if (!res.ok) throw new Error(`wikipedia search: HTTP ${res.status}`);
    const body = (await res.json()) as { query?: { search?: { title: string }[] } };
    const days = (body.query?.search ?? []).flatMap((r) => dayOfPortalTitle(r.title) ?? []);
    if (this.searches.size > 300) this.searches.clear();
    this.searches.set(key, { days, atMs: this.now() });
    return days;
  }

  /**
   * Past news that may match a query ("Fukushima", "Italy lockdown 2020", "Concorde crash"):
   * the days whose Current events page mentions it (Wikipedia's own search) and, for 2000–2002,
   * the year articles. Years in the query and `window` narrow it; a short span is read whole.
   * The caller ranks the items (data/past-news.ts).
   */
  async matching(
    query: string,
    opts: { untilMs: number; window?: { startMs: number; endMs: number } },
  ): Promise<PastEvent[]> {
    const years = extractYears(query).filter((y) => y >= 1990 && y <= 2100);
    const from = Math.max(
      PAST_NEWS_FROM_MS,
      opts.window?.startMs ?? -Infinity,
      years.length ? utcMs(Math.min(...years)) : -Infinity,
    );
    const to = Math.min(
      opts.untilMs,
      opts.window?.endMs ?? Infinity,
      years.length ? utcMs(Math.max(...years) + 1) : Infinity,
    );
    if (from >= to) return [];
    const words = searchWords(query);
    if (!words && years.length === 0 && !opts.window) return [];
    // A short span is read whole; a longer one with no words: its year articles.
    if (to - from <= 62 * DAY || !words)
      return this.eventsIn({ startMs: from, endMs: to }, opts.untilMs);
    {
      const y0 = new Date(from).getUTCFullYear();
      const y1 = new Date(to - 1).getUTCFullYear();
      const days =
        y1 < PORTAL_DAYS_FROM_YEAR
          ? []
          : (
              await this.searchDays(
                words,
                y0 === y1 ? `${PORTAL_PREFIX}${y0}` : PORTAL_PREFIX,
                y0 === y1 ? 20 : 30,
              )
            ).filter((d) => {
              const t = Date.parse(`${d}T00:00:00Z`);
              return t >= from && t < to;
            });
      const early: number[] = [];
      for (let y = y0; y <= Math.min(y1, PORTAL_DAYS_FROM_YEAR - 1); y++) early.push(y);
      await this.load(days, early);
      const inSpan = (e: PastEvent) => {
        const t = Date.parse(e.event.time.start);
        return t >= from && t < to;
      };
      return [
        ...days.flatMap((d) => this.cache.get(`day:${d}`)?.events ?? []),
        ...early.flatMap((y) => this.cache.get(`year:${y}`)?.events ?? []).filter(inSpan),
      ];
    }
  }

  /** One past-news event by id ("wnews-2020-03-15-…"), loading its day or year if needed. */
  async find(id: string): Promise<PastEvent | null> {
    const date = /^wnews-(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1];
    if (!date) return null;
    const look = () =>
      [this.cache.get(`day:${date}`), this.cache.get(`year:${date.slice(0, 4)}`)]
        .flatMap((c) => c?.events ?? [])
        .find((e) => e.event.id === id) ?? null;
    const hit = look();
    if (hit) return hit;
    await this.load([date], [Number(date.slice(0, 4))]);
    return look();
  }

  /** Sources of loaded past news (their outlets), by id. */
  sourcesById(ids: string[]): NewsSource[] {
    const want = new Set(ids);
    const out = new Map<string, NewsSource>();
    for (const c of this.cache.values())
      for (const e of c.events) for (const s of e.sources) if (want.has(s.id)) out.set(s.id, s);
    return [...out.values()];
  }
}
