-- Least-privilege access for the API. Re-applied on every `pnpm db:migrate`, so it is safe to
-- create the role after the first migration, and earlier grants converge to this list.
--
-- Browsers never connect to the database: only the API Worker does, with DATABASE_URL. Point
-- DATABASE_URL at the role `worldlens_app`, created with SQL (not in the Neon console: roles
-- created there inherit neon_superuser, which can write every table and bypasses RLS):
--
--   create role worldlens_app with login;
--   \password worldlens_app        -- in psql: sends only a SCRAM hash, not the plaintext
--
-- Migrations themselves run as the database owner (e.g. neondb_owner) over a direct connection.
-- Grants cover exactly what apps/api/src/data/postgres.ts does; widen them with a feature.

do $$
declare t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'worldlens_app') then
    raise notice 'role worldlens_app does not exist; skipping grants (see db/grants.sql)';
    return;
  end if;

  execute 'revoke all on all tables in schema public from worldlens_app';
  execute 'revoke all on all sequences in schema public from worldlens_app';
  execute 'revoke all on all functions in schema public from worldlens_app';
  execute 'grant usage on schema public to worldlens_app';

  -- Published content is readable; nothing is ever deleted by the API.
  foreach t in array array['news_sources','source_profiles','events','event_locations','event_geometries',
                           'event_relations','articles','event_articles','historical_entities',
                           'historical_geometries','conflicts','frontlines','control_zones','media_assets',
                           'citations']
  loop
    execute format('grant select on %I to worldlens_app', t);
  end loop;
  -- Live-news ingestion upserts these.
  execute 'grant insert, update on news_sources, events, articles to worldlens_app';
  execute 'grant insert on event_articles to worldlens_app';
  execute 'grant select, insert on ingestion_runs to worldlens_app';
  execute 'grant usage on sequence ingestion_runs_id_seq to worldlens_app';

  -- Payments: records are created, then only their PayPal-derived fields change. Amount,
  -- currency, environment, ids and created_at are immutable for the API; history is append-only.
  execute 'grant select, insert on payment_actions to worldlens_app';
  execute 'grant update (paypal_order_id, state, capture_id, paypal_status, last_error, updated_at) on payment_actions to worldlens_app';
  execute 'grant select, insert on payment_transactions to worldlens_app';
  execute 'grant usage on sequence payment_transactions_id_seq to worldlens_app';
  -- Webhook receipts: insert, and mark processed. Raw payloads (payer details) are not readable.
  execute 'grant insert on paypal_webhook_events to worldlens_app';
  execute 'grant select (event_id, processed_at), update (processed_at) on paypal_webhook_events to worldlens_app';

  execute 'grant execute on function events_in_window(timestamptz, timestamptz, text[], boolean, double precision, double precision, double precision, double precision, integer) to worldlens_app';
  execute 'grant execute on function event_by_id(text) to worldlens_app';
end $$;
