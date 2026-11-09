/**
 * TEST-ONLY: syndicated copies of one headline, run through the real ingestion pipeline
 * (normalised articles → clusters → events), for the story-continuity tests.
 */
import type { PlaceHint } from '../providers/gdelt';
import { ProviderHealth } from '../providers/health';
import type { BuiltEvent } from '../pipeline/build-events';
import { runCombinedIngestion } from '../pipeline/ingest';
import { unknownSource, type NormalizedArticle } from '../pipeline/normalize';

export const MIN = 60_000;
export const NOW = Date.UTC(2026, 10, 9, 16, 45);
export const CONGRESS = "Congress returns to a changed Washington after GOP's election wipeout";
export const DC: PlaceHint = {
  name: 'Washington, District of Columbia, United States',
  lat: 38.895,
  lon: -77.036,
  precision: 'city',
};

/**
 * One outlet's copy of a headline, `minutesAgo` before NOW, with the place GDELT found for it.
 * Its id is art-<domain>-<minutesAgo>.
 */
export function copy(
  domain: string,
  minutesAgo: number,
  headline = CONGRESS,
  place = DC,
): NormalizedArticle {
  return {
    id: `art-${domain}-${minutesAgo}`,
    origin: 'gdelt',
    url: `https://www.${domain}/news/${minutesAgo}`,
    headline,
    publishedAtMs: NOW - minutesAgo * MIN,
    domain,
    language: 'English',
    sourceCountry: null,
    imageUrl: null,
    source: unknownSource(domain, null),
    duplicates: 0,
    placeHints: [place],
  };
}

/** The publisher of a copy() article, from its id. */
export const publisherOf = (articleId: string): string =>
  unknownSource(articleId.split('-')[1]!, null).id;

/** One ingestion run over the articles its window holds. */
export async function ingestWindow(articles: NormalizedArticle[]): Promise<BuiltEvent[]> {
  const { events } = await runCombinedIngestion({
    sources: [
      {
        name: 'gdelt',
        fetch: async () => articles,
        normalize: (raw) => raw as NormalizedArticle[],
      },
    ],
    health: new ProviderHealth(),
    nowMs: NOW,
  });
  return events;
}
