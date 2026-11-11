# Deployment

## Free, no credit card: Cloudflare (site) + Render (backend)

- **Cloudflare Workers Free** (no card) serves the website's files (free, unlimited) and forwards `/api/*` to the backend (`deploy/free/worker.ts`, `deploy/free/wrangler.toml`): one address, so sign-in cookies work. Forwarding only passes bytes through, well under the Free plan's 10 ms of CPU.
- **Render's free web service** runs the backend — the Node server, from `render.yaml` (512 MB, 0.1 CPU; the server uses about 260 MB). The free plan needs no card, so add none: without one, going over a free limit pauses the service until the next month instead of billing it (Render compresses the API's answers, and this site stays far below its free bandwidth). If Render asks to verify a card anyway, a debit card is fine; then keep an eye on Billing → bandwidth.
- **cron-job.org** (free) runs two jobs: a ping every 10 minutes keeps the backend awake (Render sleeps a free service after 15 minutes without traffic; its 750 free hours a month cover one service all month), and a news refresh every 30 minutes. While someone has the site open, the backend also refreshes the news itself every 15 minutes.
- **Neon** stays the database. Its free plan has 100 compute hours and 5 GB of transfer a month, then pauses the database until the next month (it never charges). The database sleeps 5 minutes after its last query, so the ping never touches it, the news refresh runs every 30 minutes rather than 10, and the server never re-reads news it stored itself.

Safety: the backend answers only requests carrying the Worker's `PROXY_SECRET` (only `/api/health` is open, for health checks and the ping), so nobody can call it directly or forge their address to dodge rate limits; the Worker passes the visitor's real address. Secrets live in Render's dashboard (encrypted; `sync: false` in `render.yaml`) and as one Cloudflare secret — never in git.

1. **Push the code:** Render builds from GitHub, so commit and push (`.dev.vars` and `.env*` are git-ignored and stay on your computer).
2. **Secrets for production** (new ones; keep them in a password manager, never in chat or git): `openssl rand -base64 32` for `BETTER_AUTH_SECRET`, again for `PROXY_SECRET`, and `openssl rand -hex 32` for `INGEST_TOKEN`.
3. **Cloudflare** (sign up, no card): from the repository root, `pnpm --filter @worldlens/api exec wrangler login`, then `pnpm deploy:free` — it prints the site's address, `https://worldlens.<you>.workers.dev`. Then add the shared secret: `pnpm --filter @worldlens/api exec wrangler secret put PROXY_SECRET --config ../../deploy/free/wrangler.toml`.
4. **Render** (sign up with GitHub): New → Blueprint → this repository. It reads `render.yaml` and asks for each secret: `PUBLIC_APP_URL` and `ALLOWED_ORIGINS` = the Cloudflare address, `PROXY_SECRET`, `BETTER_AUTH_SECRET`, `INGEST_TOKEN`, `DATABASE_URL` (Neon's pooled `worldlens_app` string — not the owner one), `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`, `BREVO_API_KEY`, `MAIL_FROM`, `PAYPAL_CLIENT_ID`/`SECRET`. Deploy; note its address (`https://worldlens-api.onrender.com` or similar). Optional, later under Environment: `PAYPAL_WEBHOOK_ID` for a PayPal webhook to `https://worldlens.<you>.workers.dev/api/paypal/webhook`.
5. **Connect them:** set `API_ORIGIN` in `deploy/free/wrangler.toml` to the Render address, then `pnpm deploy:free` again.
6. **cron-job.org** (free account), two jobs:
   - _Awake:_ `https://worldlens.<you>.workers.dev/api/health`, every 10 minutes (no header).
   - _News:_ `https://worldlens.<you>.workers.dev/api/ingest/run?wait=0`, every 30 minutes; Advanced → method **POST**, header `Authorization` = `Bearer <INGEST_TOKEN>` (that token can only start a news refresh).
7. **Outside services:** Google OAuth client — redirect URI `https://worldlens.<you>.workers.dev/api/auth/callback/google` and JavaScript origin `https://worldlens.<you>.workers.dev`; MapTiler — the same origin.
8. **Check:** open the site; `https://worldlens.<you>.workers.dev/api/health`; Render → Logs; cron-job.org → history (200 for the ping, 202 for the news).

Updates: push to GitHub and Render redeploys the backend by itself; for changes to the website, run `pnpm deploy:free` again.

Limits: the first request after Render restarts the backend takes a few seconds (a minute if it slept); Cloudflare Free allows 100,000 API requests a day (the site's files are unlimited), after which `/api` answers 429 until the next day.

## Free with a credit card: one Oracle Cloud server

Oracle Cloud's Always Free tier (2 Arm cores, 12 GB memory, 10 TB/month outbound) runs the whole site on one server: Caddy serves the website over HTTPS and passes `/api/*` to the API (the same app as the Worker, on Node.js, listening only on `127.0.0.1`), and a systemd timer reads live news every 15 minutes. Files: `deploy/oracle/` (setup script, update script, Caddyfile, services, settings template).

Secrets live only in `/etc/worldlens/api.env` on the server (owner root, mode 600: systemd reads it to start the API, which itself cannot read it) and in your git-ignored `apps/api/.dev.vars` on your Mac. Neon's owner connection string never leaves your Mac (migrations run from there).

1. **Account:** sign up at oracle.com/cloud/free (a card verifies identity; Always Free resources are not charged — do not upgrade the account). Choose the home region near your users (it cannot be changed later).
2. **Server:** Compute → Instances → Create: image **Ubuntu 24.04** (aarch64), shape **VM.Standard.A1.Flex** with **1 OCPU and 3 GB** memory (Oracle may reclaim an Always Free server whose CPU, network and memory use all stay under 20% for 7 days; a small server keeps memory above that), a public IPv4 address, and your SSH public key (`ssh-keygen -t ed25519 -f ~/.ssh/worldlens_oracle` on your Mac; paste the `.pub`). "Out of capacity": retry or pick another availability domain.
3. **Ports:** Networking → Virtual cloud networks → your VCN → subnet → security list → add ingress rules for TCP **80** and **443** from `0.0.0.0/0` (SSH 22 is already open).
4. **Address:** at duckdns.org (sign in; keep its token private) create a subdomain, e.g. `worldlens.duckdns.org`, pointing to the server's public IP.
5. **Code:** `ssh -i ~/.ssh/worldlens_oracle ubuntu@<server IP>`, then make a read-only deploy key and clone:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
   cat ~/.ssh/github_deploy.pub     # GitHub → your repo → Settings → Deploy keys → Add (read-only)
   printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
   sudo install -d -o ubuntu -g ubuntu /srv/worldlens
   git clone git@github.com:<you>/<repo>.git /srv/worldlens
   ```

6. **Setup:** `bash /srv/worldlens/deploy/oracle/setup.sh worldlens.duckdns.org` — updates (and automatic security updates), swap, firewall openings, Node.js 24, pnpm, Caddy, the service user, `/etc/worldlens/api.env` with a fresh `BETTER_AUTH_SECRET` and `INGEST_TOKEN`, and the services.
7. **Secrets:** `sudoedit /etc/worldlens/api.env` and type or paste the values from your Mac's `apps/api/.dev.vars` (`DATABASE_URL` = Neon's pooled `worldlens_app` string, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`, `BREVO_API_KEY`, `MAIL_FROM`, `PAYPAL_CLIENT_ID`/`SECRET`); `nano /srv/worldlens/apps/web/.env.production.local` for `VITE_MAPTILER_API_KEY`.
8. **Start:** `bash /srv/worldlens/deploy/oracle/update.sh` (builds the site, starts the API, Caddy and the news timer; Caddy gets the HTTPS certificate). Open `https://worldlens.duckdns.org`.
9. **Outside services:** Google OAuth client — redirect URI `https://worldlens.duckdns.org/api/auth/callback/google` and JavaScript origin `https://worldlens.duckdns.org`; MapTiler — the same origin.
10. **Updates:** commit and push on your Mac, then on the server `bash /srv/worldlens/deploy/oracle/update.sh`.

Checks: `sudo systemctl status worldlens-api`, `sudo journalctl -u worldlens-api -f`, `systemctl list-timers worldlens-ingest.timer`, `curl https://worldlens.duckdns.org/api/health`. After a week, the instance's metrics in the Oracle console should show memory use above 20%.

## Paid: one Cloudflare Worker

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
