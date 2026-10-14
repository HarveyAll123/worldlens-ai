# Architecture

WorldLens is a small TypeScript monorepo: a static web app, one Cloudflare Worker API, and a shared package. No always-on servers, no microservices.

```
                 ┌──────────────────────────── Browser ────────────────────────────┐
                 │ React UI (panels, navigator, assistant, Take Action)            │
                 │   │ Zustand store (time, mode, selection, layers, quality)      │
                 │   ▼ imperative subscriptions (no per-frame React work)          │
                 │ GlobeController ── CesiumJS Viewer (requestRenderMode)          │
                 │   ├─ EventLayer   PointPrimitive/LabelCollection + clustering   │
                 │   ├─ Borders/Highlight/Frontline layers (Polyline/Primitive)    │
                 │   └─ PerformanceManager (adaptive quality)                      │
                 │ PayPal JS SDK v6 (sandbox) ── <paypal-button>                   │
                 └───────────────┬───────────────────────────────┬────────────────┘
                     /api/* JSON │                               │ tiles
                                 ▼                               ▼
   ┌──────────────── Cloudflare Worker (Hono + Zod) ────────────────┐   MapTiler (imagery/terrain)
   │ routes: events, search, geo, history, ai, payments, webhook    │   or bundled Natural Earth II
   │ EventRepository: Memory (curated + DEMO + live cache)          │
   │                  └─ PostgresNewsRepository (if DATABASE_URL)   │
   │ Providers: GDELT · Wikipedia/Commons · historical-basemaps     │
   │ Pipeline: normalise→dedupe→entities→locate→cluster→events      │
   │ AI: agent loop (Anthropic Messages API) + offline assistant    │
   │ Payments: PayPal REST (Orders v2, webhook verify) + state store│
   │           └─ PostgresPaymentStore (if DATABASE_URL) or memory  │
   │ SqlClient: Neon HTTP driver (@neondatabase/serverless)         │
   │ cron (*/30): news ingestion                                    │
   └───────────────┬───────────────────────────┬────────────────────┘
                   │ HTTPS, parameterised SQL  │
                   ▼                           ▼
      Neon PostgreSQL + PostGIS          R2 (optional cache of simplified borders)
      (optional; role worldlens_app)
```

## Packages

- **`packages/shared`** — single source of truth used by browser and Worker:
  - `temporal.ts`: epoch-ms times, astronomical years, precision metadata, navigator limits (`TEMPORAL_CONFIG.minNavigableYear = 1800`, configurable — nothing else assumes 1800).
  - `schemas.ts`: Zod schemas for events, articles, sources/ratings (rating provenance enforced), geometry, frontlines, action options, payments, search, framing.
  - `tools.ts`: the AI tool registry (server data tools + client globe tools), JSON-Schema export, and `parseClientAction` for validation.
  - `data/`: curated historical events, conflicts, relations, publisher registry, DEMO scenarios, sandbox action options, frontline records, Natural Earth gazetteer.
- **`apps/api`** — Hono app (`src/app.ts`) with a dependency container (`src/deps.ts`); `src/index.ts` is the Worker entry (fetch + scheduled), `src/node-server.ts` runs the same app on Node for development and e2e. `src/data/` holds the repositories and the `SqlClient` drivers (see [Persistence](#persistence)).
- **`apps/web`** — Vite + React 19; Cesium is created once by `GlobeController` and driven via store subscriptions.

## Key flows

### Viewing events

`useVisibleEvents` requests `/api/events` keyed by mode, calendar period at the current resolution, camera bbox (only when zoomed in below ~4,000 km) and layers, with a tier-dependent limit. The repository filters by temporal intersection (`temporalSpan` honours precision), importance-based level of detail (century ≥4, decade ≥3), viewport and demo flag. The browser never downloads the full 1800–today dataset.

### News ingestion

`refreshLiveNews` (cron every 30 min, or lazily on LIVE requests via `waitUntil`) queries GDELT DOC 2.0, then runs the deterministic pipeline (`apps/api/src/pipeline`). Clustering combines TF-IDF cosine, headline shingles, weighted entity overlap, geographic and temporal distance and category affinity, with hard blocks (distinct places >150 km apart, >72 h apart, incompatible categories). Optional cheap-tier AI summaries are added for the most-covered clusters. Results go to memory and, if `DATABASE_URL` is set, to Neon in one transaction, followed by an `ingestion_runs` record.

### AI assistant

`POST /api/ai/chat` → `runAgent`: a bounded manual tool loop over the Messages API (`claude-opus-5-5` by default, adaptive thinking, `effort: medium`, server-side refusal fallbacks, automatic prompt caching of the stable tools+system prefix). Each tool call is Zod-validated; server tools read data; globe tools are validated/resolved (place names → coordinates, pre-1800 rejected) and returned as `actions`. The browser re-validates every action (`actionExecutor.ts`) and plays multi-date answers as a pausable tour. If AI is unconfigured, over budget, rate-limited or failing, `runOfflineAssistant` handles the same intents deterministically with the same tools.

### Take Action (UNDERSTAND → VERIFY → ACT)

1. Event card or AI `open_take_action` opens the **review screen** (recipient, amount, currency, purpose, SANDBOX status, informational links).
2. User ticks the sandbox acknowledgement → the v6 SDK loads (`createInstance` → `findEligibleMethods` → `createPayPalOneTimePaymentSession`).
3. User clicks PayPal's `<paypal-button>` → `session.start({presentationMode:'auto'}, createOrderPromise)`; the Worker validates the reviewed terms and creates the order (Orders v2, `PayPal-Request-Id`).
4. `onApprove` → Worker captures (`PayPal-Request-Id`), checks amount/currency, stores state. The receipt shows only what the server got from PayPal. Verified webhooks reconcile later; a state machine prevents downgrades.

The AI has no code path to steps 3–4.

## Persistence

Optional. Without `DATABASE_URL` the API keeps ingested live news and payments in isolate memory. Curated history and DEMO scenarios ship with the code and are served from memory either way; the database stores ingested live news, ingestion runs and payment state.

```
caller                       SqlClient implementation      transport   database
Worker                    ─▶ neonHttpClient (Neon driver)  ─ HTTPS ──▶ Neon PostgreSQL + PostGIS
pnpm dev:node, Neon URL   ─▶ neonHttpClient (Neon driver)  ─ HTTPS ──▶ Neon PostgreSQL + PostGIS
pnpm dev:node, localhost  ─▶ nodePostgresClient (pg)       ─ TCP ────▶ local PostgreSQL + PostGIS
pnpm test:db              ─▶ nodePostgresClient (pg)       ─ TCP ────▶ throwaway local PostgreSQL + PostGIS
```

- `createDeps` builds one `SqlClient` (`src/data/sql.ts`: `query(text, params)` and `transaction(queries)`, all or nothing) and passes it to `PostgresNewsRepository`, which wraps the memory repository and adds stored live news, and `PostgresPaymentStore` (`src/data/postgres.ts`).
- In the Worker the client is the Neon serverless driver in HTTP mode: `neon(url)` with `sql.query` and `sql.transaction`, one HTTPS fetch per query or per non-interactive transaction, so there is no connection to keep alive. Timeout 8 s per query, 16 s per transaction (`AbortSignal.timeout`). WebSocket `Pool`/`Client` and Hyperdrive are not used. `DATABASE_URL` is Neon's pooled connection string for the role `worldlens_app`.
- The Node dev server uses node-postgres (`src/data/sql-node.ts`) only when `DATABASE_URL` points at `localhost`, `127.0.0.1` or `::1` (`isLocalDatabaseUrl`); any other URL uses the Neon HTTP driver. `sql-node.ts` is imported by the dev server and tests only, never bundled into the Worker. Playwright e2e sets `DATABASE_URL=''`, so it never touches a database.
- All SQL is parameterised; only fixed column lists and names from constants are interpolated. Event reads call the query functions `events_in_window` and `event_by_id`. An ingestion writes `news_sources`, `events`, `articles` and `event_articles` as four upserts in one transaction, each passing its rows as one JSON parameter expanded with `jsonb_to_recordset`. Webhook idempotency: `insert into paypal_webhook_events … on conflict (event_id) do nothing returning event_id`.
- Repository calls report to the provider-health key `database`. `GET /api/health` lists it under `providers`, next to `repository` (`neon+memory`, `postgres+memory` with node-postgres, or `memory`).

Schema, migrations (`db/`) and access control: [DATA_MODEL.md](DATA_MODEL.md).

## Failure isolation

| Failure             | Behaviour                                                                    |
| ------------------- | ---------------------------------------------------------------------------- |
| AI provider         | offline assistant answers; notice explains why                               |
| GDELT               | previous live cache or labelled DEMO events; provider status `degraded/down` |
| Wikipedia           | curated summary + notice; stale cache if available                           |
| historical-basemaps | “border dataset unreachable” (no fake borders)                               |
| MapTiler            | bundled Natural Earth II imagery, ellipsoid terrain, notice                  |
| PayPal              | explicit error; never a success state                                        |
| Database (Neon)     | reads fall back to memory, payments fail; `database` marked `degraded/down`  |
| Cesium/WebGL        | React error boundary keeps panels, list and timeline usable                  |

## Security

Secrets stay in the Worker (wrangler secrets / `.dev.vars`). CORS allow-list, security headers (CSP `default-src 'none'` on API responses, `X-Frame-Options: DENY`, `nosniff`, HSTS on https), token-bucket rate limits (reads, AI, payments), body-size limits, Zod validation of all inputs and provider responses, https-only URL validation, HTML/control-character stripping of provider metadata, no rendering of publisher HTML, `rel="noopener noreferrer"` on external links. Browsers never connect to the database; only the Worker does, with parameterised SQL, as the least-privilege role `worldlens_app` (explicit GRANTs in `db/grants.sql`, no RLS — see [DATA_MODEL.md](DATA_MODEL.md#access-control)).
