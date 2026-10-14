-- Query functions used by the API (via PostgREST /rest/v1/rpc/...) and row-level security.

-- Events intersecting a time window, optionally inside a viewport bbox (antimeridian-aware).
create or replace function events_in_window(
  p_start timestamptz,
  p_end timestamptz,
  p_kinds text[] default array['news','historical'],
  p_include_demo boolean default true,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_limit integer default 200
)
returns table (
  id text, kind text, is_demo boolean, title text, summary text, why_it_matters text, category text,
  tags text[], time_start timestamptz, time_end timestamptz, date_precision text, date_approximate boolean,
  importance smallint, confidence real, article_count integer, source_count integer,
  location_name text, location_precision text, location_confidence real, country_code char(3),
  lat double precision, lon double precision, participants jsonb, image jsonb, provenance jsonb, updated_at timestamptz
)
language sql stable
set search_path = public, extensions
as $$
  select e.id, e.kind, e.is_demo, e.title, e.summary, e.why_it_matters, e.category, e.tags,
         e.time_start, e.time_end, e.date_precision, e.date_approximate, e.importance, e.confidence,
         e.article_count, e.source_count, e.location_name, e.location_precision, e.location_confidence,
         e.country_code, st_y(e.geom::geometry), st_x(e.geom::geometry), e.participants, e.image,
         e.provenance, e.updated_at
  from events e
  where e.period && tstzrange(p_start, p_end, '[)')
    and e.kind = any (p_kinds)
    and (p_include_demo or not e.is_demo)
    and (
      p_west is null
      or (p_west <= p_east and st_intersects(e.geom::geometry, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)))
      or (p_west > p_east and (
            st_intersects(e.geom::geometry, st_makeenvelope(p_west, p_south, 180, p_north, 4326))
         or st_intersects(e.geom::geometry, st_makeenvelope(-180, p_south, p_east, p_north, 4326))))
    )
  order by e.importance desc, e.time_start desc
  limit greatest(1, least(p_limit, 1000));
$$;

create or replace function event_by_id(p_id text)
returns table (
  id text, kind text, is_demo boolean, title text, summary text, why_it_matters text, category text,
  tags text[], time_start timestamptz, time_end timestamptz, date_precision text, date_approximate boolean,
  importance smallint, confidence real, article_count integer, source_count integer,
  location_name text, location_precision text, location_confidence real, country_code char(3),
  lat double precision, lon double precision, participants jsonb, image jsonb, provenance jsonb, updated_at timestamptz
)
language sql stable
set search_path = public, extensions
as $$
  select e.id, e.kind, e.is_demo, e.title, e.summary, e.why_it_matters, e.category, e.tags,
         e.time_start, e.time_end, e.date_precision, e.date_approximate, e.importance, e.confidence,
         e.article_count, e.source_count, e.location_name, e.location_precision, e.location_confidence,
         e.country_code, st_y(e.geom::geometry), st_x(e.geom::geometry), e.participants, e.image,
         e.provenance, e.updated_at
  from events e where e.id = p_id;
$$;

-- Border geometry valid at an instant, simplified server-side for the requested detail.
create or replace function geometries_at(
  p_at timestamptz,
  p_tolerance double precision default 0.05,
  p_west double precision default -180,
  p_south double precision default -90,
  p_east double precision default 180,
  p_north double precision default 90
)
returns table (
  id text, entity_id text, entity_name text, entity_type text, certainty text, disputed boolean,
  status text, source text, license text, citation text, geojson jsonb
)
language sql stable
set search_path = public, extensions
as $$
  select g.id, g.entity_id, g.entity_name, g.entity_type, g.certainty, g.disputed, g.status, g.source,
         g.license, g.citation,
         st_asgeojson(st_simplifypreservetopology(g.geom, greatest(p_tolerance, 0)), 3)::jsonb
  from historical_geometries g
  where g.validity @> p_at
    and g.geom && st_makeenvelope(p_west, p_south, p_east, p_north, 4326);
$$;

create or replace function frontlines_at(p_at timestamptz, p_conflict text default null)
returns table (
  id text, conflict_id text, name text, certainty text, side_a text, side_b text, confidence real,
  source text, license text, valid_from timestamptz, valid_to timestamptz, geojson jsonb
)
language sql stable
set search_path = public, extensions
as $$
  select f.id, f.conflict_id, f.name, f.certainty, f.side_a, f.side_b, f.confidence, f.source, f.license,
         f.valid_from, f.valid_to, st_asgeojson(f.geom, 4)::jsonb
  from frontlines f
  where f.validity @> p_at and (p_conflict is null or f.conflict_id = p_conflict);
$$;

-- Removes ingested (non-curated) news older than the live window.
create or replace function prune_live_news(p_before timestamptz)
returns integer
language sql
set search_path = public
as $$
  with d as (
    delete from events
    where kind = 'news' and not is_demo and provenance->>'provider' = 'gdelt' and updated_at < p_before
    returning 1
  ) select count(*)::integer from d;
$$;

-- ───────────────────────────────────────────────────────────── row-level security
-- Public, read-only access to published content; no anonymous access to payments, AI logs
-- or operations. The Worker uses the service-role key, which bypasses RLS.

do $$
declare t text;
begin
  foreach t in array array['news_sources','source_profiles','events','event_locations','event_geometries',
                           'event_relations','articles','event_articles','historical_entities',
                           'historical_geometries','conflicts','frontlines','control_zones','media_assets','citations']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
  foreach t in array array['ai_outputs','payment_actions','payment_transactions','paypal_webhook_events',
                           'provider_health','ingestion_runs']
  loop
    execute format('alter table %I enable row level security', t);
    -- no policies: only the service role can read or write
  end loop;

  -- Explicit privileges (defence in depth on top of RLS) for Supabase's API roles.
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema public to anon, authenticated';
    foreach t in array array['news_sources','source_profiles','events','event_locations','event_geometries',
                             'event_relations','articles','event_articles','historical_entities',
                             'historical_geometries','conflicts','frontlines','control_zones','media_assets','citations']
    loop
      execute format('grant select on %I to anon, authenticated', t);
    end loop;
    foreach t in array array['ai_outputs','payment_actions','payment_transactions','paypal_webhook_events',
                             'provider_health','ingestion_runs']
    loop
      execute format('revoke all on %I from anon, authenticated', t);
    end loop;
  end if;
end $$;

-- Functions run with invoker rights; restrict the maintenance function to the service role.
revoke execute on function prune_live_news(timestamptz) from public;
