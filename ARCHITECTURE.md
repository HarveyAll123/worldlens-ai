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
   │ Pipeline: normalise→dedupe→locate→cluster→events→continuity    │
   │ AI: agent loop (Gemini/OpenAI-compatible/Anthropic) + offline  │
   │ Payments: PayPal REST (Orders v2, webhook verify) + state store│
   │           └─ PostgresPaymentStore (if DATABASE_URL) or memory  │
   │ SqlClient: Neon HTTP driver (@neondatabase/serverless)         │
   │ cron (*/15): GDELT + RSS in one ingestion                                    │
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

`refreshLiveNews` (cron every 30 min, or lazily on LIVE requests via `waitUntil`) reads GDELT's newest 15-minute GKG files (or the DOC 2.0 API with `GDELT_SOURCE=api`), then runs the deterministic pipeline (`apps/api/src/pipeline`). Clustering combines TF-IDF cosine, headline shingles, weighted entity overlap, geographic and temporal distance and category affinity, with hard blocks (distinct places >150 km apart, >72 h apart, incompatible categories). Each run re-clusters the whole window and names a cluster after its earliest article, which changes from run to run (the GKG window refills from the newest file after a restart — every run on Workers — and slides as time passes), so `pipeline/continuity.ts` matches the run's events to those already stored: a cluster holding at least half of an earlier event's articles that the run still sees, or carrying the same specific headline (5+ words) at the same place within 72 h, keeps that event's id, and the story's articles, sources and time span add up. Other earlier copies of the story are marked `provenance.mergedInto` (never deleted): listings skip them and lookups by their id return the event that carries the story. `pnpm db:merge-duplicates` merges the copies stored before this existed. Optional cheap-tier AI summaries are added for the most-covered clusters. Results go to memory and, if a database is configured, to Neon in one transaction (rows shaped to the table constraints and sorted by key, see [Persistence](#persistence)), followed by an `ingestion_runs` record.

### AI assistant

`POST /api/ai/chat` → `runAgent`: a bounded manual tool loop. With `GEMINI_API_KEY` the provider is Gemini through Google's OpenAI-compatible endpoint (`gemini-flash-lite-latest`, low thinking, model fallbacks on 503/429/timeouts, thought signatures echoed back; see PROVIDERS.md). In **Chat** mode (`context.agent: false`) only the data tools are offered and no actions are returned; **Agent** mode adds the app tools: the globe (fly_to, zoom, pan, set_time, play_timeline, highlight_region, show_events, open_event, open_country, toggle_layer), the settings (`set_display`: graphics quality, night, city lights, diagnostics; `set_ai_settings`: the account's AI settings when asked, and Chat mode) and the panels (`open_panel`). Account settings are only opened and scrolled to a section (`open_panel` account + section, marked for a moment): no tool types, submits, confirms or deletes anything there, guests get the sign-in window instead, and the prompt (`ai/prompts.ts`, an app guide plus these limits) has the assistant tutor the user and decline when pushed. The assistant searches the news of the past too (`search_events` with `includePast`: Wikipedia's own search finds the Current events days that mention it, 2000–2002 come from the year articles; `list_events` lists a day, month, year or decade). The search bar shows them as their own group, "News since 2000", from `GET /api/search/past` (`repo.searchPast`, rate-limited, cached 10 minutes in the browser), requested once typing pauses so the instant results never wait for Wikipedia; a pick moves the timeline to that day. The bar's list is a portal on the page (glass nested in the bar's glass could not blur the globe). Past news runs up to a day ago (`PAST_NEWS_LAG_MS`, GDELT's 24-hour file window): stored live news has gaps for any day ingestion was not running, so Wikipedia covers every day before that.

Place names (`globe/PlaceLabelLayer.ts`, rules in `globe/placeNames.ts`) are Natural Earth's cities, seas, lakes, rivers, ranges, peaks and deserts (`apps/web/public/data/places/names.json`, `pnpm data:places`), each shown from its label zoom level. They are placed when the camera settles, after the event titles (`EventLayer.onRelabel`), greedily by importance and only where they overlap nothing already on screen — event markers and titles, country names, marked places, panels (`data-label-occluder`) — within a budget for the screen; they stay fixed to their place as the view moves (clamped to the terrain when 3D terrain is on) and are hidden behind the globe every frame. `window.__worldlens.labelCheck()` reports any overlap (the e2e suite expects none). The assistant's `highlight_place` is resolved on the server against the same list (`providers/place-names.ts`, so it cannot claim to mark a place that is not there) and drawn by `PlaceMarkLayer` from `shapes.json`: rivers traced, areas outlined, cities and peaks ringed, lines draped on terrain when close; several marks stay at once (pills under the top bar). A clicked cluster lists its events (`PlacePicker`), with Zoom in.

The event card's Coverage perspectives lists who reported a story: each outlet with its type, owner and where it is based. `/api/events/:id/sources` returns `places` per publisher (`data/publishers.ts`): from the registry; else Wikidata (headquarters, else country), the feed's reported country or GDELT's list of news outlets by country (2018), served as 64 hash-split files from the web app (`publisherShard`, `PublisherDirectory` reads only the file a domain is in and keeps it). The same directory names and describes outlets outside the registry from Wikidata (`describePublishers`: name, kind, owner) and rates them only from Wikidata's "political alignment" statements that are spectrum positions and agree — low confidence, medium with a cited source, linked to the item. A country chip outlines the country and flies there. Each reply shows what the assistant did as chips under it (`components/AiActions.tsx`); a chip does it again. With Anthropic it runs over the Messages API (`claude-opus-5-5` by default, adaptive thinking, `effort: medium`, server-side refusal fallbacks, automatic prompt caching of the stable tools+system prefix). Each tool call is Zod-validated; server tools read data; globe tools are validated/resolved (place names → coordinates, pre-1800 rejected) and returned as `actions`. The browser re-validates every action (`actionExecutor.ts`) and plays multi-date answers as a pausable tour. If AI is unconfigured, over budget, rate-limited or failing, `runOfflineAssistant` handles the same intents deterministically with the same tools.

### Take Action (UNDERSTAND → VERIFY → ACT)

1. Event card or AI `open_take_action` opens the **review screen** (recipient, amount, currency, purpose, SANDBOX status, informational links).
2. User ticks the sandbox acknowledgement → the v6 SDK loads (`createInstance` → `findEligibleMethods` → `createPayPalOneTimePaymentSession`).
3. User clicks PayPal's `<paypal-button>` → `session.start({presentationMode:'auto'}, createOrderPromise)`; the Worker validates the reviewed terms and creates the order (Orders v2, `PayPal-Request-Id`).
4. `onApprove` → Worker captures (`PayPal-Request-Id`), checks amount/currency, stores state. The receipt shows only what the server got from PayPal. Verified webhooks reconcile later; a state machine prevents downgrades, and compare-and-set updates keep a decision made on a stale read (e.g. an approval webhook racing the capture) from overwriting a newer state.

The AI has no code path to steps 3–4.

**News of the past.** From 2000 up to the live window, the timeline also shows news from Wikipedia (`providers/wikipedia-news.ts`, wrapped around the repository by `data/past-news.ts`): a day's or month's Current events portal pages (one MediaWiki request per 50 days), and year articles for whole years and for days before the portal's daily pages. Items are placed with the live-news locating (the first place a sentence names), cached (a week; recent days hourly) and opened by id (`wnews-<date>-<hash>`). Before 2000 the timeline is history only. `PAST_NEWS_ENABLED=false` turns it off (e2e does).

## Accounts

Sign-in is self-hosted [Better Auth](https://better-auth.com) 1.7 in the API (`src/auth/auth.ts`, mounted at `/api/auth/*`): email or username with a password, or Google. A new email account confirms a 6-digit code (Better Auth's email-OTP plugin, which also resets forgotten passwords and confirms a new email before it replaces the old one), then gives a first name, an optional last name and a unique username (`/api/me/profile`). `src/auth/account-routes.ts` adds `/api/me/*`: the profile, username changes (unique, at most once a month — Better Auth's own `update-user` refuses them), setting a first password on a Google account, and the account's AI chats and viewing history (`src/data/account-store.ts`). Password and username rules live in `packages/shared/src/account.ts` so forms and API agree. Tables: `users`, `accounts`, `sessions`, `verifications`, `user_chats`, `user_history` (snake_case columns mapped in `auth.ts`). Node uses one `pg` pool; the Worker opens a Neon pool per request; without a database, accounts live in memory. Codes are sent by `src/lib/mailer.ts` (Brevo, or the console in development). History keeps an account's searches (with the result chosen) and the events and countries it opened; an entry reopens what it showed. AI settings (`ai_memory`, `ai_reads_history`) decide what `src/ai/personal.ts` gives the assistant with each message — the latest activity (and the `get_my_activity` tool) and what was asked in earlier chats — and what the "For you" shortcuts (`personalPrompts`) are built from. A new email waits for its code (Better Auth stores it as a `change-email-otp-…` verification) and can be cancelled until then. On the web, `state/account.ts` holds who is signed in and the dialogs, `lib/accountSync.ts` loads and saves an account's chats and records what the user searches and opens; guests' chats stay in memory and leave with them.

## Persistence

Optional. Without a usable `DATABASE_URL` the API keeps ingested live news and payments in isolate memory. Curated history and DEMO scenarios ship with the code and are served from memory either way; the database stores ingested live news, ingestion runs and payment state.

```
caller                         SqlClient implementation      transport   database
Worker, *.neon.tech         ─▶ neonHttpClient (Neon driver)  ─ HTTPS ──▶ Neon PostgreSQL + PostGIS
Worker, any other URL       ─▶ none: database disabled, "database" down, repository "memory"
pnpm dev:node, *.neon.tech  ─▶ neonHttpClient (Neon driver)  ─ HTTPS ──▶ Neon PostgreSQL + PostGIS
pnpm dev:node, other URL    ─▶ nodePostgresClient (pg)       ─ TCP ────▶ any PostgreSQL + PostGIS (local or remote)
pnpm test:db                ─▶ nodePostgresClient (pg)       ─ TCP ────▶ throwaway local PostgreSQL + PostGIS
```

- `DATABASE_URL` is checked up front by `classifyDatabaseUrl` (`src/data/sql.ts`), which never echoes it: surrounding quotes are tolerated and the URL must be `postgresql://` or `postgres://`. The Worker accepts only Neon hosts (`*.neon.tech`), because the Neon driver derives an HTTPS endpoint from the host name and sends the connection string to it. Any other host, or an unparseable value, disables the database: `GET /api/health` shows a fixed, non-secret message as the `database` provider's `lastError` (state `down`; `repository` stays `memory`), and a warning is logged at startup.
- `createDeps` builds one `SqlClient` (`src/data/sql.ts`: `query(text, params)` and `transaction(queries)`, all or nothing) and passes it to `PostgresNewsRepository`, which wraps the memory repository and adds stored live news, and `PostgresPaymentStore` (`src/data/postgres.ts`).
- In the Worker the client is the Neon serverless driver in HTTP mode: `neon(url)` with `sql.query` and `sql.transaction`, one HTTPS fetch per query or per non-interactive transaction, so there is no connection to keep alive. Timeout 8 s per query, 16 s per transaction (`AbortSignal.timeout`). WebSocket `Pool`/`Client` and Hyperdrive are not used. `DATABASE_URL` is Neon's pooled connection string for the role `worldlens_app`.
- The Node dev server (`pnpm dev:node`) uses the Neon HTTP driver for `*.neon.tech` and node-postgres (`src/data/sql-node.ts`) for any other PostgreSQL URL, local or remote. `sql-node.ts` is imported by the dev server and tests only, never bundled into the Worker. Playwright e2e sets `DATABASE_URL=''`, so it never touches a database, and never reuses a running API (`reuseExistingServer: false`): stop `pnpm dev` / `pnpm dev:node` (port 8787) before `pnpm test:e2e`.
- All SQL is parameterised; only fixed column lists and names from constants are interpolated. Event reads call the query functions `events_in_window` and `event_by_id`. An ingestion writes `news_sources`, `events`, `articles` and `event_articles` as four upserts in one transaction, each passing its rows as one JSON parameter expanded with `jsonb_to_recordset`. Rows are shaped to the table constraints first (`https://` image URLs only, snippets capped at 600 characters, articles without an `https://` URL skipped with their links, lone UTF-16 surrogates replaced by U+FFFD), so one odd article cannot roll back the batch, and sorted by key, so concurrent ingestions lock rows in the same order and cannot deadlock.
- Reads (events, event by id, articles, sources, payment `get`/`getByOrderId`) are retried once with the Neon driver after a connection-level failure (an error without SQLSTATE, e.g. network or compute waking up); SQL errors, timeouts (the query may still be running) and writes are never retried. node-postgres does not retry: `pg.Pool` replaces broken connections itself.
- Payments: `PaymentStore.update(id, patch, { expectState })` is compare-and-set (`… where id = $1 and state = <expected>`), so a decision made on a stale read cannot overwrite a newer state written concurrently; the service re-reads and re-decides (up to 3 attempts). The store accepts only the PayPal-derived fields (`paypalOrderId`, `state`, `captureId`, `paypalStatus`, `lastError`, `updatedAt`). Webhook idempotency: `claimWebhook` inserts the receipt into `paypal_webhook_events` and `completeWebhook` sets its `processed_at` after processing. A delivery is a duplicate only if the same event id was processed to completion; if processing throws, the receipt stays unprocessed and PayPal's retry is handled again. Transient failures while adopting an unknown order surface as HTTP 5xx (PayPal retries); `FOREIGN_ORDER`/`UNKNOWN_ORDER` are `ignored`.
- Repository calls report to the provider-health key `database`. `GET /api/health` lists it under `providers`, next to `repository` (`neon+memory`, `postgres+memory` with node-postgres, or `memory`). A database error is stored there either as PostgreSQL's own message plus `(SQLSTATE xxxxx)` or as the fixed text “could not reach the database (connection or configuration error)”, because driver messages for connection errors can contain the connection string. Provider health and the unhandled-error log also redact credential-bearing URLs (`src/lib/redact.ts`).

Schema, migrations (`db/`) and access control: [DATA_MODEL.md](DATA_MODEL.md).

## Failure isolation

| Failure                                    | Behaviour                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| AI provider                                | offline assistant answers; notice explains why                               |
| GDELT                                      | previous live cache or labelled DEMO events; provider status `degraded/down` |
| Wikipedia                                  | curated summary + notice; stale cache if available                           |
| historical-basemaps                        | “border dataset unreachable” (no fake borders)                               |
| MapTiler                                   | bundled Natural Earth II imagery, ellipsoid terrain, notice                  |
| PayPal                                     | explicit error; never a success state                                        |
| Database (Neon)                            | reads fall back to memory, payments fail; `database` marked `degraded/down`  |
| `DATABASE_URL` invalid / not Neon (Worker) | database disabled, memory only; fixed message, `database` `down`             |
| Webhook processing                         | lease released, receipt unprocessed; 5xx/409 so PayPal retries               |
| Cesium/WebGL                               | React error boundary keeps panels, list and timeline usable                  |

## Security

Secrets stay in the Worker (wrangler secrets / `.dev.vars`). CORS allow-list, security headers (CSP `default-src 'none'` on API responses, `X-Frame-Options: DENY`, `nosniff`, HSTS on https), token-bucket rate limits (reads, AI, payments), body-size limits, Zod validation of all inputs and provider responses, https-only URL validation, HTML/control-character stripping of provider metadata, no rendering of publisher HTML, `rel="noopener noreferrer"` on external links. Browsers never connect to the database; only the Worker does, with parameterised SQL, as the least-privilege role `worldlens_app` (explicit GRANTs in `db/grants.sql`, no `delete`, column-level payment updates, raw webhook payloads unreadable, no RLS — see [DATA_MODEL.md](DATA_MODEL.md#access-control)). The connection string is never echoed: invalid or non-Neon URLs get a fixed message, database errors in `/api/health` are PostgreSQL messages or a fixed text, and provider health and the unhandled-error log redact credential-bearing URLs. `.dev.vars*` (except `.dev.vars.example`) is git-ignored.
