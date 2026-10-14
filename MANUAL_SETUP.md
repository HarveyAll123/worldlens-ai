# Manual setup

Steps only the project owner can do. **Never paste credentials into committed files.** Use:

- `apps/web/.env.local` (git-ignored) for browser variables during development,
- `apps/api/.dev.vars` (git-ignored; copy `apps/api/.dev.vars.example`) for server variables during development,
- `wrangler secret put NAME` for production Worker secrets,
- your Pages project's environment variables for production browser variables.

## Credential summary

| Variable                                                                            | Comes from                                                                                                    | Side                                                                         | Secret?                          | Domain restriction                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `VITE_MAPTILER_API_KEY`                                                             | MapTiler Cloud → Account → API keys                                                                           | client                                                                       | no (public)                      | **Yes** — restrict to your domains + localhost |
| `VITE_API_BASE_URL`                                                                 | your Worker URL (or empty for same origin)                                                                    | client                                                                       | no                               | —                                              |
| `PAYPAL_CLIENT_ID`                                                                  | PayPal Developer Dashboard → Apps & Credentials → (Sandbox) app                                               | server (sent to browser via `/api/config`, which is safe by PayPal's design) | no                               | Configure app return URLs                      |
| `PAYPAL_CLIENT_SECRET`                                                              | same app                                                                                                      | **server only**                                                              | **yes**                          | —                                              |
| `PAYPAL_ENVIRONMENT`                                                                | `sandbox`                                                                                                     | server                                                                       | no                               | —                                              |
| `PAYPAL_WEBHOOK_ID`                                                                 | Sandbox app → Webhooks → your webhook's ID                                                                    | server                                                                       | not secret, but keep server-side | —                                              |
| `ANTHROPIC_API_KEY`                                                                 | console.anthropic.com → API keys                                                                              | **server only**                                                              | **yes**                          | Set a workspace spend limit                    |
| `AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_DAILY_BUDGET_USD`, `AI_REQUESTS_PER_MINUTE` | your choice                                                                                                   | server                                                                       | no                               | —                                              |
| `DATABASE_URL`                                                                      | Neon → **Connect** → **pooled** string, with the `worldlens_app` role's user and password (see [Neon](#neon)) | **server only**                                                              | **yes**                          | —                                              |
| `MIGRATION_DATABASE_URL`                                                            | Neon → **Connect** → **direct** (unpooled) string for the owner role, e.g. `neondb_owner`                     | your machine only (`pnpm db:migrate`) — never deployed                       | **yes** (owner rights)           | —                                              |
| `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`                                                 | your web app URL(s)                                                                                           | server                                                                       | no                               | —                                              |
| `INGEST_TOKEN`                                                                      | generate (`openssl rand -hex 32`)                                                                             | server                                                                       | **yes**                          | —                                              |
| `WHG_API_TOKEN`                                                                     | World Historical Gazetteer account                                                                            | server                                                                       | yes                              | reserved — not used yet                        |
| `GEO_CACHE` (R2 binding)                                                            | Cloudflare dashboard → R2                                                                                     | server binding                                                               | —                                | —                                              |

The browser never connects to the database; only the Worker does, with `DATABASE_URL`.

## MapTiler

1. Create an account at maptiler.com → **API keys** → create a key.
2. Under the key's **Allowed HTTP origins**, add `http://localhost:5173`, `http://127.0.0.1:5173` and your production domain.
3. Put it in `apps/web/.env.local`: `VITE_MAPTILER_API_KEY=...` and restart `pnpm dev`. The imagery notice disappears and terrain loads on MEDIUM/HIGH tiers.

## Neon

Optional. Without `DATABASE_URL` the API keeps live news and payments in memory. With it, the Worker stores ingested live news and all payment state in Neon (PostgreSQL + PostGIS); curated history and demo events still ship with the code.

Two roles, two connection strings:

- `DATABASE_URL` — the least-privilege `worldlens_app` role over the **pooled** string (host contains `-pooler`). Used by the API at runtime. Its rights come from `db/grants.sql` (for example, it cannot delete payments or rewrite webhook receipts).
- `MIGRATION_DATABASE_URL` — the owner role (e.g. `neondb_owner`) over the **direct** (unpooled) string. Used only by `pnpm db:migrate` on your machine.

1. Create a project at console.neon.tech. The defaults are fine; the first migration enables PostGIS.
2. Create the API role **with SQL**, in the console's **SQL Editor** (it runs as the owner) or with `psql` on the direct owner string. Do **not** use the console's **Roles** page (or the Neon CLI/API): roles created there inherit `neon_superuser`, which can write every table and bypasses RLS.

   ```sql
   create role worldlens_app with login password '<long random>';
   ```

   Generate the password with `openssl rand -base64 32 | tr -d '+/='`: Neon requires at least 60 bits of entropy, and letters and digits need no escaping in a connection string.

3. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` (git-ignored) and fill in, from Neon → **Connect**:
   - `MIGRATION_DATABASE_URL` — role `neondb_owner`, connection pooling **off**: `postgresql://neondb_owner:<password>@ep-<id>.<region>.aws.neon.tech/neondb?sslmode=require`
   - `DATABASE_URL` — connection pooling **on**, then replace the user and password with `worldlens_app` and the password from step 2: `postgresql://worldlens_app:<password>@ep-<id>-pooler.<region>.aws.neon.tech/neondb?sslmode=require`

4. Apply the schema: `pnpm db:migrate` (see `scripts/db-migrate.ts`). It applies each `db/migrations/*.sql` once, in order, each in its own transaction (recorded in `schema_migrations`), then re-applies `db/grants.sql` on every run. It takes the first of `MIGRATION_DATABASE_URL`, `DATABASE_URL` from the environment, then the same two from `apps/api/.dev.vars` — so an exported `DATABASE_URL` beats `.dev.vars`, and a `worldlens_app` string fails because that role cannot create tables. It warns if given a `-pooler` host. If it prints `role worldlens_app does not exist; skipping grants`, do step 2 and run it again. Re-running is safe; run it again whenever new migrations land.
5. Production: `cd apps/api && npx wrangler secret put DATABASE_URL` and paste the pooled `worldlens_app` string. Do **not** upload `MIGRATION_DATABASE_URL`: the Worker never needs owner rights. Run `pnpm db:migrate` from your machine before deploying code that needs a new migration.
6. Check: start the API (`pnpm dev` or `pnpm dev:node`), open the app once so it loads events, then `curl http://127.0.0.1:8787/api/health`. Expect `repository: "neon+memory"` and, under `providers`, `database` with `state: "ok"`. `unknown` means no query has run yet; `down` or `degraded` means a query failed (see `lastError`) and reads are falling back to memory.

Neon CLI shortcut for step 3 (prints the passwords to your terminal):

```bash
npx neon@latest login
npx neon@latest link --no-env-pull
npx neon@latest connection-string --role-name neondb_owner
npx neon@latest connection-string --role-name neondb_owner --pooled
```

`link` records the project in a git-ignored `.neon` file; `--no-env-pull` stops it writing the owner's `DATABASE_URL` into a root `.env.local` that the API does not read. The first `connection-string` (direct, default branch) is `MIGRATION_DATABASE_URL`. The second gives the pooled host for `DATABASE_URL`; swap in the `worldlens_app` user and password.

Without Neon: with `pnpm dev:node`, `DATABASE_URL` can point at a local PostgreSQL + PostGIS on `localhost` (the repository is then `postgres+memory`). `pnpm test:db` checks the migrations, grants and repository against a throwaway local PostGIS (needs the `postgres` and `postgis` binaries).

## Cloudflare (Worker, cron, R2)

1. `npx wrangler login`.
2. Optional R2 border cache: `npx wrangler r2 bucket create worldlens-geo`, then uncomment the `[[r2_buckets]]` block in `apps/api/wrangler.toml`.
3. Set secrets: `cd apps/api && npx wrangler secret put PAYPAL_CLIENT_SECRET` (repeat for `PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `INGEST_TOKEN`). `DATABASE_URL` is the pooled `worldlens_app` string (see [Neon](#neon)); never upload `MIGRATION_DATABASE_URL`.
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
