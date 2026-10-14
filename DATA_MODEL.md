# Data model

Runtime shapes are defined once in `packages/shared/src/schemas.ts` (Zod). The PostgreSQL + PostGIS schema lives in `db/migrations/` (hosted on Neon, see [Migrations](#migrations)) and is smoke-tested by `pnpm test:db` against a local PostGIS. The database is optional: it stores ingested live news, ingestion runs and payment state, while curated history and DEMO scenarios ship with the code and are served from memory.

## Time

Times are epoch milliseconds (UTC) in code and `timestamptz` in Postgres. Every temporal record carries precision metadata:

```ts
Temporal = { start: ISO, end?: ISO, precision: 'century'|'decade'|'year'|'month'|'day'|'hour'|'minute', approximate: boolean, label?: string }
```

| Concept in the brief      | Representation                  |
| ------------------------- | ------------------------------- |
| year / month / day / hour | `precision`                     |
| unknown-day               | `precision: 'month'`            |
| approximate               | `approximate: true` (“c. 1880”) |
| range                     | `end` present                   |

`precisionLabel()` maps these to the database `date_precision`/label vocabulary. The UI never shows more precision than stored (`formatTemporal`). The navigator floor is `TEMPORAL_CONFIG.minNavigableYear` (1800); years are astronomical, so earlier eras need no schema change (Postgres stores BC dates; `toPgTimestamp` converts).

## Events (the fundamental object)

An **event** is the globe marker. News events aggregate many articles; historical events are curated.

`events`: id, kind (`news|historical`), is_demo, title, summary, why_it_matters, category, tags, time_start/time_end/date_precision/date_approximate, importance (1–5, LOD), confidence (clustering × location), conflict_id, counts, wikipedia_title, location (name, precision, confidence, country_code, `geography(Point)`), participants (jsonb), image (jsonb), provenance (jsonb), generated `period tstzrange`. GiST on `geom` and `period`.

Related tables: `event_locations`, `event_geometries`, `event_relations`, `articles`, `event_articles`, `media_assets`, `citations`.

Ingestion writes `news_sources`, `events` and `articles` as upserts by id (`on conflict (id) do update`) and `event_articles` with `on conflict do nothing`, so re-ingesting a story updates its rows. The four statements run in one transaction, each passing its rows as one JSON parameter expanded with `jsonb_to_recordset`.

### Knowledge graph (`event_relations`)

`from_id TYPE to_id` with `confidence`, `source`, `notes`. Types: `PRECEDED_BY, LED_TO, PART_OF, RELATED_TO, RESPONSE_TO, ESCALATION_OF, TERRITORIAL_CHANGE, PEACE_AGREEMENT`. Only `LED_TO` asserts causation and is used sparingly; the UI and AI say “relevant context, not proven causation”.

## Sources and perspectives

`news_sources`: publisher, domain, country, `source_type` (wire agency, public broadcaster, state media, commercial, nonprofit, reader-funded, …), ownership, national perspective.

`source_profiles`: political-orientation **of publishers only** — `LEFT … RIGHT, MIXED, UNRATED` with methodology, rating source/URL, confidence, last reviewed, illustrative flag. A CHECK constraint (and the Zod schema) rejects any non-`UNRATED` value without full provenance. All real publishers ship `UNRATED`; only fictional DEMO outlets carry ratings, marked `illustrative`. To add real ratings, import a dataset with a documented methodology into `source_profiles`.

`articles` store headline, canonical https URL, publication time, language, source country, an optional ≤600-char snippet and image URL — never full text.

## Historical geography

`historical_entities` (kingdom, empire, republic, colony, protectorate, occupation zone, disputed region, control zone, …) and `historical_geometries`: MultiPolygon, `valid_from`/`valid_to`, `date_precision` (incl. `snapshot`), `geometry_precision` (`world-scale|regional|survey-grade`), `certainty` (`CERTAIN|APPROXIMATE|DISPUTED|RECONSTRUCTED`), status, disputed, source, license, citation; generated `validity` range with GiST.

`geometries_at(at, tolerance, bbox)` returns only geometry **valid at that instant** — no extrapolation.

Runtime source today: historical-basemaps snapshots fetched from a pinned commit (not vendored, GPL-3.0) and Natural Earth modern boundaries (public domain). Selection (`selectBorderSnapshot`): exact or nearest snapshot within ±5 years with the gap reported, Natural Earth from 2011, otherwise `available: false` with a reason. All historical-basemaps features are treated as `APPROXIMATE` (the dataset's own `BORDERPRECISION` is kept as a raw attribute).

## Conflicts, frontlines, control zones

`conflicts`; `frontlines` (MultiLineString, validity, certainty, side A/B, disputed, confidence, source, license); `control_zones` (MultiPolygon, controlled_by, validity, certainty). `frontlines_at(at, conflict)` again returns only valid records. Bundled record: the 38th-parallel division line (defined by latitude; endpoints approximate). Real frontlines of ongoing wars are **not** bundled — import them from a licensed, cited dataset.

## AI outputs

`ai_outputs`: cache key, purpose, model, input/output/cache-read tokens, cost, output, expiry. (The Worker currently caches per isolate and records usage in memory — see `/api/ai/usage`; the table is ready for persistence.)

## Payments

`payment_actions` (id `wl_…`, option, event, amount, currency, state, environment, PayPal order id (unique), capture id, PayPal status, last error) — the **server-side truth**. States: `REVIEW → CREATED → APPROVED → CAPTURED|PENDING|DECLINED|FAILED|CANCELLED → REFUNDED`, enforced by `canTransition()` so late/duplicate events cannot downgrade a capture. `payment_transactions` is the audit log. `paypal_webhook_events` (primary key = PayPal event id) gives webhook idempotency (`insert … on conflict (event_id) do nothing returning event_id`: a returned row means first delivery).

## Operations

`provider_health`, `ingestion_runs` (one row per ingestion: provider, start/finish, stage counts, errors), `schema_migrations` (created by the migration runner).

## Migrations

| File                                           | Contents                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `db/migrations/20261014000001_core_schema.sql` | `create extension if not exists postgis`, tables, CHECK constraints, GiST indexes                      |
| `db/migrations/20261014000002_functions.sql`   | query functions `events_in_window`, `event_by_id`, `geometries_at`, `frontlines_at`, `prune_live_news` |
| `db/grants.sql`                                | least-privilege grants for `worldlens_app` (see below)                                                 |
| `db/tests/smoke.sql`                           | SQL smoke checks, run by `pnpm test:db`                                                                |

`pnpm db:migrate` (`scripts/db-migrate.ts`) records applied files in `schema_migrations`, applies each new migration in its own transaction, then re-applies `db/grants.sql` on every run (so the role can be created after the first migration). It reads `MIGRATION_DATABASE_URL`, else `DATABASE_URL`, from the environment, then from `apps/api/.dev.vars`. Use the owner role (e.g. `neondb_owner`) over Neon's direct connection string (host without `-pooler`): the first migration enables PostGIS, which needs the owner. The runner warns on a `-pooler` host and prints only host and database name, never the connection string.

`pnpm test:db` creates a throwaway cluster from the locally installed PostgreSQL + PostGIS (PostgreSQL 16 + PostGIS 3 in the build environment) and the role `worldlens_app`, runs the real runner twice (the second run must apply nothing), runs `db/tests/smoke.sql`, then runs the repository integration tests (`apps/api/src/data/postgres.integration.test.ts`) connected as `worldlens_app`.

## Access control

Browsers never connect to the database; only the API Worker does, with `DATABASE_URL` (Neon pooled connection string) as the role `worldlens_app`. There is no RLS: Supabase's `anon`/`authenticated`/`service_role` roles do not exist on Neon, so the policies were replaced by explicit GRANTs in `db/grants.sql`:

| Objects                                                                            | `worldlens_app`                |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| content tables (sources, events, articles, geography, conflicts, media, citations) | select, insert, update, delete |
| `payment_actions`                                                                  | select, insert, update         |
| `payment_transactions`, `paypal_webhook_events`, `ingestion_runs`                  | select, insert                 |
| `ai_outputs`, `provider_health`                                                    | select, insert, update, delete |
| sequences                                                                          | usage                          |
| the query functions above, including `prune_live_news`                             | execute                        |

Create the role with SQL while connected as the owner — `create role worldlens_app with login password '<password>';` — not in the Neon console: roles created through the Neon Console, CLI or API inherit `neon_superuser` (e.g. `CREATEROLE`, `pg_write_all_data`), whereas SQL-created roles get only what is granted. Until the role exists, `db/grants.sql` skips with a notice. The smoke test asserts that `worldlens_app` cannot delete payments, rewrite webhook receipts, delete payment transactions, or create or drop tables.
