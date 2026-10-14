-- A webhook delivery being processed holds a short lease (claimed_at), so a concurrent copy of the
-- same PayPal event is answered "in progress" (PayPal retries later) instead of being processed
-- twice. A failed attempt releases the lease; an abandoned one expires (see claimWebhook).
alter table paypal_webhook_events add column if not exists claimed_at timestamptz;
