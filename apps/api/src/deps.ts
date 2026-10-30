/** Dependency container — one per isolate (Worker) or process (Node dev server/tests). */
import { loadConfig, type Config, type Env } from './env';
import { MemoryRepository } from './data/memory-repository';
import type { EventRepository } from './data/repository';
import { AnthropicProvider } from './ai/anthropic';
import { OpenAiCompatibleProvider } from './ai/openai';
import { AiBudget } from './ai/budget';
import { NullAiProvider, type AiProvider } from './ai/provider';
import type { CombinedRun, FallbackStore } from './pipeline/ingest';
import type { FetchLike } from './lib/http';
import { SingleFlight } from './lib/cache';
import { HistoricalBordersProvider } from './providers/borders';
import { GdeltProvider, type NewsProvider } from './providers/gdelt';
import { RssProvider } from './providers/rss';
import { ProviderHealth } from './providers/health';
import { WikipediaProvider } from './providers/wikipedia';
import { PayPalClient } from './payments/paypal-client';
import { PaymentService } from './payments/service';
import { MemoryPaymentStore, type PaymentStore } from './payments/store';
import { PostgresNewsRepository, PostgresPaymentStore } from './data/postgres';
import { classifyDatabaseUrl, neonHttpClient, type SqlClient } from './data/sql';

export interface AppDeps {
  config: Config;
  repo: EventRepository;
  health: ProviderHealth;
  wikipedia: WikipediaProvider;
  borders: HistoricalBordersProvider;
  news: NewsProvider | null;
  rss: RssProvider | null;
  /** Last good normalised batch per provider (isolate memory; best-effort on the Worker). */
  ingestFallback: FallbackStore;
  ai: AiProvider;
  budget: AiBudget;
  payments: PaymentService;
  paymentStore: PaymentStore;
  ingestFlight: SingleFlight<CombinedRun | null>;
  now: () => number;
}

export interface DepOverrides {
  fetchImpl?: FetchLike;
  now?: () => number;
  ai?: AiProvider;
  repo?: EventRepository;
  paymentStore?: PaymentStore;
  /** SQL client to use instead of the Neon HTTP driver (local Postgres in dev/tests). */
  sql?: SqlClient;
  newId?: () => string;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 20);
}

export function createDeps(env: Env, o: DepOverrides = {}): AppDeps {
  const config = loadConfig(env);
  const now = o.now ?? Date.now;
  const fetchImpl =
    o.fetchImpl ?? ((input: string | Request, init?: RequestInit) => fetch(input, init));
  const health = new ProviderHealth(now);
  // The Worker speaks to Neon over HTTPS only. Anything else fails closed with a fixed message
  // (never the URL itself, which holds the password); the Node dev server passes `o.sql` for
  // other PostgreSQL servers.
  const target = !o.sql && config.database.url ? classifyDatabaseUrl(config.database.url) : null;
  const sql = o.sql ?? (target?.kind === 'neon' ? neonHttpClient(target.url) : null);
  const databaseProblem =
    target && target.kind !== 'neon'
      ? target.kind === 'invalid'
        ? target.reason
        : 'DATABASE_URL must be a Neon connection string (host *.neon.tech) in the Worker; other PostgreSQL servers work only with the Node dev server (pnpm dev:node).'
      : null;
  health.register('gdelt', config.gdelt.enabled);
  health.register('rss', config.rss.enabled);
  health.register('wikipedia', true);
  health.register('wikimedia-commons', true);
  health.register('historical-basemaps', true);
  const aiProviderName = config.ai.provider === 'openai' ? 'opencode' : 'anthropic';
  health.register(aiProviderName, !!config.ai.apiKey);
  health.register('paypal', !!(config.paypal.clientId && config.paypal.clientSecret));
  health.register('database', !!sql || !!databaseProblem);
  if (databaseProblem) {
    health.fail('database', new Error(databaseProblem));
    console.warn(`[worldlens-api] database disabled: ${databaseProblem}`);
  }

  const memory = new MemoryRepository();
  const repo = o.repo ?? (sql ? new PostgresNewsRepository(memory, sql, health) : memory);
  const paymentStore =
    o.paymentStore ?? (sql ? new PostgresPaymentStore(sql) : new MemoryPaymentStore());
  const ai =
    o.ai ??
    (config.ai.apiKey
      ? config.ai.provider === 'openai'
        ? new OpenAiCompatibleProvider({
            apiKey: config.ai.apiKey,
            baseUrl: config.ai.baseUrl ?? 'https://opencode.ai/inference/go/openai/v1',
            models: { fast: config.ai.fastModel, strong: config.ai.strongModel },
            providerName: 'opencode',
            sessionId: config.ai.sessionId ?? `worldlens-${crypto.randomUUID()}`,
            ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}),
          })
        : new AnthropicProvider(config.ai.apiKey, {
            fast: config.ai.fastModel,
            strong: config.ai.strongModel,
          })
      : new NullAiProvider());
  const budget = new AiBudget(config.ai.dailyBudgetUsd, now);
  const client =
    config.paypal.clientId && config.paypal.clientSecret
      ? new PayPalClient(
          config.paypal.clientId,
          config.paypal.clientSecret,
          config.paypal.environment,
          fetchImpl,
          now,
        )
      : null;
  const payments = new PaymentService({
    client,
    store: paymentStore,
    repo,
    config,
    now,
    newId: o.newId ?? randomId,
  });

  return {
    config,
    repo,
    health,
    wikipedia: new WikipediaProvider(config.wikipediaUserAgent, health, fetchImpl),
    borders: new HistoricalBordersProvider(
      config.basemapsBaseUrl,
      health,
      fetchImpl,
      env.GEO_CACHE,
    ),
    news: config.gdelt.enabled ? new GdeltProvider(fetchImpl) : null,
    rss: config.rss.enabled ? new RssProvider({ fetchImpl }) : null,
    ingestFallback: new Map(),
    ai,
    budget,
    payments,
    paymentStore,
    ingestFlight: new SingleFlight<CombinedRun | null>(),
    now,
  };
}
