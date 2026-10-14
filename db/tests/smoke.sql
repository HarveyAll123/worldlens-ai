-- Smoke checks for the schema (run by scripts/test-migrations.sh).
\set ON_ERROR_STOP on

insert into news_sources (id, name, domain, country, source_type) values ('src-test', 'Test Wire', 'test.example', 'GB', 'wire-agency');

-- Ratings require provenance unless UNRATED.
insert into source_profiles (source_id, rating) values ('src-test', 'UNRATED');
do $$ begin
  insert into source_profiles (source_id, rating) values ('src-test', 'LEFT');
  raise exception 'rating without provenance was accepted';
exception when check_violation then null; end $$;

insert into events (id, kind, title, category, time_start, date_precision, location_name, location_precision, geom, provenance)
values
  ('hist-waterloo', 'historical', 'Battle of Waterloo', 'conflict', '1815-06-18', 'day', 'Waterloo', 'city',
   'SRID=4326;POINT(4.412 50.68)', '{"provider":"curated"}'),
  ('hist-ancient', 'historical', 'An ancient event (pre-1800 storage test)', 'other', '0501-01-01 BC', 'year', 'Athens', 'city',
   'SRID=4326;POINT(23.72 37.98)', '{"provider":"curated"}'),
  ('news-fiji', 'news', 'Pacific story near the antimeridian', 'disaster', now() - interval '2 hours', 'hour', 'Fiji', 'country',
   'SRID=4326;POINT(179.5 -17.7)', '{"provider":"gdelt"}');

-- Temporal + viewport window.
do $$ declare n int; begin
  select count(*) into n from events_in_window('1815-01-01', '1816-01-01', array['historical'], true, 0, 45, 10, 55, 50);
  if n <> 1 then raise exception 'events_in_window bbox expected 1, got %', n; end if;
  select count(*) into n from events_in_window(now() - interval '3 days', now(), array['news'], true, 170, -30, -170, 0, 50);
  if n <> 1 then raise exception 'antimeridian bbox expected 1, got %', n; end if;
  select count(*) into n from events_in_window('0601-01-01 BC', '0401-01-01 BC');
  if n <> 1 then raise exception 'pre-1800 storage expected 1, got %', n; end if;
  select count(*) into n from event_by_id('hist-waterloo');
  if n <> 1 then raise exception 'event_by_id failed'; end if;
end $$;

-- Historical geometry validity and simplification.
insert into historical_entities (id, name, entity_type) values ('ent-test', 'Testland', 'state');
insert into historical_geometries (id, entity_id, entity_name, entity_type, geom, valid_from, valid_to, date_precision,
  geometry_precision, certainty, status, source, license, citation)
values ('geo-test', 'ent-test', 'Testland', 'state',
  'SRID=4326;MULTIPOLYGON(((0 0,1 0,1 1,0.5 1.0001,0 1,0 0)))', '1900-01-01', '1950-01-01', 'year', 'world-scale',
  'APPROXIMATE', 'sovereign', 'test', 'CC0', 'test');
do $$ declare n int; begin
  select count(*) into n from geometries_at('1920-06-01', 0.01);
  if n <> 1 then raise exception 'geometries_at inside validity expected 1, got %', n; end if;
  select count(*) into n from geometries_at('1960-06-01', 0.01);
  if n <> 0 then raise exception 'geometries_at outside validity must be empty (no extrapolation)'; end if;
end $$;

-- Frontlines.
insert into conflicts (id, name) values ('conflict-korean-war', 'Korean War');
insert into frontlines (id, conflict_id, name, geom, valid_from, valid_to, date_precision, certainty, side_a, side_b, confidence, source, license)
values ('line-38', 'conflict-korean-war', '38th parallel', 'SRID=4326;MULTILINESTRING((124.65 38,128.65 38))',
  '1945-08-01', '1950-06-25', 'month', 'CERTAIN', 'North', 'South', 0.9, 'definition', 'public domain');
do $$ declare n int; begin
  select count(*) into n from frontlines_at('1948-01-01');
  if n <> 1 then raise exception 'frontlines_at expected 1'; end if;
  select count(*) into n from frontlines_at('1952-01-01');
  if n <> 0 then raise exception 'frontlines_at must not extrapolate'; end if;
end $$;

-- Payments: id format, state machine values, webhook idempotency.
insert into payment_actions (id, action_option_id, event_id, amount, currency, state, environment, paypal_order_id)
values ('wl_abcdefgh12', 'act-quake-relief-sandbox', 'demo-news-sulawesi-quake-relief', 20.00, 'USD', 'CREATED', 'sandbox', 'ORDER123');
do $$ begin
  insert into payment_actions (id, action_option_id, event_id, amount, currency, state, environment)
  values ('bad-id', 'x', 'y', 1, 'USD', 'CREATED', 'sandbox');
  raise exception 'invalid payment id accepted';
exception when check_violation then null; end $$;
insert into paypal_webhook_events (event_id, event_type, payload) values ('WH-1', 'PAYMENT.CAPTURE.COMPLETED', '{}');
insert into paypal_webhook_events (event_id, event_type, payload) values ('WH-1', 'PAYMENT.CAPTURE.COMPLETED', '{}') on conflict do nothing;
do $$ declare n int; begin
  select count(*) into n from paypal_webhook_events where event_id = 'WH-1';
  if n <> 1 then raise exception 'webhook idempotency failed'; end if;
end $$;

-- Least privilege (db/grants.sql): the API role reads content and upserts live news, cannot
-- delete anything, can change only PayPal-derived payment fields, and cannot change the schema.
set role worldlens_app;
do $$ declare n int; begin
  select count(*) into n from events;
  if n < 1 then raise exception 'worldlens_app should read events'; end if;
  select count(*) into n from payment_actions;
  insert into ingestion_runs (provider, started_at, finished_at) values ('smoke', now(), now());
  update payment_actions set paypal_status = 'CREATED' where id = 'wl_abcdefgh12';
  begin
    delete from payment_actions;
    raise exception 'worldlens_app must not delete payments';
  exception when insufficient_privilege then null;
  end;
  begin
    update paypal_webhook_events set event_type = 'x';
    raise exception 'worldlens_app must not rewrite webhook receipts';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from payment_transactions;
    raise exception 'worldlens_app must not delete payment transactions';
  exception when insufficient_privilege then null;
  end;
  begin
    update payment_actions set amount = 0.01;
    raise exception 'worldlens_app must not change payment amounts';
  exception when insufficient_privilege then null;
  end;
  begin
    update payment_actions set environment = 'live';
    raise exception 'worldlens_app must not change the payment environment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform payload from paypal_webhook_events;
    raise exception 'worldlens_app must not read raw webhook payloads';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from events;
    raise exception 'worldlens_app must not delete events';
  exception when insufficient_privilege then null;
  end;
  begin
    perform prune_live_news(now());
    raise exception 'worldlens_app must not run the maintenance function';
  exception when insufficient_privilege then null;
  end;
  begin
    create table smoke_should_fail (id int);
    raise exception 'worldlens_app must not create tables';
  exception when insufficient_privilege then null;
  end;
  begin
    drop table events;
    raise exception 'worldlens_app must not drop tables';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Spatial indexes exist.
do $$ declare n int; begin
  select count(*) into n from pg_indexes where indexdef ilike '%using gist%';
  if n < 8 then raise exception 'expected GiST indexes, found %', n; end if;
end $$;
