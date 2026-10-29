/**
 * Worker bindings and parsed configuration. Secrets arrive as bindings (wrangler secrets /
 * .dev.vars / process.env for the Node dev server) and never leave the server.
 */
import { z } from 'zod';

export interface Env {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_ENVIRONMENT?: string;
  PAYPAL_WEBHOOK_ID?: string;
  ANTHROPIC_API_KEY?: string;
  /** OpenAI-compatible gateways (e.g. OpenCode Go). Ignored when AI_PROVIDER=anthropic. */
  OPENCODE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  /** `anthropic` (default) or `openai` for an OpenAI-compatible Chat Completions endpoint. */
  AI_PROVIDER?: string;
  /** Base URL including the version segment, e.g. https://opencode.ai/inference/go/openai/v1 */
  AI_BASE_URL?: string;
  /** Sent as x-opencode-session (OpenCode Go routing). Defaults to a per-process id. */
  AI_SESSION_ID?: string;
  AI_MODEL_STRONG?: string;
  AI_MODEL_FAST?: string;
  AI_DAILY_BUDGET_USD?: string;
  AI_REQUESTS_PER_MINUTE?: string;
  /** Neon connection string (secret). The Node dev server also accepts other PostgreSQL URLs. */
  DATABASE_URL?: string;
  GDELT_ENABLED?: string;
  GDELT_QUERIES?: string;
  HISTORICAL_BASEMAPS_BASE_URL?: string;
  WIKIPEDIA_USER_AGENT?: string;
  ALLOWED_ORIGINS?: string;
  PUBLIC_APP_URL?: string;
  INGEST_TOKEN?: string;
  GEO_CACHE?: R2Bucket;
}

/** Pinned commit of aourednik/historical-basemaps (GPL-3.0) — fetched at runtime, never vendored. */
export const HISTORICAL_BASEMAPS_COMMIT = 'da7a4b735ecef70aebdc9c73e409d8a2500d50f3';

const ConfigSchema = z.object({
  paypal: z.object({
    clientId: z.string().nullable(),
    clientSecret: z.string().nullable(),
    environment: z.enum(['sandbox', 'live']),
    webhookId: z.string().nullable(),
  }),
  ai: z.object({
    provider: z.enum(['anthropic', 'openai']),
    apiKey: z.string().nullable(),
    baseUrl: z.string().nullable(),
    sessionId: z.string().nullable(),
    strongModel: z.string(),
    fastModel: z.string(),
    dailyBudgetUsd: z.number().nonnegative(),
    requestsPerMinute: z.number().int().positive(),
  }),
  database: z.object({ url: z.string().nullable() }),
  gdelt: z.object({ enabled: z.boolean(), queries: z.array(z.string()) }),
  basemapsBaseUrl: z.string(),
  wikipediaUserAgent: z.string(),
  allowedOrigins: z.array(z.string()),
  publicAppUrl: z.string(),
  ingestToken: z.string().nullable(),
});
export type Config = z.infer<typeof ConfigSchema>;

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export const DEFAULT_GDELT_QUERIES = [
  '(earthquake OR flood OR wildfire OR cyclone OR typhoon OR hurricane OR tsunami) sourcelang:english',
  '(military OR missile OR airstrike OR troops OR ceasefire OR "coast guard") sourcelang:english',
  '(summit OR election OR protest OR sanctions OR treaty) sourcelang:english',
];

export function loadConfig(env: Env): Config {
  const environment = (blank(env.PAYPAL_ENVIRONMENT) ?? 'sandbox').toLowerCase();
  // Provider selection: explicit AI_PROVIDER wins; otherwise an OpenAI-compatible key (OpenCode /
  // OpenAI) selects that path, and a bare ANTHROPIC_API_KEY keeps the original Anthropic path.
  const explicitProvider = blank(env.AI_PROVIDER)?.toLowerCase();
  const openAiKey = blank(env.OPENCODE_API_KEY) ?? blank(env.OPENAI_API_KEY);
  const useOpenAi = explicitProvider === 'openai' || (!explicitProvider && !!openAiKey);
  const aiApiKey = useOpenAi
    ? (openAiKey ?? blank(env.ANTHROPIC_API_KEY))
    : blank(env.ANTHROPIC_API_KEY);
  const aiBaseUrl =
    blank(env.AI_BASE_URL) ?? (useOpenAi ? 'https://opencode.ai/inference/go/openai/v1' : null);
  return ConfigSchema.parse({
    paypal: {
      clientId: blank(env.PAYPAL_CLIENT_ID),
      clientSecret: blank(env.PAYPAL_CLIENT_SECRET),
      environment: environment === 'live' ? 'live' : 'sandbox',
      webhookId: blank(env.PAYPAL_WEBHOOK_ID),
    },
    ai: {
      provider: useOpenAi ? 'openai' : 'anthropic',
      apiKey: aiApiKey,
      baseUrl: aiBaseUrl,
      sessionId: blank(env.AI_SESSION_ID),
      strongModel:
        blank(env.AI_MODEL_STRONG) ?? (useOpenAi ? 'deepseek-v4.1-flash' : 'claude-opus-5-5'),
      fastModel:
        blank(env.AI_MODEL_FAST) ?? (useOpenAi ? 'deepseek-v4.1-flash' : 'claude-haiku-5-5'),
      dailyBudgetUsd: Number(blank(env.AI_DAILY_BUDGET_USD) ?? '5'),
      requestsPerMinute: Math.max(1, Math.floor(Number(blank(env.AI_REQUESTS_PER_MINUTE) ?? '8'))),
    },
    database: { url: blank(env.DATABASE_URL) },
    gdelt: {
      enabled: (blank(env.GDELT_ENABLED) ?? 'true') !== 'false',
      queries:
        blank(env.GDELT_QUERIES)
          ?.split('||')
          .map((q) => q.trim())
          .filter(Boolean) ?? DEFAULT_GDELT_QUERIES,
    },
    basemapsBaseUrl:
      blank(env.HISTORICAL_BASEMAPS_BASE_URL) ??
      `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${HISTORICAL_BASEMAPS_COMMIT}/geojson/`,
    wikipediaUserAgent:
      blank(env.WIKIPEDIA_USER_AGENT) ??
      'WorldLens/0.1 (https://github.com/HarveyAll123/worldlens-ai; hackathon project)',
    allowedOrigins: (blank(env.ALLOWED_ORIGINS) ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    publicAppUrl: blank(env.PUBLIC_APP_URL) ?? 'http://localhost:5173',
    ingestToken: blank(env.INGEST_TOKEN),
  });
}
