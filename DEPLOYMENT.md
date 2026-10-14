# Deployment

Target: **Cloudflare Pages** (static web app) + **Cloudflare Worker** (API) + **Neon** (serverless PostgreSQL + PostGIS, optional). The setup is meant to fit free/low tiers for a hackathon; Neon plan limits have not been checked.

## 1. API (Worker)

```bash
cd apps/api
npx wrangler login
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID
npx wrangler secret put ANTHROPIC_API_KEY          # optional
npx wrangler secret put DATABASE_URL               # optional, see §3
npx wrangler secret put INGEST_TOKEN
# edit [vars] in wrangler.toml: ALLOWED_ORIGINS, PUBLIC_APP_URL
npx wrangler deploy
```

Smoke test: `curl https://<worker>/api/health`. The dry-run bundle is 2257 KiB raw / 446 KiB gzip (the Neon driver adds ~218 KB).

Manual ingestion: `curl -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://<worker>/api/ingest/run`.

## 2. Web (Pages)

```bash
cd apps/web
VITE_API_BASE_URL=https://<worker-host> VITE_MAPTILER_API_KEY=<key> pnpm build   # copies Cesium assets, type-checks, builds dist/
npx wrangler pages deploy dist --project-name worldlens
```

Or connect the GitHub repo in the Pages dashboard: build command `pnpm --filter @worldlens/web build`, output `apps/web/dist`, environment variables `VITE_API_BASE_URL`, `VITE_MAPTILER_API_KEY`.

> **Licence check before deploying `dist/`:** if you ran `pnpm data:fetch-basemaps`, Vite copies the git-ignored `public/vendor/historical-basemaps/` (GPL-3.0) into `dist/`. Either delete `apps/web/public/vendor` before building (the production API fetches the pinned files itself), or keep it and ship it under GPL-3.0 with its licence notice — see CONTENT_LICENSING.md.

Alternatively serve the API under the same origin with a Worker route (`example.com/api/*`) and leave `VITE_API_BASE_URL` empty.

## 3. Database (Neon)

1. Create a Neon project.
2. Connected as the owner role (e.g. `neondb_owner`), create the API's role **with SQL** — not in the Neon console, because roles created there (or via the CLI/API) inherit `neon_superuser`. Preferred, in `psql` over the direct connection string:

   ```sql
   create role worldlens_app with login;
   \password worldlens_app   -- psql asks for the password and sends only a SCRAM hash
   ```

   Use a generated password, e.g. `openssl rand -hex 32` (hex needs no URL-encoding). `create role worldlens_app with login password '<password>';` in the Neon SQL Editor also works, but leaves the plaintext password in the editor's history and logs.

3. Put the owner's **direct** (unpooled) connection string — host without `-pooler`; the first migration enables PostGIS — in the git-ignored `apps/api/.dev.vars` rather than on the command line (shell history), then apply migrations and grants from the repo root:

   ```bash
   # apps/api/.dev.vars:
   # MIGRATION_DATABASE_URL=postgresql://neondb_owner:<password>@ep-<id>.<region>.aws.neon.tech/neondb?sslmode=require
   pnpm db:migrate
   ```

   `pnpm db:migrate` reads only `MIGRATION_DATABASE_URL` (the environment first, then `apps/api/.dev.vars`; quotes tolerated) — it does not fall back to `DATABASE_URL`. It never prints the connection string and redacts it from errors. The runner applies each new file in `db/migrations/` once (recorded in `schema_migrations`) and re-applies `db/grants.sql` on every run (revoke everything from `worldlens_app`, then grant exactly what the API uses), so re-running it is safe; run it again after pulling new migrations.

4. Give the Worker the **pooled** connection string for `worldlens_app` (Neon console → Connect, pooled string, with user and password replaced):

   ```bash
   cd apps/api
   npx wrangler secret put DATABASE_URL
   # postgresql://worldlens_app:<password>@ep-<id>-pooler.<region>.aws.neon.tech/neondb?sslmode=require
   ```

   `GET /api/health` then reports `repository: "neon+memory"` and a `database` provider. The Worker accepts only `postgresql://`/`postgres://` URLs for Neon hosts (`*.neon.tech`): any other host, or a value that cannot be parsed, disables the database — `repository` stays `"memory"` and the `database` provider is `down` with a fixed, non-secret message in `lastError`. See MANUAL_SETUP.md.

Without a usable `DATABASE_URL` the API runs from memory; ingested live news and payments then live in isolate memory — acceptable for a demo because capture can re-derive the record from PayPal (`custom_id`), but use Neon for anything persistent.

## 4. After deploying

- Update `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, MapTiler allowed origins, PayPal webhook URL.
- Add WAF rate limits for `/api/ai/*`, `/api/payments/*`.
- Run through the HACKATHON.md checklist with real sandbox credentials.

## CI suggestion

`pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e`. The e2e suite starts its own servers and uses PayPal **test doubles** (`WORLDLENS_TEST_PAYPAL_MOCK=1` on the Node dev server only — never in the Worker). It never reuses a running API, so port 8787 must be free (stop `pnpm dev` / `pnpm dev:node` first).
