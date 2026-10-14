/**
 * Ingestion orchestration:
 *   retrieve → normalise → deduplicate → extract entities → resolve location →
 *   calculate confidence → cluster → create/update events → attach sources.
 * Summaries are optional and added later by the (cheap) AI tier when configured.
 */
import type { NewsProvider } from '../providers/gdelt';
import type { ProviderHealth } from '../providers/health';
import { buildEventFromCluster, type BuiltEvent } from './build-events';
import { clusterArticles } from './cluster';
import { dedupeArticles, normalizeGdelt, type NormalizedArticle } from './normalize';

export interface IngestionRun {
  startedAt: string;
  finishedAt: string;
  provider: string;
  queries: number;
  fetched: number;
  normalized: number;
  deduplicated: number;
  clusters: number;
  located: number;
  errors: string[];
}

export async function runIngestion(opts: {
  provider: NewsProvider;
  queries: string[];
  health: ProviderHealth;
  nowMs: number;
  timespan?: string;
  maxRecords?: number;
  /** GDELT asks clients to space requests; keep a gap between queries. */
  delayMs?: number;
}): Promise<{ run: IngestionRun; events: BuiltEvent[] }> {
  const started = new Date(opts.nowMs).toISOString();
  const errors: string[] = [];
  const all: NormalizedArticle[] = [];
  let fetched = 0;
  for (const [i, q] of opts.queries.entries()) {
    if (i > 0 && opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    try {
      const raw = await opts.provider.fetchRecent(q, {
        timespan: opts.timespan ?? '24h',
        maxRecords: opts.maxRecords ?? 75,
      });
      fetched += raw.length;
      all.push(...normalizeGdelt(raw));
      opts.health.ok('gdelt');
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      opts.health.fail('gdelt', err);
    }
  }
  const deduped = dedupeArticles(all);
  const clusters = clusterArticles(deduped);
  const events = clusters
    .map((c) => buildEventFromCluster(c, opts.nowMs))
    .filter((e): e is BuiltEvent => e !== null);
  return {
    run: {
      startedAt: started,
      finishedAt: new Date().toISOString(),
      provider: opts.provider.name,
      queries: opts.queries.length,
      fetched,
      normalized: all.length,
      deduplicated: deduped.length,
      clusters: clusters.length,
      located: events.length,
      errors,
    },
    events,
  };
}
