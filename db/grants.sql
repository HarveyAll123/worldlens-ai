-- Least-privilege access for the API. Re-applied on every `pnpm db:migrate`, so it is safe to
-- create the role after the first migration.
--
-- Browsers never connect to the database: only the API Worker does, with DATABASE_URL. Point
-- DATABASE_URL at the role `worldlens_app`, created with SQL (not in the Neon console: roles
-- created there inherit neon_superuser, which can write every table and bypasses RLS):
--
--   create role worldlens_app with login password '<long random password>';
--
-- Migrations themselves run as the database owner (e.g. neondb_owner) over a direct connection.

do $$
declare t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'worldlens_app') then
    raise notice 'role worldlens_app does not exist; skipping grants (see db/grants.sql)';
    return;
  end if;

  execute 'grant usage on schema public to worldlens_app';

  -- Published content: read, plus the ingestion job's upserts and pruning of old live news.
  foreach t in array array['news_sources','source_profiles','events','event_locations','event_geometries',
                           'event_relations','articles','event_articles','historical_entities',
                           'historical_geometries','conflicts','frontlines','control_zones','media_assets',
                           'citations']
  loop
    execute format('grant select, insert, update, delete on %I to worldlens_app', t);
  end loop;

  -- Payments are append/update only: payment history and webhook receipts are never deleted
  -- or rewritten by the application.
  execute 'grant select, insert, update on payment_actions to worldlens_app';
  execute 'grant select, insert on payment_transactions, paypal_webhook_events, ingestion_runs to worldlens_app';
  execute 'grant select, insert, update, delete on ai_outputs, provider_health to worldlens_app';
  execute 'grant usage on all sequences in schema public to worldlens_app';

  execute 'grant execute on function events_in_window(timestamptz, timestamptz, text[], boolean, double precision, double precision, double precision, double precision, integer) to worldlens_app';
  execute 'grant execute on function event_by_id(text) to worldlens_app';
  execute 'grant execute on function geometries_at(timestamptz, double precision, double precision, double precision, double precision, double precision) to worldlens_app';
  execute 'grant execute on function frontlines_at(timestamptz, text) to worldlens_app';
  execute 'grant execute on function prune_live_news(timestamptz) to worldlens_app';
end $$;
