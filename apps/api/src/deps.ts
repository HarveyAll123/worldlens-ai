/** Dependency container — one per isolate (Worker) or process (Node dev server/tests). */
import { GEMINI_FALLBACKS, GEMINI_OPENAI_BASE_URL, loadConfig, type Config, type Env } from './env';
import type { ProviderName } from './providers/health';
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
import { GdeltFilesProvider } from './providers/gdelt-files';
import { RssProvider } from './providers/rss';
import { ProviderHealth } from './providers/health';
import { WikipediaProvider } from './providers/wikipedia';
import { PayPalClient } from './payments/paypal-client';
import { PaymentService } from './payments/service';
import { MemoryPaymentStore, type PaymentStore } from './payments/store';
import { PostgresNewsRepository, PostgresPaymentStore } from './data/postgres';
import { classifyDatabaseUrl, neonHttpClient, type SqlClient } from './data/sql';
import { WithPastNews } from './data/past-news';
import { WikipediaNewsProvider } from './providers/wikipedia-news';
import { PublisherDirectory } from './providers/publisher-directory';
import { PlaceNameIndex } from './providers/place-names';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { createAuth, type Auth, type AuthSetup } from './auth/auth';
import { MemoryAccountStore, PostgresAccountStore, type AccountStore } from './data/account-store';
import { brevoMailer, logMailer, type Mailer, type TestMailbox } from './lib/mailer';

/** The name each AI provider reports under in /api/health. */
export const AI_HEALTH_NAME: Record<Config['ai']['provider'], ProviderName> = {
  gemini: 'gemini',
  openai: 'opencode',
  anthropic: 'anthropic',
};

export interface AppDeps {
  config: Config;
  repo: EventRepository;
  health: ProviderHealth;
  wikipedia: WikipediaProvider;
  borders: HistoricalBordersProvider;
  /** GDELT DOC API (GDELT_SOURCE=api). */
  news: NewsProvider | null;
  /** GDELT 15-minute GKG files (GDELT_SOURCE=files, the default). */
  gdeltFiles: GdeltFilesProvider | null;
  rss: RssProvider | null;
  /** Last good normalised batch per provider (isolate memory; best-effort on the Worker). */
  ingestFallback: FallbackStore;
  ai: AiProvider;
  budget: AiBudget;
  payments: PaymentService;
  paymentStore: PaymentStore;
  ingestFlight: SingleFlight<CombinedRun | null>;
  /** Accounts (Better Auth). `release` ends the request's database pool on the Worker. */
  auth: { get(): { auth: Auth; release(): Promise<void> } };
  /** An account's AI chats and viewing history. */
  accounts: AccountStore;
  mailer: Mailer;
  /** Where outlets outside the publisher registry are based (GDELT's list, 2018). */
  publishers: PublisherDirectory;
  /** The globe's place names, for the assistant's highlight_place. */
  places: PlaceNameIndex;
  /** TEST-ONLY (Playwright on the Node server): account emails, readable at /api/test/mail. */
  testMailbox?: TestMailbox;
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
  /** pg Pool for accounts on the Node server (one for the process). */
  authPool?: unknown;
  accounts?: AccountStore;
  mailer?: Mailer;
  testMailbox?: TestMailbox;
}

/** Signs sessions when BETTER_AUTH_SECRET is not set: development only, never production. */
const DEV_AUTH_SECRET = 'worldlens-development-secret-not-for-production-use';

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
  const aiProviderName = AI_HEALTH_NAME[config.ai.provider];
  health.register(aiProviderName, !!config.ai.apiKey);
  health.register('paypal', !!(config.paypal.clientId && config.paypal.clientSecret));
  health.register('database', !!sql || !!databaseProblem);
  if (databaseProblem) {
    health.fail('database', new Error(databaseProblem));
    console.warn(`[worldlens-api] database disabled: ${databaseProblem}`);
  }

  // The website's own data files: read straight from the Worker's assets when it serves the site
  // (a Worker fetching its own address would call itself), else over the network.
  const site = config.publicAppUrl.replace(/\/$/, '');
  const assets = env.ASSETS;
  const siteFetch: FetchLike = assets
    ? (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        return url.startsWith(`${site}/`)
          ? assets.fetch(new Request(url, init))
          : fetchImpl(input, init);
      }
    : fetchImpl;

  const memory = new MemoryRepository();
  const stored = o.repo ?? (sql ? new PostgresNewsRepository(memory, sql, health) : memory);
  // News of the past (2000 → live) from Wikipedia joins the timeline.
  const repo = config.pastNews.enabled
    ? new WithPastNews(
        stored,
        new WikipediaNewsProvider(config.wikipediaUserAgent, fetchImpl, now),
        health,
      )
    : stored;
  const paymentStore =
    o.paymentStore ?? (sql ? new PostgresPaymentStore(sql) : new MemoryPaymentStore());

  const mailer: Mailer =
    o.testMailbox ??
    o.mailer ??
    (config.auth.mail.provider === 'brevo'
      ? brevoMailer(
          config.auth.mail.brevoApiKey!,
          { email: config.auth.mail.from!, name: config.auth.mail.fromName },
          fetchImpl,
        )
      : logMailer);
  if (!config.auth.secret)
    console.warn(
      '[worldlens-api] BETTER_AUTH_SECRET is not set: account sessions use a development secret. Set it before deploying.',
    );
  const accounts = o.accounts ?? (sql ? new PostgresAccountStore(sql) : new MemoryAccountStore());
  const authSetup = (pool: unknown): AuthSetup => ({
    secret: config.auth.secret ?? DEV_AUTH_SECRET,
    baseURL: config.publicAppUrl,
    trustedOrigins: [...new Set([config.publicAppUrl, ...config.allowedOrigins])],
    google: config.auth.google,
    mailer,
    pool,
    secureCookies: config.publicAppUrl.startsWith('https://'),
    onUserDeleted: (userId) => accounts.removeAccountData(userId),
  });
  const single = (instance: Auth) => ({
    get: () => ({ auth: instance, release: async () => undefined }),
  });
  // Node passes one pg Pool; the Worker opens a Neon pool per request (sockets cannot outlive
  // it); without a database, accounts live in memory until the process stops.
  const auth: AppDeps['auth'] =
    o.authPool !== undefined
      ? single(createAuth(authSetup(o.authPool)))
      : target?.kind === 'neon' && !o.sql
        ? {
            get: () => {
              const pool = new NeonPool({ connectionString: target.url });
              return {
                auth: createAuth({ ...authSetup(pool), perRequest: true }),
                release: () => pool.end(),
              };
            },
          }
        : single(createAuth(authSetup(null)));
  const ai =
    o.ai ??
    (config.ai.apiKey
      ? config.ai.provider === 'gemini'
        ? new OpenAiCompatibleProvider({
            apiKey: config.ai.apiKey,
            baseUrl: config.ai.baseUrl ?? GEMINI_OPENAI_BASE_URL,
            models: { fast: config.ai.fastModel, strong: config.ai.strongModel },
            providerName: 'gemini',
            // Free-tier capacity comes and goes ("high demand" 503s, 429s, stalls): the next
            // model answers instead of the assistant failing.
            fallbacks: GEMINI_FALLBACKS,
            // Little thinking: answers in a few seconds; the tools carry the facts.
            reasoningEffort: { fast: 'low', strong: 'low' },
            timeoutMs: 12_000,
            ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}),
          })
        : config.ai.provider === 'openai'
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
    news:
      config.gdelt.enabled && config.gdelt.source === 'api' ? new GdeltProvider(fetchImpl) : null,
    gdeltFiles:
      config.gdelt.enabled && config.gdelt.source === 'files'
        ? new GdeltFilesProvider(fetchImpl)
        : null,
    rss: config.rss.enabled ? new RssProvider({ fetchImpl }) : null,
    ingestFallback: new Map(),
    ai,
    budget,
    payments,
    paymentStore,
    ingestFlight: new SingleFlight<CombinedRun | null>(),
    auth,
    accounts,
    mailer,
    publishers: new PublisherDirectory(config.publisherDirectoryUrl, siteFetch, now),
    places: new PlaceNameIndex(config.placeNamesUrl, siteFetch, now),
    ...(o.testMailbox ? { testMailbox: o.testMailbox } : {}),
    now,
  };
}
