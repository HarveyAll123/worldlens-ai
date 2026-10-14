/** Step 1–2 of ingestion: normalise provider records and remove duplicates. */
import { SafeUrlSchema, headlineSimilarity, sanitizeText, type NewsSource } from '@worldlens/shared';
import { sourceForDomain } from '@worldlens/shared/data';
import { fnv1a64 } from '../lib/cache';
import { parseSeenDate, type GdeltArticle } from '../providers/gdelt';

export interface NormalizedArticle {
  id: string;
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

function unknownSource(domain: string, country: string | null): NewsSource {
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
    const headline = sanitizeText(a.title, 400);
    const publishedAtMs = parseSeenDate(a.seendate);
    if (!url || !headline || publishedAtMs === null) continue;
    const domain = sanitizeText(a.domain, 160).toLowerCase() || new URL(url).hostname;
    const country = a.sourcecountry ? sanitizeText(a.sourcecountry, 80) || null : null;
    const image = a.socialimage && SafeUrlSchema.safeParse(a.socialimage).success ? a.socialimage : null;
    out.push({
      id: `art-${fnv1a64(url)}`,
      url,
      headline,
      publishedAtMs,
      domain,
      language: a.language ? sanitizeText(a.language, 40) || null : null,
      sourceCountry: country,
      imageUrl: image,
      source: sourceForDomain(domain) ?? unknownSource(domain, country),
      duplicates: 0,
    });
  }
  return out;
}

/**
 * Remove exact duplicates (same canonical URL) and syndicated near-duplicates
 * (same headline text from different URLs). Keeps the earliest copy.
 */
export function dedupeArticles(articles: NormalizedArticle[], nearDupThreshold = 0.9): NormalizedArticle[] {
  const byUrl = new Map<string, NormalizedArticle>();
  for (const a of [...articles].sort((x, y) => x.publishedAtMs - y.publishedAtMs)) {
    const existing = byUrl.get(a.url);
    if (existing) existing.duplicates++;
    else byUrl.set(a.url, { ...a });
  }
  const kept: NormalizedArticle[] = [];
  for (const a of byUrl.values()) {
    const dup = kept.find(
      (k) => k.source.id === a.source.id && headlineSimilarity(k.headline, a.headline) >= nearDupThreshold,
    );
    if (dup) dup.duplicates++;
    else kept.push(a);
  }
  return kept;
}
