/**
 * Wikipedia + Wikimedia Commons provider.
 *  - Summary: GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 *  - Image licence: Commons imageinfo/extmetadata for the lead image.
 * Requests identify the app via User-Agent (Wikimedia API policy). Non-free images hosted on
 * en.wikipedia (fair use) are never shown. Images are hotlinked, not stored.
 */
import { z } from 'zod';
import { SafeUrlSchema, sanitizeText, type MediaAsset } from '@worldlens/shared';
import { TtlCache } from '../lib/cache';
import { fetchJson, type FetchLike } from '../lib/http';
import type { ProviderHealth } from './health';

const SummarySchema = z.object({
  title: z.string(),
  extract: z.string().optional(),
  description: z.string().optional(),
  thumbnail: z.object({ source: z.string() }).optional(),
  originalimage: z.object({ source: z.string() }).optional(),
  content_urls: z.object({ desktop: z.object({ page: z.string() }) }).optional(),
});

const ExtMetaValue = z.object({ value: z.union([z.string(), z.number()]).optional() }).optional();
const CommonsSchema = z.object({
  query: z
    .object({
      pages: z.record(
        z.string(),
        z.object({
          imageinfo: z
            .array(
              z.object({
                descriptionurl: z.string().optional(),
                extmetadata: z
                  .object({
                    LicenseShortName: ExtMetaValue,
                    LicenseUrl: ExtMetaValue,
                    Artist: ExtMetaValue,
                    Credit: ExtMetaValue,
                  })
                  .partial()
                  .optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

export interface WikipediaSummary {
  title: string;
  description: string | null;
  extract: string;
  pageUrl: string;
  image: MediaAsset | null;
  retrievedAt: string;
  source: 'wikipedia';
}

/**
 * Extract "File:Name.jpg" from a Commons media URL; null for non-Commons. The REST summary API
 * now returns thumbnails on thumb.wikimedia.org (with utm_* query parameters) instead of
 * upload.wikimedia.org, so both hosts are accepted.
 */
export function commonsFileFromUrl(url: string): string | null {
  const m =
    /^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(
      url,
    );
  return m ? `File:${decodeURIComponent(m[1]!)}` : null;
}

export class WikipediaProvider {
  private cache = new TtlCache<WikipediaSummary>(400);
  constructor(
    private readonly userAgent: string,
    private readonly health: ProviderHealth,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private headers() {
    return { 'User-Agent': this.userAgent, 'Api-User-Agent': this.userAgent };
  }

  async summary(title: string): Promise<WikipediaSummary> {
    const key = title.replace(/ /g, '_');
    const hit = this.cache.get(key);
    if (hit) return hit;
    try {
      const raw = await fetchJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`,
        {
          provider: 'wikipedia',
          timeoutMs: 6000,
          retries: 1,
          headers: this.headers(),
          fetchImpl: this.fetchImpl,
        },
      );
      const s = SummarySchema.parse(raw);
      this.health.ok('wikipedia');
      const pageUrl =
        s.content_urls?.desktop.page && SafeUrlSchema.safeParse(s.content_urls.desktop.page).success
          ? s.content_urls.desktop.page
          : `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`;
      const imgUrl = s.thumbnail?.source ?? null;
      const image = imgUrl ? await this.imageWithLicense(imgUrl) : null;
      const out: WikipediaSummary = {
        title: sanitizeText(s.title, 300),
        description: s.description ? sanitizeText(s.description, 300) : null,
        extract: sanitizeText(s.extract ?? '', 1200),
        pageUrl,
        image,
        retrievedAt: new Date().toISOString(),
        source: 'wikipedia',
      };
      this.cache.set(key, out, 24 * 3_600_000);
      return out;
    } catch (err) {
      this.health.fail('wikipedia', err);
      const stale = this.cache.getStale(key);
      if (stale) return stale;
      throw err;
    }
  }

  /** Look up licence metadata on Commons. Returns null (no image) when unknown or non-free. */
  async imageWithLicense(url: string): Promise<MediaAsset | null> {
    if (!SafeUrlSchema.safeParse(url).success) return null;
    const file = commonsFileFromUrl(url);
    if (!file) return null; // not on Commons (e.g. non-free fair-use on en.wikipedia) → do not show
    try {
      const api = new URL('https://commons.wikimedia.org/w/api.php');
      api.searchParams.set('action', 'query');
      api.searchParams.set('format', 'json');
      api.searchParams.set('prop', 'imageinfo');
      api.searchParams.set('iiprop', 'extmetadata|url');
      api.searchParams.set('titles', file);
      const raw = await fetchJson(api.toString(), {
        provider: 'wikimedia-commons',
        timeoutMs: 5000,
        headers: this.headers(),
        fetchImpl: this.fetchImpl,
      });
      const parsed = CommonsSchema.parse(raw);
      const info = Object.values(parsed.query?.pages ?? {})[0]?.imageinfo?.[0];
      const meta = info?.extmetadata;
      const license = meta?.LicenseShortName?.value
        ? sanitizeText(String(meta.LicenseShortName.value), 120)
        : null;
      if (!license) return null;
      this.health.ok('wikimedia-commons');
      const artist = meta?.Artist?.value ? sanitizeText(String(meta.Artist.value), 200) : '';
      const licenseUrl = meta?.LicenseUrl?.value ? String(meta.LicenseUrl.value) : undefined;
      return {
        url,
        sourcePageUrl:
          info?.descriptionurl && SafeUrlSchema.safeParse(info.descriptionurl).success
            ? info.descriptionurl
            : `https://commons.wikimedia.org/wiki/${encodeURIComponent(file)}`,
        credit: artist || 'Wikimedia Commons contributor',
        license,
        ...(licenseUrl && SafeUrlSchema.safeParse(licenseUrl).success ? { licenseUrl } : {}),
        source: 'Wikimedia Commons',
        cachingPermitted: false,
      };
    } catch (err) {
      this.health.fail('wikimedia-commons', err);
      return null;
    }
  }
}
