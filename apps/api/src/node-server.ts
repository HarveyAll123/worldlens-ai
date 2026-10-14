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

function loadDevVars(): Record<string, string> {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[2] !== '') out[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  }
  return out;
}

const env = { ...loadDevVars(), ...process.env } as unknown as Env;

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
const deps = createDeps(env, fetchImpl ? { fetchImpl } : {});
const app = createApp(deps);
const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.info(
    `[worldlens-api] http://127.0.0.1:${info.port}  ai=${deps.ai.available ? 'on' : 'offline'}  paypal=${
      deps.payments.publicConfig().configured ? deps.config.paypal.environment : 'not configured'
    }  repo=${deps.repo.name}  gdelt=${deps.news ? 'on' : 'off'}`,
  );
});
