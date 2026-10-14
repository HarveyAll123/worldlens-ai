# Manual setup

Steps only the project owner can do. **Never paste credentials into committed files.** Use:

- `apps/web/.env.local` (git-ignored) for browser variables during development,
- `apps/api/.dev.vars` (git-ignored; copy `apps/api/.dev.vars.example`) for server variables during development,
- `wrangler secret put NAME` for production Worker secrets,
- your Pages project's environment variables for production browser variables.

## Credential summary

| Variable                                                                            | Comes from                                                      | Side                                                                         | Secret?                          | Domain restriction                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `VITE_MAPTILER_API_KEY`                                                             | MapTiler Cloud → Account → API keys                             | client                                                                       | no (public)                      | **Yes** — restrict to your domains + localhost |
| `VITE_API_BASE_URL`                                                                 | your Worker URL (or empty for same origin)                      | client                                                                       | no                               | —                                              |
| `PAYPAL_CLIENT_ID`                                                                  | PayPal Developer Dashboard → Apps & Credentials → (Sandbox) app | server (sent to browser via `/api/config`, which is safe by PayPal's design) | no                               | Configure app return URLs                      |
| `PAYPAL_CLIENT_SECRET`                                                              | same app                                                        | **server only**                                                              | **yes**                          | —                                              |
| `PAYPAL_ENVIRONMENT`                                                                | `sandbox`                                                       | server                                                                       | no                               | —                                              |
| `PAYPAL_WEBHOOK_ID`                                                                 | Sandbox app → Webhooks → your webhook's ID                      | server                                                                       | not secret, but keep server-side | —                                              |
| `ANTHROPIC_API_KEY`                                                                 | console.anthropic.com → API keys                                | **server only**                                                              | **yes**                          | Set a workspace spend limit                    |
| `AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_DAILY_BUDGET_USD`, `AI_REQUESTS_PER_MINUTE` | your choice                                                     | server                                                                       | no                               | —                                              |
| `SUPABASE_URL`                                                                      | Supabase → Project settings → API                               | server                                                                       | no                               | —                                              |
| `SUPABASE_SERVICE_ROLE_KEY`                                                         | Supabase → Project settings → API → service_role                | **server only**                                                              | **yes** (bypasses RLS)           | —                                              |
| `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`                                                 | your web app URL(s)                                             | server                                                                       | no                               | —                                              |
| `INGEST_TOKEN`                                                                      | generate (`openssl rand -hex 32`)                               | server                                                                       | **yes**                          | —                                              |
| `WHG_API_TOKEN`                                                                     | World Historical Gazetteer account                              | server                                                                       | yes                              | reserved — not used yet                        |
| `GEO_CACHE` (R2 binding)                                                            | Cloudflare dashboard → R2                                       | server binding                                                               | —                                | —                                              |

The Supabase anon key is **not** needed: the browser never talks to Supabase directly; all access goes through the Worker.

## MapTiler

1. Create an account at maptiler.com → **API keys** → create a key.
2. Under the key's **Allowed HTTP origins**, add `http://localhost:5173`, `http://127.0.0.1:5173` and your production domain.
3. Put it in `apps/web/.env.local`: `VITE_MAPTILER_API_KEY=...` and restart `pnpm dev`. The imagery notice disappears and terrain loads on MEDIUM/HIGH tiers.

## Supabase (PostgreSQL + PostGIS)

1. Create a project at supabase.com.
2. **Database → Extensions** → enable `postgis` (the migration also runs `create extension if not exists postgis`).
3. Apply migrations, either with the Supabase CLI (`supabase link --project-ref <ref>` then `supabase db push`) or by pasting `supabase/migrations/*.sql` in order into the SQL editor.
4. Copy **Project URL** and **service_role** key into `apps/api/.dev.vars` / `wrangler secret put`.
5. Check: `GET /api/health` shows `repository: "supabase+memory"` and provider `supabase` becomes `ok` after the first ingestion.

Local check of the migrations without Supabase: `pnpm test:db` (needs PostgreSQL + PostGIS installed locally).

## Cloudflare (Worker, cron, R2)

1. `npx wrangler login`.
2. Optional R2 border cache: `npx wrangler r2 bucket create worldlens-geo`, then uncomment the `[[r2_buckets]]` block in `apps/api/wrangler.toml`.
3. Set secrets: `cd apps/api && npx wrangler secret put PAYPAL_CLIENT_SECRET` (repeat for `PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_TOKEN`).
4. Edit `[vars]` in `wrangler.toml`: `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`.
5. `npx wrangler deploy`. The cron trigger (`*/30 * * * *`) runs news ingestion.
6. Recommended: add a Cloudflare WAF rate-limiting rule for `/api/ai/*` and `/api/payments/*` (the in-Worker limiter is per isolate).

## Anthropic

1. console.anthropic.com → **API keys** → create a key in a workspace with a **monthly spend limit**.
2. `ANTHROPIC_API_KEY=...` in `apps/api/.dev.vars` (dev) or `wrangler secret put ANTHROPIC_API_KEY`.
3. Optionally change `AI_MODEL_STRONG` / `AI_MODEL_FAST` and `AI_DAILY_BUDGET_USD`.
4. Check: the assistant header shows **AI** instead of **Offline assistant**; `GET /api/ai/usage` shows spend.

## PayPal Developer Dashboard and Sandbox

1. Log in at developer.paypal.com → **Apps & Credentials** → toggle **Sandbox** → **Create App** (type: Merchant). This creates a sandbox **business** (merchant) account for the app — this is the “WorldLens Sandbox Relief Fund” demo payee. It is not a charity.
2. Copy the app's **Client ID** and **Secret** → `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (server side). Keep `PAYPAL_ENVIRONMENT=sandbox`; live is refused by this build.
3. **Testing → Sandbox accounts**: use (or create) a **Personal** sandbox account as the buyer. Note its email/password (dashboard → account → View/Edit). Only sandbox accounts can log in to the sandbox checkout.
4. Run the app, open a DEMO relief event → **Review & continue** → tick the acknowledgement → PayPal button → log in with the **sandbox personal** account → approve. The receipt shows status `CAPTURED` and a capture ID from PayPal; confirm it in the sandbox merchant account's activity at sandbox.paypal.com.

## PayPal webhooks

Webhooks need a public HTTPS URL.

1. Deploy the Worker (or tunnel your local API, e.g. `cloudflared tunnel --url http://127.0.0.1:8787`).
2. Sandbox app → **Webhooks** → **Add webhook** → URL `https://<your-worker>/api/paypal/webhook`.
3. Subscribe to: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `CHECKOUT.PAYMENT-APPROVAL.REVERSED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED` (and `PAYMENT.CAPTURE.DECLINED` if listed).
4. Copy the **Webhook ID** → `PAYPAL_WEBHOOK_ID`.
5. Use the dashboard's **Webhooks simulator** or a real sandbox payment. Unsigned/forged requests get HTTP 401; repeated event IDs are acknowledged as `duplicate`.

## Optional: PayPal MCP server for development

PayPal's MCP server can let your IDE assistant inspect sandbox orders while you test. Configure it per PayPal's current MCP documentation with **sandbox** credentials only, on your machine — WorldLens itself does not use it at runtime.

## Optional: World Historical Gazetteer

Reserved for a future gazetteer provider (`WHG_API_TOKEN`). Not used by the current code.

## Domain / DNS

1. Deploy the web app to Cloudflare Pages (see DEPLOYMENT.md) and add a custom domain (Pages → Custom domains); Cloudflare creates the DNS record.
2. Optionally route the Worker under the same domain (e.g. `example.com/api/*` via a Worker route) so the web app can keep `VITE_API_BASE_URL` empty.
3. Update `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, MapTiler allowed origins and the PayPal webhook URL to the new domain.
