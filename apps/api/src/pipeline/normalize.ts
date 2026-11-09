/** Step 1–2 of ingestion: normalise provider records and remove duplicates. */
import {
  SafeUrlSchema,
  headlineSimilarity,
  sanitizeText,
  type NewsSource,
} from '@worldlens/shared';
import { sourceForDomain } from '@worldlens/shared/data';
import { fnv1a64 } from '../lib/cache';
import { stripOutletSuffix } from '../lib/headline';
import { parseSeenDate, type GdeltArticle, type PlaceHint } from '../providers/gdelt';
import type { RssItem } from '../providers/rss';

export interface NormalizedArticle {
  id: string;
  /** Which provider supplied the record: GDELT discovery or a named RSS publisher. */
  origin: 'gdelt' | 'rss';
  url: string;
  headline: string;
  publishedAtMs: number;
  domain: string;
  language: string | null;
  /** Publisher country as reported by the provider (NOT the event location). */
  sourceCountry: string | null;
  imageUrl: string | null;
  source: NewsSource;
  duplicates: number;
  /** Short provider excerpt (RSS only); GDELT gives none. */
  snippet?: string;
  /** Geocoded places the headline names (GDELT GKG files); preferred when locating. */
  placeHints?: PlaceHint[];
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|ref_src|cmpid|ncid|ocid|smid|ito)/i;

/** Canonical form used for identity: https, lowercase host, no tracking params, no fragment. */
export function canonicalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:') return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

export function unknownSource(domain: string, country: string | null): NewsSource {
  return {
    id: `src-auto-${fnv1a64(domain).slice(0, 10)}`,
    name: domain,
    domain,
    country: null,
    sourceType: 'unknown',
    ownership: null,
    nationalPerspective: country,
    rating: {
      value: 'UNRATED',
      methodology: null,
      source: null,
      sourceUrl: null,
      confidence: null,
      lastReviewed: null,
      illustrative: false,
    },
    isDemo: false,
  };
}

export function normalizeGdelt(raw: GdeltArticle[]): NormalizedArticle[] {
  const out: NormalizedArticle[] = [];
  for (const a of raw) {
    const url = canonicalizeUrl(a.url);
    const headline = sanitizeText(stripOutletSuffix(a.title, a.domain), 400);
    const publishedAtMs = parseSeenDate(a.seendate);
    if (!url || !headline || publishedAtMs === null) continue;
    const domain = sanitizeText(a.domain, 160).toLowerCase() || new URL(url).hostname;
    const country = a.sourcecountry ? sanitizeText(a.sourcecountry, 80) || null : null;
    const image =
      a.socialimage && SafeUrlSchema.safeParse(a.socialimage).success ? a.socialimage : null;
    out.push({
      id: `art-${fnv1a64(url)}`,
      origin: 'gdelt',
      url,
      headline,
      publishedAtMs,
      domain,
      language: a.language ? sanitizeText(a.language, 40) || null : null,
      sourceCountry: country,
      imageUrl: image,
      source: sourceForDomain(domain) ?? unknownSource(domain, country),
      duplicates: 0,
      ...(a.places?.length ? { placeHints: a.places } : {}),
    });
  }
  return out;
}

/** RSS items carry no coordinates; the pipeline locates them from the headline later. */
export function normalizeRss(items: RssItem[], nowMs: number): NormalizedArticle[] {
  const out: NormalizedArticle[] = [];
  for (const item of items) {
    const url = canonicalizeUrl(item.link);
    const headline = sanitizeText(item.title, 400);
    if (!url || !headline) continue;
    const publishedAtMs = item.published ? Date.parse(item.published) : Number.NaN;
    // Never substitute the fetch time: an item without a usable date is dropped.
    if (!Number.isFinite(publishedAtMs)) continue;
    if (publishedAtMs > nowMs + 86_400_000) continue;
    const snippet = item.summary
      ? sanitizeText(item.summary.replace(/<[^>]*>/g, ' '), 300) || undefined
      : undefined;
    const domain = item.feed.domain.toLowerCase();
    out.push({
      id: `art-${fnv1a64(url)}`,
      origin: 'rss',
      url,
      headline,
      publishedAtMs,
      domain,
      language: item.feed.language || null,
      sourceCountry: item.feed.country || null,
      imageUrl: null,
      source: sourceForDomain(domain) ?? unknownSource(domain, item.feed.country),
      duplicates: 0,
      ...(snippet ? { snippet } : {}),
    });
  }
  return out;
}

/**
 * Remove exact duplicates (same canonical URL) and syndicated near-duplicates
 * (same headline text from different URLs). Keeps the earliest copy.
 */
export function dedupeArticles(
  articles: NormalizedArticle[],
  nearDupThreshold = 0.9,
): NormalizedArticle[] {
  const byUrl = new Map<string, NormalizedArticle>();
  for (const a of [...articles].sort((x, y) => x.publishedAtMs - y.publishedAtMs)) {
    const existing = byUrl.get(a.url);
    if (existing) existing.duplicates++;
    else byUrl.set(a.url, { ...a });
  }
  const kept: NormalizedArticle[] = [];
  for (const a of byUrl.values()) {
    const dup = kept.find(
      (k) =>
        k.source.id === a.source.id &&
        headlineSimilarity(k.headline, a.headline) >= nearDupThreshold,
    );
    if (dup) dup.duplicates++;
    else kept.push(a);
  }
  return kept;
}
