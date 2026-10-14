# Manual setup

Steps only the project owner can do. **Never paste credentials into committed files.** Use:

- `apps/web/.env.local` (git-ignored) for browser variables during development,
- `apps/api/.dev.vars` (git-ignored, like every `.dev.vars*` file except `.dev.vars.example`; copy `apps/api/.dev.vars.example`) for server variables during development,
- `wrangler secret put NAME` for production Worker secrets,
- your Pages project's environment variables for production browser variables.

## Credential summary

| Variable                                                                            | Comes from                                                                                    | Side                                                                                                           | Secret?                          | Domain restriction                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `VITE_MAPTILER_API_KEY`                                                             | MapTiler Cloud → Account → API keys                                                           | client                                                                                                         | no (public)                      | **Yes** — restrict to your domains + localhost |
| `VITE_API_BASE_URL`                                                                 | your Worker URL (or empty for same origin)                                                    | client                                                                                                         | no                               | —                                              |
| `PAYPAL_CLIENT_ID`                                                                  | PayPal Developer Dashboard → Apps & Credentials → (Sandbox) app                               | server (sent to browser via `/api/config`, which is safe by PayPal's design)                                   | no                               | Configure app return URLs                      |
| `PAYPAL_CLIENT_SECRET`                                                              | same app                                                                                      | **server only**                                                                                                | **yes**                          | —                                              |
| `PAYPAL_ENVIRONMENT`                                                                | `sandbox`                                                                                     | server                                                                                                         | no                               | —                                              |
| `PAYPAL_WEBHOOK_ID`                                                                 | Sandbox app → Webhooks → your webhook's ID                                                    | server                                                                                                         | not secret, but keep server-side | —                                              |
| `ANTHROPIC_API_KEY`                                                                 | console.anthropic.com → API keys                                                              | **server only**                                                                                                | **yes**                          | Set a workspace spend limit                    |
| `AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_DAILY_BUDGET_USD`, `AI_REQUESTS_PER_MINUTE` | your choice                                                                                   | server                                                                                                         | no                               | —                                              |
| `DATABASE_URL`                                                                      | Neon → Connect → **pooled** string (host `*.neon.tech`), with `worldlens_app` user + password | **server only** (`.dev.vars`; `wrangler secret put`)                                                           | **yes**                          | —                                              |
| `MIGRATION_DATABASE_URL`                                                            | Neon → Connect → **direct** (unpooled) string, owner role                                     | your machine only (`apps/api/.dev.vars` recommended, or the environment); the only URL `pnpm db:migrate` reads | **yes** (owner role)             | —                                              |
| `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`                                                 | your web app URL(s)                                                                           | server                                                                                                         | no                               | —                                              |
| `INGEST_TOKEN`                                                                      | generate (`openssl rand -hex 32`)                                                             | server                                                                                                         | **yes**                          | —                                              |
| `WHG_API_TOKEN`                                                                     | World Historical Gazetteer account                                                            | server                                                                                                         | yes                              | reserved — not used yet                        |
| `GEO_CACHE` (R2 binding)                                                            | Cloudflare dashboard → R2                                                                     | server binding                                                                                                 | —                                | —                                              |

There is no browser-side database key: the browser never talks to the database; all access goes through the Worker.

## MapTiler

1. Create an account at maptiler.com → **API keys** → create a key.
2. Under the key's **Allowed HTTP origins**, add `http://localhost:5173`, `http://127.0.0.1:5173` and your production domain.
3. Put it in `apps/web/.env.local`: `VITE_MAPTILER_API_KEY=...` and restart `pnpm dev`. The imagery notice disappears and terrain loads on MEDIUM/HIGH tiers.

## Neon (PostgreSQL + PostGIS)

Optional: without `DATABASE_URL` the API keeps ingested live news and payments in memory (curated history and DEMO scenarios ship with the code).

1. Create a project at console.neon.tech.
2. **Connect** → copy the **direct** (unpooled) connection string of the owner role (e.g. `neondb_owner`; the host has no `-pooler`) into `apps/api/.dev.vars` as `MIGRATION_DATABASE_URL=...`. Only `pnpm db:migrate` uses it: the first migration runs `create extension if not exists postgis`, so it must run as the owner, and Neon recommends a direct connection for schema migrations. `pnpm db:migrate` reads **only** `MIGRATION_DATABASE_URL` (the environment first, then `apps/api/.dev.vars`; surrounding quotes are fine) and never falls back to `DATABASE_URL`. Prefer the git-ignored `.dev.vars` file to typing the string on the command line, where it would end up in your shell history.
3. Create the API's role **with SQL**, connected as the owner. Preferred: open `psql` over the direct connection (e.g. `psql 'postgresql://neondb_owner@ep-<id>.<region>.aws.neon.tech/neondb?sslmode=require'`; with no password in the URL, psql asks for it) and run:

   ```
   create role worldlens_app with login;
   \password worldlens_app
   ```

   `\password` asks for the new password twice and sends only a SCRAM hash, not the plaintext. Generate the password with `openssl rand -hex 32` (hex needs no URL-encoding in a connection string). Typing `create role worldlens_app with login password '<password>';` in the Neon **SQL Editor** also works, but leaves the plaintext password in the editor's history and logs. Do not create this role in the Neon console: roles created via the console, CLI or API inherit `neon_superuser` (e.g. `CREATEDB`, `CREATEROLE`, `pg_write_all_data`), whereas a role created with SQL gets only what `db/grants.sql` grants it.

4. `pnpm db:migrate` (repo root). It applies each new file in `db/migrations/` once, each in its own transaction (recorded in `schema_migrations`), then re-applies `db/grants.sql`, which first revokes everything from `worldlens_app` on the schema's own objects (not on PostGIS's) and then grants exactly what the API uses (no `DELETE` anywhere; see DATA_MODEL.md), so re-running it is safe — do so after pulling new migrations. It warns if the host contains `-pooler` and prints only the host and database name, never the connection string; an invalid URL gets a fixed message, and errors are printed with connection strings redacted.
5. Build `DATABASE_URL` from the **pooled** connection string (Connect → pooled; the host contains `-pooler`) with user and password replaced by `worldlens_app` and its password, e.g. `postgresql://worldlens_app:<password>@ep-<id>-pooler.<region>.aws.neon.tech/neondb?sslmode=require`. Put it in `apps/api/.dev.vars` for development and set it with `cd apps/api && npx wrangler secret put DATABASE_URL` for production. Never use the owner string here. It must start with `postgresql://` or `postgres://` (surrounding quotes are tolerated), and the Worker — `pnpm dev` (`wrangler dev`) and production — accepts only Neon hosts (`*.neon.tech`).
6. Check: `GET /api/health` shows `repository: "neon+memory"`; provider `database` goes from `unknown` to `ok` after the first `/api/events` request (e.g. once the app has loaded). If `DATABASE_URL` cannot be parsed, or the Worker gets a host other than `*.neon.tech`, the database is disabled: `repository` stays `"memory"`, the `database` provider is `down` with a fixed, non-secret explanation in `lastError` (never the URL), and the API logs `database disabled: …` at startup. Later database errors appear in `lastError` as PostgreSQL's own message plus `(SQLSTATE xxxxx)`, or as “could not reach the database (connection or configuration error)”.

Local or self-hosted alternative: `pnpm dev:node` accepts any PostgreSQL + PostGIS URL (local or remote, migrated with `pnpm db:migrate`). It uses the Neon HTTP driver for `*.neon.tech` and node-postgres for every other host; with node-postgres, `/api/health` reports `repository: "postgres+memory"`. Such a URL does not work with `pnpm dev` (`wrangler dev`) or the deployed Worker, which accept only `*.neon.tech` and otherwise disable the database as described in step 6.

Local check of the migrations without Neon: `pnpm test:db` (needs PostgreSQL + PostGIS installed locally). It creates a throwaway cluster, runs the migration runner twice (the second run must apply nothing), runs `db/tests/smoke.sql`, then the 15 repository integration tests connected as `worldlens_app`. It finds PostgreSQL in `/usr/lib/postgresql/<version>/bin` (Debian/Ubuntu) or via `pg_ctl` on `PATH` (e.g. Homebrew on macOS); otherwise set `PGBIN` to the directory containing `initdb`, `pg_ctl` and `psql`, e.g. `PGBIN="$(pg_config --bindir)" pnpm test:db`. If none is found it stops with a clear message. PostGIS must be installed for that same PostgreSQL (with Homebrew, e.g. the `postgis` formula). The macOS + Homebrew path has not been tested (no Mac in the build environment).

## Cloudflare (Worker, cron, R2)

1. `npx wrangler login`.
2. Optional R2 border cache: `npx wrangler r2 bucket create worldlens-geo`, then uncomment the `[[r2_buckets]]` block in `apps/api/wrangler.toml`.
3. Set secrets: `cd apps/api && npx wrangler secret put PAYPAL_CLIENT_SECRET` (repeat for `PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `INGEST_TOKEN`).
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
5. Use the dashboard's **Webhooks simulator** or a real sandbox payment. Unsigned/forged requests get HTTP 401; an event ID that was already processed to completion is acknowledged as `duplicate`. A second copy that arrives while the first is still being processed gets HTTP 409 and PayPal retries it later. If processing a delivery fails, its receipt stays unprocessed and PayPal's retry is handled again; transient failures (e.g. PayPal or the database unreachable while looking up an unknown order) return HTTP 5xx so PayPal retries.

## Optional: PayPal MCP server for development

PayPal's MCP server can let your IDE assistant inspect sandbox orders while you test. Configure it per PayPal's current MCP documentation with **sandbox** credentials only, on your machine — WorldLens itself does not use it at runtime.

## Optional: World Historical Gazetteer

Reserved for a future gazetteer provider (`WHG_API_TOKEN`). Not used by the current code.

## Domain / DNS

1. Deploy the web app to Cloudflare Pages (see DEPLOYMENT.md) and add a custom domain (Pages → Custom domains); Cloudflare creates the DNS record.
2. Optionally route the Worker under the same domain (e.g. `example.com/api/*` via a Worker route) so the web app can keep `VITE_API_BASE_URL` empty.
3. Update `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, MapTiler allowed origins and the PayPal webhook URL to the new domain.
