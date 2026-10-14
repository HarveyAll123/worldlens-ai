# Deployment

Target: **Cloudflare Pages** (static web app) + **Cloudflare Worker** (API) + **Supabase** (database). Everything fits free/low tiers for a hackathon.

## 1. API (Worker)

```bash
cd apps/api
npx wrangler login
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID
npx wrangler secret put ANTHROPIC_API_KEY          # optional
npx wrangler secret put SUPABASE_URL               # optional
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY  # optional
npx wrangler secret put INGEST_TOKEN
# edit [vars] in wrangler.toml: ALLOWED_ORIGINS, PUBLIC_APP_URL
npx wrangler deploy
```

Smoke test: `curl https://<worker>/api/health`. The dry-run bundle is ~2.0 MB raw / ~390 KB gzip.

Manual ingestion: `curl -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://<worker>/api/ingest/run`.

## 2. Web (Pages)

```bash
cd apps/web
VITE_API_BASE_URL=https://<worker-host> VITE_MAPTILER_API_KEY=<key> pnpm build   # copies Cesium assets, type-checks, builds dist/
npx wrangler pages deploy dist --project-name worldlens
```

Or connect the GitHub repo in the Pages dashboard: build command `pnpm --filter @worldlens/web build`, output `apps/web/dist`, environment variables `VITE_API_BASE_URL`, `VITE_MAPTILER_API_KEY`.

Alternatively serve the API under the same origin with a Worker route (`example.com/api/*`) and leave `VITE_API_BASE_URL` empty.

## 3. Database

Apply `supabase/migrations/*.sql` (see MANUAL_SETUP.md). Without Supabase the API runs from memory; payments then live in isolate memory — acceptable for a demo because capture can re-derive the record from PayPal (`custom_id`), but use Supabase for anything persistent.

## 4. After deploying

- Update `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, MapTiler allowed origins, PayPal webhook URL.
- Add WAF rate limits for `/api/ai/*`, `/api/payments/*`.
- Run through the HACKATHON.md checklist with real sandbox credentials.

## CI suggestion

`pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e`. The e2e suite starts its own servers and uses PayPal **test doubles** (`WORLDLENS_TEST_PAYPAL_MOCK=1` on the Node dev server only — never in the Worker).
