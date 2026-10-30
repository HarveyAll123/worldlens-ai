/**
 * Ingestion orchestration:
 *   retrieve → normalise → deduplicate → extract entities → resolve location →
 *   calculate confidence → cluster → create/update events → attach sources.
 * Several providers feed one run: their normalised articles are merged before dedupe and
 * clustering, so a story covered by two providers becomes one event with both sources.
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

export interface IngestionSource {
  /** Provider name used for health and per-source stats. */
  name: string;
  fetch: () => Promise<unknown[]>;
  normalize: (raw: unknown[], nowMs: number) => NormalizedArticle[];
}

export interface SourceStats {
  name: string;
  fetched: number;
  kept: number;
  failed: boolean;
  usedFallback: boolean;
  error: string | null;
}

export interface CombinedRun extends IngestionRun {
  sources: SourceStats[];
}

/** Last successful normalised batch per provider, kept in memory only. */
export type FallbackStore = Map<string, { articles: NormalizedArticle[]; fetchedAtMs: number }>;

export const FALLBACK_WINDOW_MS = 12 * 60 * 60_000;

/**
 * One run over several providers. Fetches in parallel; a failing or empty provider falls back
 * to its last good batch (filtered to the fallback window) and never blocks the others.
 */
export async function runCombinedIngestion(opts: {
  sources: IngestionSource[];
  health: ProviderHealth;
  nowMs: number;
  fallback?: FallbackStore;
  fallbackWindowMs?: number;
}): Promise<{ run: CombinedRun; events: BuiltEvent[] }> {
  const started = new Date(opts.nowMs).toISOString();
  const windowMs = opts.fallbackWindowMs ?? FALLBACK_WINDOW_MS;
  const results = await Promise.allSettled(opts.sources.map((s) => s.fetch()));
  const stats: SourceStats[] = [];
  const merged: NormalizedArticle[] = [];
  const errors: string[] = [];
  let fetched = 0;

  for (const [i, source] of opts.sources.entries()) {
    const result = results[i]!;
    let articles: NormalizedArticle[] = [];
    let failed = false;
    let error: string | null = null;

    if (result.status === 'fulfilled') {
      fetched += result.value.length;
      articles = source.normalize(result.value, opts.nowMs);
      // Reachable is a success even when the feed had nothing new to give.
      opts.health.ok(source.name as never);
      if (articles.length > 0) {
        opts.fallback?.set(source.name, { articles, fetchedAtMs: opts.nowMs });
      }
    } else {
      failed = true;
      error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      opts.health.fail(source.name as never, result.reason);
    }

    let usedFallback = false;
    if (articles.length === 0) {
      const last = opts.fallback?.get(source.name);
      if (last && opts.nowMs - last.fetchedAtMs <= windowMs) {
        const floor = opts.nowMs - windowMs;
        articles = last.articles.filter((a) => a.publishedAtMs >= floor);
        usedFallback = articles.length > 0;
      }
    }

    if (error) errors.push(`${source.name}: ${error}`);
    merged.push(...articles);
    stats.push({
      name: source.name,
      fetched: result.status === 'fulfilled' ? result.value.length : 0,
      kept: articles.length,
      failed,
      usedFallback,
      error,
    });
  }

  const deduped = dedupeArticles(merged);
  const clusters = clusterArticles(deduped);
  const events = clusters
    .map((c) => buildEventFromCluster(c, opts.nowMs))
    .filter((e): e is BuiltEvent => e !== null);

  return {
    run: {
      startedAt: started,
      finishedAt: new Date().toISOString(),
      provider: opts.sources.map((s) => s.name).join('+'),
      queries: 0,
      fetched,
      normalized: merged.length,
      deduplicated: deduped.length,
      clusters: clusters.length,
      located: events.length,
      errors,
      sources: stats,
    },
    events,
  };
}

/**
 * Single-provider run kept for callers and tests that predate the combined ingestion. GDELT
 * behaviour is unchanged: queries are spaced, a query failure is recorded, and the health entry
 * is reported under the provider's own name.
 */
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
  const { run, events } = await runCombinedIngestion({
    sources: [
      {
        name: opts.provider.name,
        fetch: async () => {
          const all: unknown[] = [];
          const failures: Error[] = [];
          for (const [i, q] of opts.queries.entries()) {
            if (i > 0 && opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
            try {
              const raw = await opts.provider.fetchRecent(q, {
                timespan: opts.timespan ?? '24h',
                maxRecords: opts.maxRecords ?? 75,
              });
              all.push(...raw);
            } catch (err) {
              failures.push(err instanceof Error ? err : new Error(String(err)));
            }
          }
          if (all.length === 0 && failures.length > 0) throw failures[0];
          return all;
        },
        normalize: (raw) => normalizeGdelt(raw as Parameters<typeof normalizeGdelt>[0]),
      },
    ],
    health: opts.health,
    nowMs: opts.nowMs,
  });
  return { run: { ...run, queries: opts.queries.length }, events };
}
