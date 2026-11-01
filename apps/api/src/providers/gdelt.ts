/**
 * GDELT DOC 2.0 API — discovery input only, never treated as ground truth.
 * Endpoint: https://api.gdeltproject.org/api/v2/doc/doc  (no key required)
 * We request mode=ArtList&format=json; each record gives url, title, seendate,
 * socialimage, domain, language and sourcecountry (headline-level metadata only).
 *
 * The response is validated; anything unexpected yields an empty list and a degraded
 * provider status rather than an exception that could take the app down.
 */
import { z } from 'zod';
import { fetchWithTimeout, UpstreamError, type FetchLike } from '../lib/http';

export const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

const GdeltArticleSchema = z.object({
  url: z.string(),
  url_mobile: z.string().optional().nullable(),
  title: z.string(),
  seendate: z.string(),
  socialimage: z.string().optional().nullable(),
  domain: z.string(),
  language: z.string().optional().nullable(),
  sourcecountry: z.string().optional().nullable(),
});
/** A place the article names, with coordinates, as GDELT's knowledge graph geocoded it. */
export interface PlaceHint {
  name: string;
  lat: number;
  lon: number;
  precision: 'country' | 'region' | 'city';
}

export type GdeltArticle = z.infer<typeof GdeltArticleSchema> & {
  /** GKG files only: places in the article that the headline also names. */
  places?: PlaceHint[];
};

const GdeltResponseSchema = z.object({ articles: z.array(z.unknown()).optional() });

export interface NewsProvider {
  readonly name: string;
  fetchRecent(
    query: string,
    opts: { timespan: string; maxRecords: number },
  ): Promise<GdeltArticle[]>;
}

export class GdeltProvider implements NewsProvider {
  readonly name = 'gdelt';
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  buildUrl(query: string, opts: { timespan: string; maxRecords: number }): string {
    const u = new URL(GDELT_ENDPOINT);
    u.searchParams.set('query', query);
    u.searchParams.set('mode', 'ArtList');
    u.searchParams.set('format', 'json');
    u.searchParams.set('sort', 'DateDesc');
    u.searchParams.set('timespan', opts.timespan);
    u.searchParams.set('maxrecords', String(Math.min(250, Math.max(1, opts.maxRecords))));
    return u.toString();
  }

  async fetchRecent(
    query: string,
    opts: { timespan: string; maxRecords: number },
  ): Promise<GdeltArticle[]> {
    const res = await fetchWithTimeout(this.buildUrl(query, opts), {
      provider: 'gdelt',
      timeoutMs: 9000,
      retries: 1,
      fetchImpl: this.fetchImpl,
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok)
      throw new UpstreamError(`gdelt: HTTP ${res.status}`, 'gdelt', res.status, text.slice(0, 200));
    // GDELT returns plain-text notices (e.g. rate-limit messages) with HTTP 200.
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new UpstreamError(
        `gdelt: non-JSON response: ${text.slice(0, 120)}`,
        'gdelt',
        res.status,
      );
    }
    const parsed = GdeltResponseSchema.safeParse(json);
    if (!parsed.success)
      throw new UpstreamError('gdelt: unexpected response shape', 'gdelt', res.status);
    const out: GdeltArticle[] = [];
    for (const raw of parsed.data.articles ?? []) {
      const a = GdeltArticleSchema.safeParse(raw);
      if (a.success) out.push(a.data);
    }
    return out;
  }
}

/** GDELT seendate "20261014T103000Z" → epoch ms (null if malformed). */
export function parseSeenDate(s: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number) as number[];
  const t = Date.UTC(y!, mo! - 1, d!, h!, mi!, se!);
  return Number.isFinite(t) ? t : null;
}
