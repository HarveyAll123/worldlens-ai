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

`source_profiles`: political-orientation **of publishers only** — `LEFT … RIGHT, MIXED, UNRATED` with methodology, rating source/URL, confidence, last reviewed, illustrative flag. A CHECK constraint (and the Zod schema) rejects any non-`UNRATED` value without full provenance. Real publishers ship `UNRATED`; when publishers are shown (`apps/api/src/data/publishers.ts`) an outlet whose website Wikidata knows takes Wikidata's "political alignment" statement as its rating — only positions on the left–right spectrum, only when the outlet's statements agree, with Wikidata's own words, a link to the item, confidence `low` (`medium` when the statement cites a source) and the retrieval date. The same publisher directory (`apps/web/public/data/publishers/`, `pnpm data:publishers`) names, describes (kind, owner) and places outlets outside the registry. Fictional DEMO outlets carry `illustrative` ratings. A dataset with a stronger methodology can still be imported into `source_profiles`.

`articles` store headline, canonical https URL, publication time, language, source country, an optional ≤600-char snippet and image URL — never full text.

## Historical geography

`historical_entities` (kingdom, empire, republic, colony, protectorate, occupation zone, disputed region, control zone, …) and `historical_geometries`: MultiPolygon, `valid_from`/`valid_to`, `date_precision` (incl. `snapshot`), `geometry_precision` (`world-scale|regional|survey-grade`), `certainty` (`CERTAIN|APPROXIMATE|DISPUTED|RECONSTRUCTED`), status, disputed, source, license, citation; generated `validity` range with GiST.

`geometries_at(at, tolerance, bbox)` returns only geometry **valid at that instant** — no extrapolation.

Runtime source today: historical-basemaps snapshots fetched from a pinned commit (not vendored, GPL-3.0) and Natural Earth modern boundaries (public domain). Selection (`selectBorderSnapshot`): exact or nearest snapshot within ±5 years with the gap reported, Natural Earth from 2011, otherwise `available: false` with a reason. All historical-basemaps features are treated as `APPROXIMATE` (the dataset's own `BORDERPRECISION` is kept as a raw attribute).

## Conflicts, frontlines, control zones

`conflicts`; `frontlines` (MultiLineString, validity, certainty, side A/B, disputed, confidence, source, license); `control_zones` (MultiPolygon, controlled_by, validity, certainty). `frontlines_at(at, conflict)` again returns only valid records. Bundled records: the 38th-parallel division line (defined by latitude; endpoints approximate) and five present-day ceasefire / control lines from Natural Earth's "Line of control" class — Korea's Military Demarcation Line (from 27 July 1953), Kashmir's Line of Control (from 2 July 1972), the 1974 Israel–Syria line, the 1974 Cyprus ceasefire line and the Western Sahara berm — all APPROXIMATE (world-scale geometry). Real frontlines of ongoing wars are **not** bundled — import them from a licensed, cited dataset.

**Reconstructed fronts** (`packages/shared/src/fronts.ts`, data in `packages/shared/src/data/fronts/`, built by `pnpm data:fronts` from `scripts/fronts/*.ts`). No open dataset records the fronts of past wars day by day; what is recorded is when places changed hands. A _theatre_ (Eastern Front 1941–45, Korean War, …) lists places with the periods one side held them. For any moment each place gets a level (positive while that side holds it, growing with the time since or until it changed hands, capped at the theatre's horizon); the levels are interpolated over a Delaunay triangulation of the places and the zero contour is the front — so the line moves toward a town in the weeks before it falls, crosses it on the day, and rings a besieged one. Triangles with a very long side, or touching a neutral place (Switzerland), are left out; the line is clipped to land. Certainty is `RECONSTRUCTED`: exact where and when a listed place changed hands, an interpolation in between. The same triangulation gives the ground each side holds (`controlAreas`), which the web app's Territories layer paints. It is computed in the browser for the timeline's hour (no requests); the assistant reads it through `get_frontline_at_date` and `compare_frontlines`, as places, never as an exact line. Adding a war is adding a place list: `Name | Wikipedia title | periods`, coordinates from Wikidata (cached in `scripts/fronts/coords.json`).

**Occupations** (`packages/shared/src/data/fronts/occupations.ts`). A country held whole by another between two dates, with no front worth drawing (Denmark 1940–45, Kuwait 1990–91): a name pattern, a colour, dates and boxes. `controlAt` returns them with the theatres (first, so a front over the same ground is painted over them); the assistant gets them as `occupations_in_force`.

The mesh a theatre's ground is worked out on is carried outward all round its outermost places — about 110 km over water, 40 km over land — each added point taking after the place nearest to it: a cape or a border strip beyond the last town listed is then on one side or the other. Neutral places keep the _line_ out of a neutral country but are left out of the ground's mesh, so the land beside one (the French Jura along Switzerland) is still painted. `holderAt(theatre, day, lon, lat)` answers who holds any spot, as the map paints it.

Interpolating between far-apart towns runs ahead of the facts (two salients joined across country nobody took), so where a front's course is known it is written down as a **line** (`@line label = lat,lon; … | periods on its left | periods on its right | spacing | offset` in a theatre's place list, or a surveyed file in `scripts/fronts/data/`): unnamed places are set either side of it, which pins the front to it for as long as it stood there. The Eastern Front carries the limits of the German advance (the Leningrad siege line and the Oranienbaum bridgehead, the Volkhov, the Tikhvin thrust, the approaches to Moscow, the Tula pocket, the Don, Stalingrad, the Terek and the Caucasus) and the stable fronts of 1942–45 this way; the Western Front the Rhine; the Finnish front its line of 1941–44; the Western Desert the Alamein line. `pnpm data:audit-fronts [id]` looks for what is left: ground a side is given far from any place it holds and nearer to one the other side holds, and places whose holder the rest of the list would get wrong.

**Territories layer** (`apps/web/src/globe/territory.ts`, `TerritoryLayer.ts`, `land.ts`). On a past date each OpenHistoricalMap country is filled with a colour (one per power across its versions, colonies and occupation regimes — `territoryColors.ts`). Rings are stitched from the boundary ways (`packages/shared/src/rings.ts`): loose ends a few kilometres apart are joined, and an outline left open along one stretch (Poland's eastern frontier in 1920) is closed straight across. Under the countries lies the ground the build's corrections _carry_ where the source maps nobody (`OhmIndex.carried`), and each country's colour reaches 0.2° (a twelve-mile sea) past its coastal boundary, so near-shore islands outside the line drawn for it are coloured. Inside a theatre, ground side A holds within side B's countries is painted in A's colour and the reverse. Everything is painted to map tiles on a canvas (up to level 10, about 75 m a pixel) and kept to the land: OpenStreetMap's coastline, coarse for far tiles and in 5.625° cells fetched on demand for close ones, with the great lakes cut out. Close tiles use the detailed boundary ways, cut once to their cell. The countries' picture of each tile is kept from one moment to the next, so while the timeline plays only the war zones are repainted.

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
