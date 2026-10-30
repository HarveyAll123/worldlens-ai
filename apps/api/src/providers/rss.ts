/**
 * RSS/Atom provider — named-publisher input, never treated as ground truth.
 *
 * The feed list is fixed in this file; no user-supplied URL is ever fetched. Every feed is
 * fetched over HTTPS with a timeout, a response size cap and conditional headers. A failing
 * feed is reported and skipped; it never fails the others or the run.
 *
 * The parser is hand-written so it works unchanged in the Cloudflare Worker and on Node and
 * adds nothing to the bundle. It supports RSS 2.0, RSS 1.0 (RDF, used by DW) and Atom.
 * DOCTYPE and entity declarations are discarded without expansion, so a feed cannot pull in
 * external entities.
 */
import { fetchWithTimeout, type FetchLike } from '../lib/http';

export interface RssFeedConfig {
  name: string;
  url: string;
  domain: string;
  country: string;
  language: string;
  /** True only when this exact URL was fetched and returned a real feed document. */
  verified: boolean;
}

/**
 * Fixed publisher list. `verified: true` means the URL was fetched from the build environment
 * on 2026-10-29 and returned a valid RSS/RDF/Atom document. CBC and NHK were tried and rejected
 * (CBC timed out, NHK returned HTML), so they are not listed.
 */
export const RSS_FEEDS: RssFeedConfig[] = [
  {
    name: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    domain: 'bbc.co.uk',
    country: 'GB',
    language: 'en',
    verified: true,
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    domain: 'aljazeera.com',
    country: 'QA',
    language: 'en',
    verified: true,
  },
  {
    name: 'Deutsche Welle',
    url: 'https://rss.dw.com/rdf/rss-en-world',
    domain: 'dw.com',
    country: 'DE',
    language: 'en',
    verified: true,
  },
  {
    name: 'France 24',
    url: 'https://www.france24.com/en/rss',
    domain: 'france24.com',
    country: 'FR',
    language: 'en',
    verified: true,
  },
  {
    name: 'NPR',
    url: 'https://feeds.npr.org/1004/rss.xml',
    domain: 'npr.org',
    country: 'US',
    language: 'en',
    verified: true,
  },
  {
    name: 'The Guardian',
    url: 'https://www.theguardian.com/world/rss',
    domain: 'theguardian.com',
    country: 'GB',
    language: 'en',
    verified: true,
  },
  {
    name: 'ABC News (Australia)',
    url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    domain: 'abc.net.au',
    country: 'AU',
    language: 'en',
    verified: true,
  },
  {
    name: 'CNA',
    url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
    domain: 'channelnewsasia.com',
    country: 'SG',
    language: 'en',
    verified: true,
  },
  {
    name: 'Africanews',
    url: 'https://www.africanews.com/feed/rss',
    domain: 'africanews.com',
    country: 'CG',
    language: 'en',
    verified: true,
  },
  {
    name: 'RNZ',
    url: 'https://www.rnz.co.nz/rss/world.xml',
    domain: 'rnz.co.nz',
    country: 'NZ',
    language: 'en',
    verified: true,
  },
  {
    name: 'Buenos Aires Times',
    url: 'https://www.batimes.com.ar/feed',
    domain: 'batimes.com.ar',
    country: 'AR',
    language: 'en',
    verified: true,
  },
  {
    name: 'TASS',
    url: 'https://tass.com/rss/v2.xml',
    domain: 'tass.com',
    country: 'RU',
    language: 'en',
    verified: true,
  },
];

export interface RssItem {
  title: string;
  link: string;
  /** Raw date string from the feed; null when absent. */
  published: string | null;
  summary: string | null;
  feed: RssFeedConfig;
}

export interface ParsedFeed {
  kind: 'rss' | 'rdf' | 'atom';
  items: Array<{ title: string; link: string; published: string | null; summary: string | null }>;
}

const MAX_FEED_BYTES = 512 * 1024;
const MAX_ITEMS_PER_FEED = 40;
const FEED_TIMEOUT_MS = 8000;
const MAX_BACKOFF_MS = 30 * 60_000;

/** Decodes the five predefined entities and numeric references. Unknown entities are left alone. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    const e = entity.toLowerCase();
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const code = e.startsWith('#x')
      ? Number.parseInt(e.slice(2), 16)
      : Number.parseInt(e.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

/** Removes DOCTYPE (including an internal subset) without reading any declaration. */
function stripDoctype(xml: string): string {
  let out = xml;
  for (;;) {
    const start = out.indexOf('<!DOCTYPE');
    if (start < 0) break;
    const subset = out.indexOf('[', start);
    const close = out.indexOf('>', start);
    if (subset >= 0 && close > subset) {
      const subsetEnd = out.indexOf(']', subset);
      const end = subsetEnd >= 0 ? out.indexOf('>', subsetEnd) : close;
      out = out.slice(0, start) + out.slice(end + 1);
    } else {
      out = out.slice(0, start) + out.slice(close + 1);
    }
  }
  return out;
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function textOf(block: string, names: string[]): string | null {
  const alt = names.join('|');
  const re = new RegExp(
    `<(?:[\\w.-]+:)?(?:${alt})\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?(?:${alt})>`,
    'i',
  );
  const m = re.exec(block);
  if (!m) return null;
  const raw = stripCdata(m[1]!);
  const withoutTags = raw.replace(/<[^>]*>/g, ' ');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<(?:[\w.-]+:)?link\b([^>]*)\/?>/gi)];
  let fallback: string | null = null;
  for (const l of links) {
    const attrs = l[1] ?? '';
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? 'alternate';
    if (rel === 'alternate') return decodeEntities(href).trim();
    fallback ??= decodeEntities(href).trim();
  }
  return fallback;
}

function itemLink(block: string, kind: ParsedFeed['kind']): string | null {
  if (kind === 'atom') return atomLink(block);
  const text = textOf(block, ['link']);
  if (text) return text;
  return atomLink(block);
}

function itemDate(block: string): string | null {
  return textOf(block, ['pubDate', 'dc:date', 'published', 'updated', 'issued', 'date']);
}

function itemSummary(block: string): string | null {
  return textOf(block, ['description', 'summary', 'content:encoded', 'content']);
}

/** Parses an RSS 2.0, RSS 1.0/RDF or Atom document. Throws on a non-feed document. */
export function parseFeed(xmlInput: string): ParsedFeed {
  const xml = stripDoctype(xmlInput.replace(/^\uFEFF/, ''));
  const head = xml.slice(0, 4000);
  const kind: ParsedFeed['kind'] = /<(?:\w+:)?feed\b/i.test(head)
    ? 'atom'
    : /<(?:\w+:)?RDF\b/i.test(head)
      ? 'rdf'
      : /<(?:\w+:)?rss\b/i.test(head)
        ? 'rss'
        : (() => {
            throw new Error('not a feed');
          })();

  const blockRe = kind === 'atom' ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi;
  const items: ParsedFeed['items'] = [];
  for (const m of xml.matchAll(blockRe)) {
    const block = m[0];
    const title = textOf(block, ['title']);
    const link = itemLink(block, kind);
    if (!title || !link) continue;
    items.push({
      title,
      link,
      published: itemDate(block),
      summary: itemSummary(block),
    });
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  return { kind, items };
}

/** Tracks conditional-request validators and backoff state per feed URL. */
interface FeedState {
  etag?: string;
  lastModified?: string;
  backoffUntil: number;
  failures: number;
}

export interface RssProviderOptions {
  feeds?: RssFeedConfig[];
  fetchImpl?: FetchLike;
  now?: () => number;
}

export class RssProvider {
  readonly name = 'rss';
  private readonly feeds: RssFeedConfig[];
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly state = new Map<string, FeedState>();

  constructor(opts: RssProviderOptions = {}) {
    this.feeds = opts.feeds ?? RSS_FEEDS;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = opts.now ?? Date.now;
  }

  /**
   * Fetches every configured feed. A failing feed is recorded in `errors` and skipped; the
   * returned items still contain every feed that worked.
   */
  async fetchRecent(opts: { maxItems: number }): Promise<{ items: RssItem[]; errors: string[] }> {
    const errors: string[] = [];
    const items: RssItem[] = [];
    const perFeed = Math.max(1, Math.min(opts.maxItems, MAX_ITEMS_PER_FEED));

    const results = await Promise.allSettled(
      this.feeds.map(async (feed) => {
        const state = this.stateFor(feed.url);
        if (state.backoffUntil > this.now()) {
          throw new Error(`${feed.name}: backing off`);
        }
        const res = await this.fetchFeed(feed, state);
        if (res === null) return [] as RssItem[];
        let parsed: ParsedFeed;
        try {
          parsed = parseFeed(res);
        } catch (err) {
          throw new Error(`${feed.name}: ${err instanceof Error ? err.message : String(err)}`, {
            cause: err,
          });
        }
        return parsed.items.slice(0, perFeed).map((i): RssItem => ({
          title: i.title,
          link: i.link,
          published: i.published,
          summary: i.summary,
          feed,
        }));
      }),
    );

    for (const [i, r] of results.entries()) {
      const feed = this.feeds[i]!;
      if (r.status === 'fulfilled') {
        items.push(...r.value);
        this.stateFor(feed.url).failures = 0;
        this.stateFor(feed.url).backoffUntil = 0;
      } else {
        const state = this.stateFor(feed.url);
        state.failures += 1;
        const wait = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** (state.failures - 1));
        state.backoffUntil = this.now() + wait;
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        errors.push(message);
      }
    }
    return { items, errors };
  }

  private stateFor(url: string): FeedState {
    let s = this.state.get(url);
    if (!s) {
      s = { backoffUntil: 0, failures: 0 };
      this.state.set(url, s);
    }
    return s;
  }

  private async fetchFeed(feed: RssFeedConfig, state: FeedState): Promise<string | null> {
    const headers: Record<string, string> = {
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.1',
      'User-Agent': 'WorldLens/0.1 (+https://github.com/HarveyAll123/worldlens-ai)',
    };
    if (state.etag) headers['If-None-Match'] = state.etag;
    if (state.lastModified) headers['If-Modified-Since'] = state.lastModified;

    const res = await fetchWithTimeout(feed.url, {
      provider: 'rss',
      timeoutMs: FEED_TIMEOUT_MS,
      retries: 0,
      fetchImpl: this.fetchImpl,
      headers,
    });
    if (res.status === 304) return null;
    if (res.status === 429 || res.status >= 500)
      throw new Error(`${feed.name}: HTTP ${res.status}`);
    if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_FEED_BYTES) throw new Error(`${feed.name}: feed too large`);
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new Error(`${feed.name}: feed too large`);

    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');
    if (etag) state.etag = etag;
    if (lastModified) state.lastModified = lastModified;
    return text;
  }
}
