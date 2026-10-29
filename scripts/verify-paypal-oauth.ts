/**
 * Standalone verification script for PayPal Sandbox OAuth2 credentials.
 * Reads apps/api/.dev.vars locally without exposing secrets.
 * Run with: pnpm tsx scripts/verify-paypal-oauth.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadDevVars(): Record<string, string> {
  const file = path.resolve('apps', 'api', '.dev.vars');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2] !== '') out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

async function verify() {
  const vars = loadDevVars();
  const clientId = vars.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = vars.PAYPAL_CLIENT_SECRET?.trim();
  const environment = vars.PAYPAL_ENVIRONMENT?.trim() || 'sandbox';

  console.log('--- PayPal Sandbox Credential Check ---');
  console.log(`Environment config: ${environment}`);
  console.log(
    `PAYPAL_CLIENT_ID configured: ${clientId ? 'YES' : 'NO (missing in apps/api/.dev.vars)'}`,
  );
  console.log(
    `PAYPAL_CLIENT_SECRET configured: ${clientSecret ? 'YES' : 'NO (missing in apps/api/.dev.vars)'}`,
  );
  console.log(`PUBLIC_APP_URL: ${vars.PUBLIC_APP_URL || 'http://localhost:5173'}`);
  console.log(`PAYPAL_WEBHOOK_ID configured: ${vars.PAYPAL_WEBHOOK_ID ? 'YES' : 'NO (optional)'}`);

  if (!clientId || !clientSecret) {
    console.log(
      '\n[STATUS] Credentials incomplete. Please add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to apps/api/.dev.vars.',
    );
    process.exit(1);
  }

  if (environment !== 'sandbox') {
    console.error('\n[ERROR] Only sandbox environment is allowed. Set PAYPAL_ENVIRONMENT=sandbox.');
    process.exit(1);
  }

  console.log(
    '\nTesting OAuth2 connection to PayPal Sandbox (https://api-m.sandbox.paypal.com/v1/oauth2/token)...',
  );
  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    if (res.ok) {
      const data = (await res.json()) as { token_type?: string; expires_in?: number };
      console.log(`[STATUS] SUCCESS: OAuth2 authentication succeeded (HTTP ${res.status}).`);
      console.log(
        `Token type: ${data.token_type ?? 'Bearer'}, Expires in: ${data.expires_in ?? 3600}s.`,
      );
      console.log('PayPal Sandbox is ready for end-to-end checkout testing.');
    } else {
      const errText = await res.text();
      let errorDescription = 'Authentication rejected';
      try {
        const j = JSON.parse(errText) as { error?: string; error_description?: string };
        errorDescription = `${j.error ?? 'error'}: ${j.error_description ?? ''}`;
      } catch {
        errorDescription = errText.slice(0, 100);
      }
      console.error(
        `[STATUS] FAILED: PayPal rejected credentials (HTTP ${res.status}). Reason: ${errorDescription}`,
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(
      `[STATUS] NETWORK ERROR: Could not reach PayPal Sandbox API (${err instanceof Error ? err.message : String(err)}).`,
    );
    process.exit(1);
  }
}

void verify();
