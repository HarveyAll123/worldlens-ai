/**
 * Node.js server for local development and end-to-end tests (same Hono app as the Worker).
 * Reads configuration from process.env (and apps/api/.dev.vars if present).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createDeps } from './deps';
import type { Env } from './env';
import { FakePayPal } from './testing/fake-paypal';
import { classifyDatabaseUrl, type SqlClient } from './data/sql';
import { nodePostgresClient } from './data/sql-node';

function parseDevVarsFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2] !== '') out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return out;
}

function loadDevVars(): Record<string, string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const appDevVars = path.join(here, '..', '.dev.vars');
  const rootDevVars = path.join(here, '..', '..', '..', '.dev.vars');
  return { ...parseDevVarsFile(rootDevVars), ...parseDevVarsFile(appDevVars) };
}

const nonBlankProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([_, v]) => v !== undefined && v.trim() !== ''),
);
const env = { ...loadDevVars(), ...nonBlankProcessEnv } as unknown as Env;

// TEST-ONLY: route PayPal REST calls to an in-process fake (used by Playwright). Never used
// by the Worker. Orders are auto-approved because the browser-side SDK is faked too.
const mockPayPal = process.env.WORLDLENS_TEST_PAYPAL_MOCK === '1';
let fetchImpl: typeof fetch | undefined;
if (mockPayPal) {
  const fake = new FakePayPal();
  fake.autoApprove = true;
  Object.assign(env, {
    PAYPAL_CLIENT_ID: 'mock-client-id',
    PAYPAL_CLIENT_SECRET: 'mock-secret',
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_WEBHOOK_ID: 'WH-MOCK',
  });
  fetchImpl = ((input: string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    return new URL(url).hostname.endsWith('paypal.com')
      ? fake.fetch(input, init)
      : fetch(input, init);
  }) as typeof fetch;
  console.warn('[worldlens-api] TEST MODE: PayPal REST is mocked (WORLDLENS_TEST_PAYPAL_MOCK=1)');
}
// Neon uses the same HTTP driver as the Worker; any other PostgreSQL (e.g. a local one) is
// reached with node-postgres over TCP.
const target = env.DATABASE_URL?.trim() ? classifyDatabaseUrl(env.DATABASE_URL) : null;
const sql: SqlClient | undefined =
  target && (target.kind === 'local' || target.kind === 'other')
    ? nodePostgresClient(target.url)
    : undefined;
const deps = createDeps(env, { ...(fetchImpl ? { fetchImpl } : {}), ...(sql ? { sql } : {}) });
const app = createApp(deps);
const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  const pp = deps.payments.publicConfig();
  const missing = [
    !deps.config.paypal.clientId && 'PAYPAL_CLIENT_ID',
    !deps.config.paypal.clientSecret && 'PAYPAL_CLIENT_SECRET',
  ].filter(Boolean);
  const ppStatus = pp.configured
    ? pp.environment
    : `not configured (missing: ${missing.join(', ') || 'credentials'})`;
  console.info(
    `[worldlens-api] http://127.0.0.1:${info.port}  ai=${deps.ai.available ? 'on' : 'offline'}  paypal=${ppStatus}  repo=${deps.repo.name}  gdelt=${deps.news ? 'on' : 'off'}`,
  );
});
