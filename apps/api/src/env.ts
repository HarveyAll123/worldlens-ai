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
  /** Google Gemini (free tier from aistudio.google.com). Chosen automatically when set. */
  GEMINI_API_KEY?: string;
  /** OpenAI-compatible gateways (e.g. OpenCode Go). Ignored when AI_PROVIDER=anthropic. */
  OPENCODE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  /**
   * `gemini`, `openai` (any OpenAI-compatible Chat Completions endpoint: Groq, Cerebras,
   * OpenRouter, OpenCode…) or `anthropic`. Default: the first of these whose key is set.
   */
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
  /**
   * "files" (default): the 15-minute GKG files on data.gdeltproject.org, no rate limit.
   * "api": the DOC 2.0 search API (rate-limited per IP; often HTTP 429 from shared addresses).
   */
  GDELT_SOURCE?: string;
  /** Named-publisher RSS ingestion. Default off; set "true" to enable. */
  RSS_ENABLED?: string;
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
    provider: z.enum(['gemini', 'anthropic', 'openai']),
    apiKey: z.string().nullable(),
    baseUrl: z.string().nullable(),
    sessionId: z.string().nullable(),
    strongModel: z.string(),
    fastModel: z.string(),
    dailyBudgetUsd: z.number().nonnegative(),
    requestsPerMinute: z.number().int().positive(),
  }),
  database: z.object({ url: z.string().nullable() }),
  gdelt: z.object({
    enabled: z.boolean(),
    queries: z.array(z.string()),
    source: z.enum(['files', 'api']),
  }),
  rss: z.object({ enabled: z.boolean() }),
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

/** Google's OpenAI-compatible endpoint for Gemini (Chat Completions with tools). */
export const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

/**
 * Default models per provider. Gemini: free-tier models chosen for agent use (tool calling)
 * and speed — measured 2026-11-09, see PROVIDERS.md.
 */
export const DEFAULT_MODELS = {
  gemini: { strong: 'gemini-flash-lite-latest', fast: 'gemini-flash-lite-latest' },
  openai: { strong: 'deepseek-v4.1-flash', fast: 'deepseek-v4.1-flash' },
  anthropic: { strong: 'claude-opus-5-5', fast: 'claude-haiku-5-5' },
} as const;

/**
 * Tried in order when a Gemini model is busy (503 "high demand"), rate-limited (429), gone
 * (404) or too slow — free-tier capacity and speed change by the minute, and each model has
 * its own quota. Measured 2026-11-09 with the agent's real tools ("Show me Berlin and
 * highlight Germany"):
 *  - gemini-flash-lite-latest (the default; Google's current Flash-Lite): ~1.4–1.7 s, right
 *    parallel tool calls; the alias also survives retirements like 2.5's.
 *  - 3.1 Flash-Lite ~1.4 s (7 s at busy moments), right calls; 3.5 Flash-Lite ~1.3 s but
 *    missed the highlight.
 *  - 3.6 Flash ~4 s and 3.5 Flash ~5 s: smarter, but 20 requests a day each on the free tier
 *    (an agent question takes 3–6), so they come last.
 *  - 3.7/3.8 Flash and gemini-flash-latest were busy or timing out; 2.5 models are closed to
 *    new users.
 */
export const GEMINI_FALLBACKS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

export function loadConfig(env: Env): Config {
  const environment = (blank(env.PAYPAL_ENVIRONMENT) ?? 'sandbox').toLowerCase();
  // Provider selection: explicit AI_PROVIDER wins; otherwise an OpenAI-compatible key (OpenCode /
  // OpenAI) selects that path, and a bare ANTHROPIC_API_KEY keeps the original Anthropic path.
  const explicitProvider = blank(env.AI_PROVIDER)?.toLowerCase();
  const geminiKey = blank(env.GEMINI_API_KEY);
  const openAiKey = blank(env.OPENCODE_API_KEY) ?? blank(env.OPENAI_API_KEY);
  const anthropicKey = blank(env.ANTHROPIC_API_KEY);
  const provider: 'gemini' | 'openai' | 'anthropic' =
    explicitProvider === 'gemini' ||
    explicitProvider === 'openai' ||
    explicitProvider === 'anthropic'
      ? explicitProvider
      : geminiKey
        ? 'gemini'
        : openAiKey
          ? 'openai'
          : 'anthropic';
  const aiApiKey =
    provider === 'gemini'
      ? geminiKey
      : provider === 'openai'
        ? (openAiKey ?? anthropicKey)
        : anthropicKey;
  const aiBaseUrl =
    blank(env.AI_BASE_URL) ??
    (provider === 'gemini'
      ? GEMINI_OPENAI_BASE_URL
      : provider === 'openai'
        ? 'https://opencode.ai/inference/go/openai/v1'
        : null);
  // A model named for another provider (e.g. claude-… left over with a Gemini key) is ignored.
  const model = (value: string | undefined, fallback: string) => {
    const v = blank(value);
    const foreign =
      v &&
      ((provider !== 'anthropic' && v.startsWith('claude-')) ||
        (provider !== 'gemini' && v.startsWith('gemini-')));
    return v && !foreign ? v : fallback;
  };
  const defaults = DEFAULT_MODELS[provider];
  return ConfigSchema.parse({
    paypal: {
      clientId: blank(env.PAYPAL_CLIENT_ID),
      clientSecret: blank(env.PAYPAL_CLIENT_SECRET),
      environment: environment === 'live' ? 'live' : 'sandbox',
      webhookId: blank(env.PAYPAL_WEBHOOK_ID),
    },
    ai: {
      provider,
      apiKey: aiApiKey,
      baseUrl: aiBaseUrl,
      sessionId: blank(env.AI_SESSION_ID),
      strongModel: model(env.AI_MODEL_STRONG, defaults.strong),
      fastModel: model(env.AI_MODEL_FAST, defaults.fast),
      dailyBudgetUsd: Number(blank(env.AI_DAILY_BUDGET_USD) ?? '5'),
      requestsPerMinute: Math.max(1, Math.floor(Number(blank(env.AI_REQUESTS_PER_MINUTE) ?? '8'))),
    },
    database: { url: blank(env.DATABASE_URL) },
    rss: { enabled: (blank(env.RSS_ENABLED) ?? 'false').toLowerCase() === 'true' },
    gdelt: {
      enabled: (blank(env.GDELT_ENABLED) ?? 'true') !== 'false',
      queries:
        blank(env.GDELT_QUERIES)
          ?.split('||')
          .map((q) => q.trim())
          .filter(Boolean) ?? DEFAULT_GDELT_QUERIES,
      source: blank(env.GDELT_SOURCE)?.toLowerCase() === 'api' ? 'api' : 'files',
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
