/** Step 7: turn clusters into WorldLens events with attached source coverage. */
import {
  toIso,
  type Article,
  type NewsSource,
  type Participant,
  type WorldEvent,
} from '@worldlens/shared';
import { countryByIso3 } from '@worldlens/shared/geo-data';
import { fnv1a64 } from '../lib/cache';
import { clusterConfidence, representative, type Cluster } from './cluster';

export interface BuiltEvent {
  event: WorldEvent;
  articles: Article[];
  sources: NewsSource[];
}

export function buildEventFromCluster(c: Cluster, nowMs: number): BuiltEvent | null {
  if (!c.location) return null; // unlocated stories are not placed on the globe
  const rep = representative(c);
  const earliest = c.members.reduce((a, b) =>
    a.article.publishedAtMs <= b.article.publishedAtMs ? a : b,
  );
  const id = `news-${fnv1a64(earliest.article.url).slice(0, 14)}`;
  const sources = new Map<string, NewsSource>();
  const articles: Article[] = c.members.map((m) => {
    sources.set(m.article.source.id, m.article.source);
    return {
      id: m.article.id,
      sourceId: m.article.source.id,
      headline: m.article.headline,
      url: m.article.url,
      publishedAt: toIso(m.article.publishedAtMs),
      language: m.article.language,
      sourceCountry: m.article.sourceCountry,
      origin: m.article.origin,
      ...(m.article.snippet ? { snippet: m.article.snippet } : {}),
      ...(m.article.imageUrl ? { imageUrl: m.article.imageUrl } : {}),
      isDemo: false,
    };
  });
  const participants: Participant[] = [];
  const seen = new Set<string>();
  for (const m of c.members) {
    for (const iso of m.entities.countries) {
      const name = countryByIso3(iso)?.name;
      if (name && !seen.has(name)) {
        seen.add(name);
        participants.push({ name, type: 'country', role: 'mentioned' });
      }
    }
    for (const org of m.entities.organizations) {
      if (!seen.has(org)) {
        seen.add(org);
        participants.push({ name: org, type: 'organization', role: 'mentioned' });
      }
    }
  }
  const confidence = Math.min(clusterConfidence(c), c.location.confidence + 0.2);
  const repSource = rep.article.source;
  const event: WorldEvent = {
    id,
    kind: 'news',
    isDemo: false,
    title: rep.article.headline,
    category: c.category,
    tags: [],
    time: {
      start: toIso(c.firstMs),
      ...(c.lastMs - c.firstMs > 3_600_000 ? { end: toIso(c.lastMs) } : {}),
      precision: 'hour',
      approximate: false,
    },
    location: c.location,
    extraLocations: [],
    participants: participants.slice(0, 12),
    ...(rep.article.imageUrl
      ? {
          image: {
            url: rep.article.imageUrl,
            sourcePageUrl: rep.article.url,
            credit: repSource.name,
            license: 'Publisher image — linked, not stored',
            source: repSource.domain,
            cachingPermitted: false,
          },
        }
      : {}),
    references: [],
    importance: Math.min(5, 1 + Math.floor(Math.log2(1 + sources.size))) as 1 | 2 | 3 | 4 | 5,
    confidence: Math.round(confidence * 100) / 100,
    articleCount: articles.length,
    sourceCount: sources.size,
    hasTakeAction: false,
    provenance: {
      provider: 'gdelt',
      note: 'Discovered via the GDELT DOC 2.0 API; headline-level metadata only. Clustered automatically.',
      retrievedAt: toIso(nowMs),
    },
    updatedAt: toIso(c.lastMs),
  };
  return { event, articles, sources: [...sources.values()] };
}
