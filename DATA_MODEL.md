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

Ingestion writes `news_sources`, `events` and `articles` as upserts by id (`on conflict (id) do update`) and `event_articles` with `on conflict do nothing`, so re-ingesting a story updates its rows. The four statements run in one transaction, each passing its rows as one JSON parameter expanded with `jsonb_to_recordset`. Rows are first shaped to the table constraints, so one odd article cannot roll back the whole batch: `image_url` is kept only if it is `https://`, snippets are capped at 600 characters, a source country only as a two-letter code, articles without an `https://` URL are skipped together with their links, and lone UTF-16 surrogates (invalid in `jsonb`) are replaced by U+FFFD. Each row list is deduplicated and sorted by key, so concurrent ingestions lock rows in the same order and cannot deadlock each other.

### Knowledge graph (`event_relations`)

`from_id TYPE to_id` with `confidence`, `source`, `notes`. Types: `PRECEDED_BY, LED_TO, PART_OF, RELATED_TO, RESPONSE_TO, ESCALATION_OF, TERRITORIAL_CHANGE, PEACE_AGREEMENT`. Only `LED_TO` asserts causation and is used sparingly; the UI and AI say “relevant context, not proven causation”.

## Sources and perspectives

`news_sources`: publisher, domain, country, `source_type` (wire agency, public broadcaster, state media, commercial, nonprofit, reader-funded, …), ownership, national perspective. A publisher's identity is its `id`: `domain` has a plain index (`news_sources_domain_idx`) but is not unique, so a curated registry entry and an earlier automatic source (`src-auto-…`) may share a domain.

`source_profiles`: political-orientation **of publishers only** — `LEFT … RIGHT, MIXED, UNRATED` with methodology, rating source/URL, confidence, last reviewed, illustrative flag. A CHECK constraint (and the Zod schema) rejects any non-`UNRATED` value without full provenance. All real publishers ship `UNRATED`; only fictional DEMO outlets carry ratings, marked `illustrative`. To add real ratings, import a dataset with a documented methodology into `source_profiles`.

`articles` store headline, canonical https URL, publication time, language, source country, an optional ≤600-char snippet and image URL — never full text.

## Historical geography

`historical_entities` (kingdom, empire, republic, colony, protectorate, occupation zone, disputed region, control zone, …) and `historical_geometries`: MultiPolygon, `valid_from`/`valid_to`, `date_precision` (incl. `snapshot`), `geometry_precision` (`world-scale|regional|survey-grade`), `certainty` (`CERTAIN|APPROXIMATE|DISPUTED|RECONSTRUCTED`), status, disputed, source, license, citation; generated `validity` range with GiST.

`geometries_at(at, tolerance, bbox)` returns only geometry **valid at that instant** — no extrapolation.

Runtime source today: historical-basemaps snapshots fetched from a pinned commit (not vendored, GPL-3.0) and Natural Earth modern boundaries (public domain). Selection (`selectBorderSnapshot`): exact or nearest snapshot within ±5 years with the gap reported, Natural Earth from 2011, otherwise `available: false` with a reason. All historical-basemaps features are treated as `APPROXIMATE` (the dataset's own `BORDERPRECISION` is kept as a raw attribute).

## Conflicts, frontlines, control zones

`conflicts`; `frontlines` (MultiLineString, validity, certainty, side A/B, disputed, confidence, source, license); `control_zones` (MultiPolygon, controlled_by, validity, certainty). `frontlines_at(at, conflict)` again returns only valid records. Bundled records: the 38th-parallel division line (defined by latitude; endpoints approximate) and five present-day ceasefire / control lines from Natural Earth's "Line of control" class — Korea's Military Demarcation Line (from 27 July 1953), Kashmir's Line of Control (from 2 July 1972), the 1974 Israel–Syria line, the 1974 Cyprus ceasefire line and the Western Sahara berm — all APPROXIMATE (world-scale geometry). Real frontlines of ongoing wars are **not** bundled — import them from a licensed, cited dataset.

Dated borders in the web app come from OpenHistoricalMap (`apps/web/public/data/ohm/`), covering states (admin_level 2, tier 2) and occupation regimes and dependent territories mapped one level down (tier 3: the General Government, Reichskommissariats, the Protectorate of Bohemia and Moravia, the 1945–55 zones of Austria, French Indochina's protectorates …; ordinary subdivisions are excluded): `polities.json` lists each polity's name, start and end date, Wikidata id, label point, bbox and the (delta-encoded) indices of its boundary ways; `ways-coarse.json` and `ways-<tile>.json` (30° tiles) hold the way geometry at ~2 km and ~100 m. For a day `d`, the polities with `start ≤ d < end` are in force. A way referenced by two of them is drawn unless it lies at sea; a way bounding only one of them is drawn when it lies inland (the neighbour is missing from OHM or mapped its own copy — one copy is kept). Where each way lies (inland / near the coast / at sea) is precomputed in `ways-coarse.json` from a Natural Earth 1:10m land mask (`scripts/lib/land-mask.ts`); see `apps/web/src/globe/ohm.ts`. `pnpm data:audit-borders` reports, for every recorded change date since 1800, border ends that stop inland — on average 15 per date worldwide, down from 60 when only shared ways were drawn; the rest are mostly gaps in OHM itself. The audit also measures accuracy: today 97.7% of drawn border length lies within ~5 km of Natural Earth's 1:10m land boundaries (95.8% of those are drawn), and against the historical-basemaps world snapshots agreement at ~25 km is 92–97% for 1960–2010, 75–84% for 1914–1945 and 40–60% before 1900, where the two sources differ most. OHM relations without a Wikidata id get one at build time from their Wikipedia link, another version with the same name, or a Wikidata state with that English name; entries nobody can identify (no id, Wikipedia link or English name) are dropped. `flags.json` holds, per Wikidata id (including related states), the flags (Commons file, start, end, preferred) with their dates of use, description, capitals and English Wikipedia title. `succession.json` (`pnpm data:succession`) holds, per polity Wikidata id, the other ids that are the same country (P1269 facet of / P460 same as, when the item is a facet of exactly one polity — e.g. Weimar Republic, Nazi Germany and German Empire are facets of "German Reich") and the polities reachable forward / backward through up to three successions (P1365/P1366, P155/P156 between polities, P361 into an item not on the map, e.g. occupation zone → Trizone → West Germany), with their depth. A selected country follows the timeline (`followCountry` in `apps/web/src/globe/ohm.ts`): outside its selected borders' period it moves to the same country's borders of the day, else its nearest successor (forward) or predecessor (back), a country of the same name, one sharing at least half its border, or the one holding its land — successors and namesakes must overlap it. If nothing continues it within ~400 days further on, the panel closes; a shorter hole in the data keeps the selection.

The battle layer (`BATTLE_EVENTS`, about 5,100 battles since 1800 from Wikidata) is stored as ordinary `historical` events tagged `battle-layer`, with `provenance.provider = 'wikidata'`, importance 1–4 from the number of Wikipedia language editions, and `conflictId` when Wikidata's "part of" chain reaches a curated conflict within its years. `GET /api/events?battles=0` leaves them out.

## AI outputs

`ai_outputs`: cache key, purpose, model, input/output/cache-read tokens, cost, output, expiry. (The Worker currently caches per isolate and records usage in memory — see `/api/ai/usage`; the table is ready for persistence.)

## Payments

`payment_actions` (id `wl_…`, option, event, amount, currency, state, environment, PayPal order id (unique), capture id, PayPal status, last error) — the **server-side truth**. States: `REVIEW → CREATED → APPROVED → CAPTURED|PENDING|DECLINED|FAILED|CANCELLED → REFUNDED`, enforced by `canTransition()` so late/duplicate events cannot downgrade a capture. After creation only the PayPal-derived fields change (`paypal_order_id`, `state`, `capture_id`, `paypal_status`, `last_error`, `updated_at`); amount, currency, environment and ids are immutable for the API (`PaymentStore.update` accepts nothing else, and the column grants below enforce it).

State changes are compare-and-set: `PaymentStore.update(id, patch, { expectState })` runs `update … where id = $1 and state = <expected> returning …` and returns nothing if the stored state has changed since it was read. A decision made on a stale read (e.g. a `CHECKOUT.ORDER.APPROVED` webhook racing the capture) therefore cannot overwrite a newer state written concurrently; the service re-reads and decides again (up to 3 attempts).

`payment_transactions` is the audit log. `paypal_webhook_events` (primary key = PayPal event id, plus `processed_at` and `claimed_at`) gives webhook idempotency. `claimWebhook` inserts the receipt or takes over an unprocessed one, setting `claimed_at` (a 2-minute processing lease) in the same statement (`… on conflict (event_id) do update set claimed_at = now() where processed_at is null and (claimed_at is null or claimed_at < now() - 2 minutes) returning event_id`), and answers `claimed`, `in-progress` or `done`. Only one delivery of an event is processed at a time: a concurrent copy gets HTTP 409, so PayPal retries it later. `completeWebhook` sets `processed_at` when processing has finished; a later copy is acknowledged as `duplicate`. If processing throws, `releaseWebhook` clears the lease so PayPal's retry is handled again (an abandoned lease expires after 2 minutes). Transient failures while adopting an unknown order (network, database) surface as HTTP 5xx so PayPal retries; orders that are not ours or unknown to PayPal (`FOREIGN_ORDER`, `UNKNOWN_ORDER`) are `ignored`. If a payment keeps changing underneath three compare-and-set attempts, the request fails with 503 `PAYMENT_BUSY` (and a webhook stays unprocessed) rather than silently skipping the transition.

## Operations

`provider_health`, `ingestion_runs` (one row per ingestion: provider, start/finish, stage counts, errors), `schema_migrations` (created by the migration runner).

## Migrations

| File                                                                | Contents                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `db/migrations/20261014000001_core_schema.sql`                      | `create extension if not exists postgis`, tables, CHECK constraints, GiST indexes                                               |
| `db/migrations/20261014000002_functions.sql`                        | query functions `events_in_window`, `event_by_id`, `geometries_at`, `frontlines_at`, `prune_live_news`                          |
| `db/migrations/20261014000003_webhook_processing_source_domain.sql` | `paypal_webhook_events.processed_at` (existing receipts marked processed); `news_sources.domain` no longer unique (plain index) |
| `db/migrations/20261014000004_webhook_claim_lease.sql`              | `paypal_webhook_events.claimed_at` (processing lease)                                                                           |
| `db/grants.sql`                                                     | least-privilege grants for `worldlens_app` (see below)                                                                          |
| `db/tests/smoke.sql`                                                | SQL smoke checks, run by `pnpm test:db`                                                                                         |

`pnpm db:migrate` (`scripts/db-migrate.ts`) records applied files in `schema_migrations`, applies each new migration in its own transaction, then re-applies `db/grants.sql` on every run (so the role can be created after the first migration). It reads only `MIGRATION_DATABASE_URL`, from the environment first, then from `apps/api/.dev.vars` (surrounding quotes tolerated). There is deliberately no fallback to `DATABASE_URL`: that belongs to the restricted API role, and a generic `DATABASE_URL` in the shell could point at an unrelated database. Use the owner role (e.g. `neondb_owner`) over Neon's direct connection string (host without `-pooler`): the first migration enables PostGIS, which needs the owner. Put it in the git-ignored `apps/api/.dev.vars` (`.dev.vars*` is ignored, except `.dev.vars.example`) rather than typing it inline, where it would end up in shell history:

```sh
# apps/api/.dev.vars
MIGRATION_DATABASE_URL=postgresql://neondb_owner:<password>@<endpoint-id>.<region>.aws.neon.tech/neondb?sslmode=require
```

The runner never prints the connection string: it warns on a `-pooler` host, prints only host and database name, reports an invalid URL with a fixed message, and prints errors with connection strings redacted.

`pnpm test:db` (`scripts/test-migrations.sh`) finds the PostgreSQL server binaries in `/usr/lib/postgresql/*/bin` (Debian/Ubuntu, newest wins), else via `pg_ctl` on `PATH` (e.g. Homebrew on macOS), or takes `PGBIN=/path/to/bin`; it uses `$PGBIN/psql` and fails with a clear message if none is found. (macOS + Homebrew has not been tested: there is no Mac in the build environment.) It creates a throwaway UTF-8 cluster from that PostgreSQL + PostGIS (PostgreSQL 16 + PostGIS 3 in the build environment) set up like Neon: a non-superuser `neondb_owner` owns the database and runs the migrations, PostGIS belongs to the superuser, and the role `worldlens_app` is created. It runs the real runner twice (the first run must print no warnings, the second must apply no migration), runs `db/tests/smoke.sql`, then runs the 15 repository integration tests (`apps/api/src/data/postgres.integration.test.ts`) connected as `worldlens_app`. Besides reads, upserts and payment records, they cover constraint-shaped rows, concurrent ingestions without deadlock, a curated and an automatic source sharing a domain, webhook leases (one claimant among simultaneous deliveries, release and expiry) and compare-and-set updates. `pnpm test` runs the unit tests and skips these 15.

## Access control

Browsers never connect to the database; only the API Worker does, with `DATABASE_URL` (Neon pooled connection string, host `*.neon.tech`) as the role `worldlens_app`. There is no RLS: Supabase's `anon`/`authenticated`/`service_role` roles do not exist on Neon, so the policies were replaced by explicit GRANTs in `db/grants.sql`. It first revokes everything (tables, sequences, functions) from `worldlens_app`, so every run converges to exactly this list, which covers what `apps/api/src/data/postgres.ts` does. There is no `delete` anywhere:

| Objects                                                                            | `worldlens_app`                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| content tables (sources, events, articles, geography, conflicts, media, citations) | select                                                                                                                                   |
| `news_sources`, `events`, `articles`                                               | insert, update (live-news upserts)                                                                                                       |
| `event_articles`                                                                   | insert                                                                                                                                   |
| `ingestion_runs`                                                                   | select, insert; usage on `ingestion_runs_id_seq`                                                                                         |
| `payment_actions`                                                                  | select, insert; update only on `paypal_order_id`, `state`, `capture_id`, `paypal_status`, `last_error`, `updated_at`                     |
| `payment_transactions`                                                             | select, insert; usage on `payment_transactions_id_seq`                                                                                   |
| `paypal_webhook_events`                                                            | insert; select (`event_id`, `processed_at`, `claimed_at`) and update (`processed_at`, `claimed_at`) only — raw payloads are not readable |
| functions `events_in_window`, `event_by_id`                                        | execute                                                                                                                                  |
| `ai_outputs`, `provider_health`, `prune_live_news`                                 | nothing (`prune_live_news` is not called by any code)                                                                                    |

Create the role with SQL while connected as the owner, not in the Neon console: roles created through the Neon Console, CLI or API inherit `neon_superuser` (e.g. `CREATEROLE`, `pg_write_all_data`), whereas SQL-created roles get only what is granted. Preferably in `psql`:

```sql
create role worldlens_app with login;
\password worldlens_app
```

`\password` prompts for the password and sends only a SCRAM hash, not the plaintext. (`create role worldlens_app with login password '<password>';` in the Neon SQL Editor also works, but leaves the plaintext in the editor history and logs.) Until the role exists, `db/grants.sql` skips with a notice. The smoke test asserts that `worldlens_app` cannot delete payments, rewrite webhook receipts, delete payment transactions, change a payment's amount or environment, read raw webhook payloads, delete events, run `prune_live_news`, or create or drop tables.
