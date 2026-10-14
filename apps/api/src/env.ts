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
  AI_MODEL_STRONG?: string;
  AI_MODEL_FAST?: string;
  AI_DAILY_BUDGET_USD?: string;
  AI_REQUESTS_PER_MINUTE?: string;
  /** Neon (or any PostgreSQL + PostGIS) connection string. Secret. */
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
    apiKey: z.string().nullable(),
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
  return ConfigSchema.parse({
    paypal: {
      clientId: blank(env.PAYPAL_CLIENT_ID),
      clientSecret: blank(env.PAYPAL_CLIENT_SECRET),
      environment: environment === 'live' ? 'live' : 'sandbox',
      webhookId: blank(env.PAYPAL_WEBHOOK_ID),
    },
    ai: {
      apiKey: blank(env.ANTHROPIC_API_KEY),
      strongModel: blank(env.AI_MODEL_STRONG) ?? 'claude-opus-5-5',
      fastModel: blank(env.AI_MODEL_FAST) ?? 'claude-haiku-5-5',
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
