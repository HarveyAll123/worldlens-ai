# WorldLens

**A temporal world-intelligence globe.** What happened, where, when, what led to it, how it is being reported — and what you can do next.

WorldLens puts a realistic 3D Earth (CesiumJS) at the centre and lets you move through time from **1800 to LIVE**. Current events are clusters of articles (not one marker per article), historical events link to Wikipedia, borders are dated geometry with explicit certainty, and an AI assistant can _operate the globe_ through a strictly validated tool layer. Humanitarian events can expose a **Take Action** flow powered by the **PayPal JavaScript SDK v6 (sandbox)** with mandatory human review and server-verified confirmation.

> Built for the PayPal AI Hackathon 2026. Everything payment-related runs in the **PayPal SANDBOX — no real money moves**.

## What you can do

- Rotate/zoom a 3D Earth; click events or clusters; use the text **Events** list (keyboard/screen-reader route).
- Drag the **temporal navigator** from 1800 to now (century → hour, limited to the precision the data supports). _Before 1800 — Coming Soon._
- **LIVE** mode with a real UTC clock; **HISTORICAL MODE** shows the selected timestamp; **Return to Live** everywhere.
- Open an event: summary, why it matters, participants, **source coverage**, **coverage perspectives** (national perspective, publisher type, political orientation — publishers only, mostly `UNRATED`), **how sources frame this event** (fact / claim / allegation / assessment), and **Historical context · Then ↔ Now**.
- Search places, events, people, conflicts and dates: “Berlin 1945”, “Waterloo”, “Indonesia 1965”, “South China Sea”, “Ukraine”, “Napoleonic Wars”.
- Turn on **Borders** to see dated snapshots (historical-basemaps, approximate) or modern Natural Earth boundaries — never silently extrapolated.
- Ask the AI: “What is happening near Taiwan?”, “Show me Germany's territorial changes between 1933 and 1945”, “Why does this matter historically?”, “I have $20. How can I help?”.
- Take Action on humanitarian (demo) events → review → **you** approve in PayPal → receipt based on PayPal's capture response.

## Quick start

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
pnpm dev:node        # API on :8787 (Node) + web on :5173  — no keys needed
# or: pnpm dev       # API via `wrangler dev` (workerd) + web
```

Open http://127.0.0.1:5173. With no keys you get: bundled Natural Earth II imagery, curated history, clearly labelled **DEMO** current events, the rule-based offline assistant, and a Take Action screen that explains PayPal is not configured.

Add keys (see [MANUAL_SETUP.md](MANUAL_SETUP.md)):

| Feature                      | Where                 | Variables                                                                                                                                                 |
| ---------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Satellite imagery + terrain  | `apps/web/.env.local` | `VITE_MAPTILER_API_KEY`                                                                                                                                   |
| PayPal sandbox payments      | `apps/api/.dev.vars`  | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`                                                                                           |
| AI assistant                 | `apps/api/.dev.vars`  | `ANTHROPIC_API_KEY`, or `OPENCODE_API_KEY` + `AI_PROVIDER=openai` (any OpenAI-compatible gateway; see MANUAL_SETUP.md)                                    |
| Persistence (Neon + PostGIS) | `apps/api/.dev.vars`  | `DATABASE_URL` (a `*.neon.tech` URL; `pnpm dev:node` also takes any PostgreSQL + PostGIS URL); schema via `pnpm db:migrate` with `MIGRATION_DATABASE_URL` |

Optional offline border data for development: `pnpm data:fetch-basemaps` then set `HISTORICAL_BASEMAPS_BASE_URL=http://127.0.0.1:5173/vendor/historical-basemaps/`.

## Scripts

| Command                           | What it does                                                                                                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                       | Vitest unit/integration tests (shared, api, web)                                                                                                                                                                                                               |
| `pnpm test:e2e`                   | Playwright end-to-end (starts its own API with PayPal **test doubles** + web; never reuses a running API, so stop `pnpm dev` / `pnpm dev:node` to free port 8787 first)                                                                                        |
| `pnpm db:migrate`                 | Applies `db/migrations` and `db/grants.sql` to the database in `MIGRATION_DATABASE_URL` only (owner role, direct connection; best kept in `apps/api/.dev.vars`) — never `DATABASE_URL`                                                                         |
| `pnpm test:db`                    | Applies migrations (twice; the second run must apply nothing) to a throwaway local PostGIS, runs smoke SQL, then the repository integration tests as the restricted `worldlens_app` role (Debian/Ubuntu, or `pg_ctl` on `PATH` / `PGBIN`; see MANUAL_SETUP.md) |
| `pnpm typecheck`                  | Strict TypeScript in every package                                                                                                                                                                                                                             |
| `pnpm lint` / `pnpm format:check` | ESLint / Prettier                                                                                                                                                                                                                                              |
| `pnpm data:build`                 | Rebuilds the Natural Earth gazetteer and outlines                                                                                                                                                                                                              |

## Repository layout

```
apps/web        React + Vite + CesiumJS + Tailwind + Zustand + TanStack Query
apps/api        Cloudflare Worker (Hono + Zod); Node server for dev/e2e
packages/shared Temporal model, Zod schemas, AI tool registry, curated data, gazetteer
db/             PostgreSQL + PostGIS (Neon) migrations, grants and smoke tests
e2e/            Playwright specs (app flows, responsive, performance)
scripts/        Geodata build, basemap fetch, migration runner and test
```

## Documentation

[ARCHITECTURE](ARCHITECTURE.md) · [DATA_MODEL](DATA_MODEL.md) · [PERFORMANCE](PERFORMANCE.md) · [PROVIDERS](PROVIDERS.md) · [MANUAL_SETUP](MANUAL_SETUP.md) · [DEPLOYMENT](DEPLOYMENT.md) · [CONTENT_LICENSING](CONTENT_LICENSING.md) · [HACKATHON](HACKATHON.md)

## Honesty rules the code enforces

- Demo current events are synthetic, titled `DEMO:`, use fictional outlets and `.invalid` URLs.
- Political ratings are `UNRATED` unless a rating with methodology, source, confidence and review date exists (enforced by Zod and a database CHECK constraint).
- Borders/frontlines come only from dated, cited geometry; otherwise the UI says data is unavailable.
- The AI cannot pay. No tool creates, approves or captures payments; success is shown only from PayPal's server-side response.

## License

[MIT](LICENSE) for the code. Data and media have their own licences — see [CONTENT_LICENSING.md](CONTENT_LICENSING.md).
