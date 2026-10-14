/** Dependency container — one per isolate (Worker) or process (Node dev server/tests). */
import { loadConfig, type Config, type Env } from './env';
import { MemoryRepository } from './data/memory-repository';
import type { EventRepository } from './data/repository';
import { AnthropicProvider } from './ai/anthropic';
import { AiBudget } from './ai/budget';
import { NullAiProvider, type AiProvider } from './ai/provider';
import type { FetchLike } from './lib/http';
import { SingleFlight } from './lib/cache';
import { HistoricalBordersProvider } from './providers/borders';
import { GdeltProvider, type NewsProvider } from './providers/gdelt';
import { ProviderHealth } from './providers/health';
import { WikipediaProvider } from './providers/wikipedia';
import { PayPalClient } from './payments/paypal-client';
import { PaymentService } from './payments/service';
import { MemoryPaymentStore, type PaymentStore } from './payments/store';
import { SupabasePaymentStore, SupabaseNewsRepository } from './data/supabase';

export interface AppDeps {
  config: Config;
  repo: EventRepository;
  health: ProviderHealth;
  wikipedia: WikipediaProvider;
  borders: HistoricalBordersProvider;
  news: NewsProvider | null;
  ai: AiProvider;
  budget: AiBudget;
  payments: PaymentService;
  paymentStore: PaymentStore;
  ingestFlight: SingleFlight<void>;
  now: () => number;
}

export interface DepOverrides {
  fetchImpl?: FetchLike;
  now?: () => number;
  ai?: AiProvider;
  repo?: EventRepository;
  paymentStore?: PaymentStore;
  newId?: () => string;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

export function createDeps(env: Env, o: DepOverrides = {}): AppDeps {
  const config = loadConfig(env);
  const now = o.now ?? Date.now;
  const fetchImpl = o.fetchImpl ?? ((input: string | Request, init?: RequestInit) => fetch(input, init));
  const health = new ProviderHealth(now);
  const supabaseReady = !!(config.supabase.url && config.supabase.serviceKey);
  health.register('gdelt', config.gdelt.enabled);
  health.register('wikipedia', true);
  health.register('wikimedia-commons', true);
  health.register('historical-basemaps', true);
  health.register('anthropic', !!config.ai.apiKey);
  health.register('paypal', !!(config.paypal.clientId && config.paypal.clientSecret));
  health.register('supabase', supabaseReady);

  const memory = new MemoryRepository();
  const repo =
    o.repo ??
    (supabaseReady
      ? new SupabaseNewsRepository(memory, config.supabase.url!, config.supabase.serviceKey!, health, fetchImpl)
      : memory);
  const paymentStore =
    o.paymentStore ??
    (supabaseReady
      ? new SupabasePaymentStore(config.supabase.url!, config.supabase.serviceKey!, fetchImpl)
      : new MemoryPaymentStore());
  const ai =
    o.ai ??
    (config.ai.apiKey
      ? new AnthropicProvider(config.ai.apiKey, { fast: config.ai.fastModel, strong: config.ai.strongModel })
      : new NullAiProvider());
  const budget = new AiBudget(config.ai.dailyBudgetUsd, now);
  const client =
    config.paypal.clientId && config.paypal.clientSecret
      ? new PayPalClient(config.paypal.clientId, config.paypal.clientSecret, config.paypal.environment, fetchImpl, now)
      : null;
  const payments = new PaymentService({ client, store: paymentStore, repo, config, now, newId: o.newId ?? randomId });

  return {
    config,
    repo,
    health,
    wikipedia: new WikipediaProvider(config.wikipediaUserAgent, health, fetchImpl),
    borders: new HistoricalBordersProvider(config.basemapsBaseUrl, health, fetchImpl, env.GEO_CACHE),
    news: config.gdelt.enabled ? new GdeltProvider(fetchImpl) : null,
    ai,
    budget,
    payments,
    paymentStore,
    ingestFlight: new SingleFlight<void>(),
    now,
  };
}
