# Deployment

Target: **one Cloudflare Worker** that serves the website (`apps/web/dist`, as static assets) and the API under `/api/*` on the same address — sign-in cookies need both on one origin — plus **Neon** (serverless PostgreSQL + PostGIS). No custom domain is needed (`https://worldlens.<you>.workers.dev`); one can be added later.

**Plan:** the Workers **Paid** plan ($5/month). The Free plan allows 10 ms of CPU per request and per cron run: reading GDELT's news files (the 15-minute cron), hashing passwords (email sign-in) and building the search index all take far more, so live news would stop updating and email sign-in would fail. Network waits (Gemini, Wikipedia, Neon) do not count.

## 1. Build and deploy (website + API)

```bash
cd apps/api
npx wrangler login
# Secrets, one at a time (wrangler asks for each value; nothing goes into shell history):
npx wrangler secret put BETTER_AUTH_SECRET      # openssl rand -base64 32
npx wrangler secret put DATABASE_URL            # Neon pooled URL for worldlens_app, see §3
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put MAIL_FROM               # the sender verified in Brevo
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put INGEST_TOKEN            # openssl rand -hex 32 (manual ingestion)
cd ../..
pnpm deploy        # builds apps/web (with apps/web/.env.local: VITE_MAPTILER_API_KEY, empty VITE_API_BASE_URL) and deploys the Worker
```

Then put the address wrangler printed into `PUBLIC_APP_URL` and `ALLOWED_ORIGINS` in `apps/api/wrangler.toml` and run `pnpm deploy` again. Add `https://<address>/api/auth/callback/google` to the Google OAuth client's redirect URIs (and the address to its JavaScript origins), and the address to MapTiler's allowed origins.

Smoke test: `curl https://<address>/api/health`. The dry-run bundle measured on 2026-11-10 is **5379 KiB raw / 1043 KiB gzip** (within the Paid plan's 10 MB). Manual ingestion: `curl -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://<address>/api/ingest/run`.

## 2. How the data stays current

- **Live news:** the `*/15` cron ingests GDELT into Neon. Instances serving requests load the stored stories from Neon for search (the bar and the assistant), at most every 5 minutes, and ingest themselves only when Neon's ingestion log shows nothing in the last 15 minutes (the cron failing).
- **News of the past:** read from Wikipedia when shown (cached in memory), up to a day ago.
- **Publisher directory and place names:** static files in the website (`pnpm data:publishers`, `pnpm data:places` refresh them); the Worker reads them through its assets binding.

> **Licence check before deploying:** if you ran `pnpm data:fetch-basemaps`, Vite copies the git-ignored `public/vendor/historical-basemaps/` (GPL-3.0) into `dist/`. Delete `apps/web/public/vendor` before deploying, or ship it under GPL-3.0 with its licence notice — see CONTENT_LICENSING.md.

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

- Update `ALLOWED_ORIGINS`, `PUBLIC_APP_URL` (§1), Google OAuth redirect URI, MapTiler allowed origins, PayPal webhook URL.
- Add WAF rate limits for `/api/ai/*`, `/api/payments/*`.
- Run through the HACKATHON.md checklist with real sandbox credentials.

## CI suggestion

`pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e`. The e2e suite starts its own servers and uses PayPal **test doubles** (`WORLDLENS_TEST_PAYPAL_MOCK=1` on the Node dev server only — never in the Worker). It never reuses a running API, so port 8787 must be free (stop `pnpm dev` / `pnpm dev:node` first).
