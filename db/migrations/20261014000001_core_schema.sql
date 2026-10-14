-- WorldLens core schema (PostgreSQL + PostGIS; hosted on Neon, also runs on any Postgres 15+).
-- Temporal columns use timestamptz (supports years far before 1800) plus explicit
-- precision metadata; geometry uses PostGIS with GiST indexes.

create extension if not exists postgis;

-- ───────────────────────────────────────────────────────────── enums as check constraints
-- (text + CHECK keeps migrations simple and lets Zod schemas stay the single source of truth)

-- ───────────────────────────────────────────────────────────── sources

create table if not exists news_sources (
  id                  text primary key,
  name                text not null,
  domain              text not null unique,
  country             char(2),
  source_type         text not null default 'unknown'
                      check (source_type in ('wire-agency','public-broadcaster','state-media','commercial','nonprofit',
                                             'reader-funded','local','government','demo-fictional','unknown')),
  ownership           text,
  national_perspective text,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now()
);

-- Political-orientation ratings apply to SOURCES only, with mandatory provenance.
create table if not exists source_profiles (
  id                bigserial primary key,
  source_id         text not null references news_sources(id) on delete cascade,
  rating            text not null check (rating in ('LEFT','CENTER-LEFT','CENTER','CENTER-RIGHT','RIGHT','MIXED','UNRATED')),
  methodology       text,
  rating_source     text,
  rating_source_url text,
  confidence        text check (confidence in ('low','medium','high')),
  last_reviewed     date,
  illustrative      boolean not null default false,
  created_at        timestamptz not null default now(),
  constraint rating_requires_provenance check (
    rating = 'UNRATED'
    or (methodology is not null and rating_source is not null and confidence is not null and last_reviewed is not null)
  )
);
create index if not exists source_profiles_source_idx on source_profiles (source_id, created_at desc);

-- ───────────────────────────────────────────────────────────── events

create table if not exists events (
  id                  text primary key,
  kind                text not null check (kind in ('news','historical')),
  is_demo             boolean not null default false,
  title               text not null,
  summary             text,
  why_it_matters      text,
  category            text not null,
  tags                text[] not null default '{}',
  time_start          timestamptz not null,
  time_end            timestamptz,
  date_precision      text not null check (date_precision in ('minute','hour','day','month','year','decade','century')),
  date_approximate    boolean not null default false,
  time_label          text,
  importance          smallint not null default 3 check (importance between 1 and 5),
  confidence          real not null default 1 check (confidence between 0 and 1),
  conflict_id         text,
  article_count       integer not null default 0,
  source_count        integer not null default 0,
  wikipedia_title     text,
  location_name       text not null,
  location_precision  text not null check (location_precision in ('exact','city','region','country','approximate')),
  location_confidence real not null default 1,
  country_code        char(3),
  geom                geography(Point, 4326) not null,
  participants        jsonb not null default '[]',
  image               jsonb,
  provenance          jsonb not null,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  -- inclusive span used for temporal intersection queries
  period              tstzrange generated always as (tstzrange(time_start, coalesce(time_end, time_start), '[]')) stored,
  constraint events_time_order check (time_end is null or time_end >= time_start)
);
create index if not exists events_geom_gist on events using gist (geom);
create index if not exists events_period_gist on events using gist (period);
create index if not exists events_kind_time_idx on events (kind, time_start desc);
create index if not exists events_updated_idx on events (updated_at desc);

create table if not exists event_locations (
  id          bigserial primary key,
  event_id    text not null references events(id) on delete cascade,
  name        text not null,
  precision   text not null,
  confidence  real not null default 1,
  geom        geography(Point, 4326) not null
);
create index if not exists event_locations_geom_gist on event_locations using gist (geom);

create table if not exists event_geometries (
  id        bigserial primary key,
  event_id  text not null references events(id) on delete cascade,
  kind      text not null,
  geom      geometry(Geometry, 4326) not null,
  source    text not null,
  license   text not null
);
create index if not exists event_geometries_geom_gist on event_geometries using gist (geom);

-- Knowledge graph. Not a causal assertion unless type = 'LED_TO'.
create table if not exists event_relations (
  from_id     text not null references events(id) on delete cascade,
  to_id       text not null references events(id) on delete cascade,
  type        text not null check (type in ('PRECEDED_BY','LED_TO','PART_OF','RELATED_TO','RESPONSE_TO',
                                            'ESCALATION_OF','TERRITORIAL_CHANGE','PEACE_AGREEMENT')),
  confidence  real not null check (confidence between 0 and 1),
  source      text not null,
  notes       text,
  primary key (from_id, to_id, type)
);
create index if not exists event_relations_to_idx on event_relations (to_id);

create table if not exists articles (
  id              text primary key,
  source_id       text not null references news_sources(id),
  headline        text not null,
  url             text not null unique check (url like 'https://%'),
  published_at    timestamptz not null,
  language        text,
  source_country  text,
  snippet         text check (snippet is null or length(snippet) <= 600),
  image_url       text check (image_url is null or image_url like 'https://%'),
  is_demo         boolean not null default false,
  retrieved_at    timestamptz not null default now()
);
create index if not exists articles_published_idx on articles (published_at desc);

create table if not exists event_articles (
  event_id    text not null references events(id) on delete cascade,
  article_id  text not null references articles(id) on delete cascade,
  primary key (event_id, article_id)
);

-- ───────────────────────────────────────────────────────────── historical geography

create table if not exists historical_entities (
  id           text primary key,
  name         text not null,
  entity_type  text not null check (entity_type in ('state','empire','kingdom','republic','colony','protectorate',
                                                   'occupation-zone','disputed-region','control-zone','cultural-region','other')),
  wikidata_id  text,
  notes        text
);

create table if not exists historical_geometries (
  id                 text primary key,
  entity_id          text not null references historical_entities(id) on delete cascade,
  entity_name        text not null,
  entity_type        text not null,
  geom               geometry(MultiPolygon, 4326) not null,
  valid_from         timestamptz not null,
  valid_to           timestamptz,
  date_precision     text not null check (date_precision in ('day','month','year','decade','snapshot')),
  geometry_precision text not null check (geometry_precision in ('world-scale','regional','survey-grade')),
  certainty          text not null check (certainty in ('CERTAIN','APPROXIMATE','DISPUTED','RECONSTRUCTED')),
  status             text not null,
  disputed           boolean not null default false,
  source             text not null,
  license            text not null,
  citation           text not null,
  validity           tstzrange generated always as (tstzrange(valid_from, valid_to, '[)')) stored
);
create index if not exists historical_geometries_geom_gist on historical_geometries using gist (geom);
create index if not exists historical_geometries_validity_gist on historical_geometries using gist (validity);

create table if not exists conflicts (
  id               text primary key,
  name             text not null,
  aliases          text[] not null default '{}',
  time_start       timestamptz,
  time_end         timestamptz,
  date_precision   text not null default 'year',
  wikipedia_title  text,
  center           geography(Point, 4326)
);

create table if not exists frontlines (
  id              text primary key,
  conflict_id     text not null references conflicts(id) on delete cascade,
  name            text not null,
  geom            geometry(MultiLineString, 4326) not null,
  valid_from      timestamptz not null,
  valid_to        timestamptz,
  date_precision  text not null check (date_precision in ('day','month','year')),
  certainty       text not null check (certainty in ('CERTAIN','APPROXIMATE','DISPUTED','RECONSTRUCTED')),
  side_a          text not null,
  side_b          text not null,
  disputed        boolean not null default false,
  confidence      real not null check (confidence between 0 and 1),
  source          text not null,
  license         text not null,
  notes           text,
  validity        tstzrange generated always as (tstzrange(valid_from, valid_to, '[]')) stored
);
create index if not exists frontlines_geom_gist on frontlines using gist (geom);
create index if not exists frontlines_validity_gist on frontlines using gist (validity);

create table if not exists control_zones (
  id              text primary key,
  conflict_id     text not null references conflicts(id) on delete cascade,
  controlled_by   text not null,
  geom            geometry(MultiPolygon, 4326) not null,
  valid_from      timestamptz not null,
  valid_to        timestamptz,
  certainty       text not null check (certainty in ('CERTAIN','APPROXIMATE','DISPUTED','RECONSTRUCTED')),
  confidence      real not null check (confidence between 0 and 1),
  source          text not null,
  license         text not null,
  validity        tstzrange generated always as (tstzrange(valid_from, valid_to, '[)')) stored
);
create index if not exists control_zones_geom_gist on control_zones using gist (geom);
create index if not exists control_zones_validity_gist on control_zones using gist (validity);

-- ───────────────────────────────────────────────────────────── media & citations

create table if not exists media_assets (
  id                bigserial primary key,
  event_id          text references events(id) on delete cascade,
  url               text not null check (url like 'https://%'),
  source_page_url   text,
  credit            text not null,
  license           text not null,
  license_url       text,
  source            text not null,
  caching_permitted boolean not null default false,
  alt               text
);

create table if not exists citations (
  id         bigserial primary key,
  event_id   text not null references events(id) on delete cascade,
  title      text not null,
  url        text not null check (url like 'https://%'),
  publisher  text not null,
  kind       text not null,
  license    text,
  accessed   date
);
create index if not exists citations_event_idx on citations (event_id);

-- ───────────────────────────────────────────────────────────── AI cost tracking

create table if not exists ai_outputs (
  id                 bigserial primary key,
  cache_key          text unique,
  purpose            text not null,
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cost_usd           numeric(12, 6) not null default 0,
  output             jsonb,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz
);
create index if not exists ai_outputs_created_idx on ai_outputs (created_at desc);

-- ───────────────────────────────────────────────────────────── payments (server-side truth)

create table if not exists payment_actions (
  id                text primary key check (id ~ '^wl_[a-z0-9]{8,40}$'),
  action_option_id  text not null,
  event_id          text not null,
  amount            numeric(10, 2) not null check (amount > 0),
  currency          char(3) not null,
  state             text not null check (state in ('REVIEW','CREATED','APPROVED','CAPTURED','PENDING','DECLINED',
                                                  'CANCELLED','FAILED','REFUNDED')),
  environment       text not null check (environment in ('sandbox','live')),
  paypal_order_id   text unique,
  capture_id        text,
  paypal_status     text,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists payment_transactions (
  id          bigserial primary key,
  payment_id  text not null references payment_actions(id) on delete cascade,
  kind        text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists payment_transactions_payment_idx on payment_transactions (payment_id, created_at);

-- Webhook idempotency: one row per PayPal event id.
create table if not exists paypal_webhook_events (
  event_id     text primary key,
  event_type   text not null,
  payload      text not null,
  received_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── operations

create table if not exists provider_health (
  provider        text primary key,
  state           text not null,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now()
);

create table if not exists ingestion_runs (
  id            bigserial primary key,
  provider      text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz not null,
  queries       integer not null default 0,
  fetched       integer not null default 0,
  normalized    integer not null default 0,
  deduplicated  integer not null default 0,
  clusters      integer not null default 0,
  located       integer not null default 0,
  errors        jsonb not null default '[]'
);
