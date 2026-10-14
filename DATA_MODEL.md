# Data model

Runtime shapes are defined once in `packages/shared/src/schemas.ts` (Zod). The PostgreSQL schema lives in `db/migrations/`, applied in order by `pnpm db:migrate` (`scripts/db-migrate.ts`), which then re-applies the role grants in `db/grants.sql` (setup: [MANUAL_SETUP.md → Neon](MANUAL_SETUP.md#neon)). `pnpm test:db` runs the migrations, grants, smoke checks and repository tests against a throwaway local PostGIS.

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

`payment_actions` (id `wl_…`, option, event, amount, currency, state, environment, PayPal order id (unique), capture id, PayPal status, last error) — the **server-side truth**. States: `REVIEW → CREATED → APPROVED → CAPTURED|PENDING|DECLINED|FAILED|CANCELLED → REFUNDED`, enforced by `canTransition()` so late/duplicate events cannot downgrade a capture. `payment_transactions` is the audit log. `paypal_webhook_events` (primary key = PayPal event id) gives webhook idempotency.

## Operations

`provider_health`, `ingestion_runs`.

## Access control

Browsers never connect to the database; only the API does, as the least-privilege `worldlens_app` role (`db/grants.sql`). It can read and write the content tables (ingestion upserts and pruning), select/insert/update `payment_actions`, only select/insert `payment_transactions`, `paypal_webhook_events` and `ingestion_runs` (payment history and webhook receipts are never deleted or rewritten), use `ai_outputs` and `provider_health`, and execute the query functions; `prune_live_news` is revoked from `public`. There is no row-level security. Migrations run as the database owner.
