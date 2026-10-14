-- 1. Webhook receipts record when processing finished. A delivery whose processing failed
--    (processed_at is null) is handled again when PayPal retries, instead of being dropped as
--    a duplicate. Receipts stored before this column existed count as processed.
alter table paypal_webhook_events add column if not exists processed_at timestamptz;
update paypal_webhook_events set processed_at = received_at where processed_at is null;

-- 2. A publisher's identity is its id. Domain uniqueness made every later ingestion fail once a
--    domain stored under an automatic id (src-auto-…) was added to the curated registry under
--    another id. Keep a plain index for lookups.
alter table news_sources drop constraint if exists news_sources_domain_key;
create index if not exists news_sources_domain_idx on news_sources (domain);
