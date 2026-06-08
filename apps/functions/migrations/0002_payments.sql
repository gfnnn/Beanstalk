-- D1 schema — payments backbone (Phase 1: flash full payment via Stripe).
-- Apply with:  wrangler d1 migrations apply beansprout   (see docs/PAYMENTS-STRIPE-BUILD.md)
--
-- Adds the money system-of-record on top of 0001_init.sql. The flash flow keeps
-- its existing reserve→email path; what's new is a durable payment ledger, webhook
-- idempotency, and a hold-expiry column so an abandoned checkout can't lock a
-- one-of-a-kind piece forever. A *paid* payments row is financial data and follows
-- the long-retention rule, not the 12-month enquiry prune — see docs/DATA-COMPLIANCE.md.

-- Payments ledger — one row per checkout attempt; the record of truth for money.
-- Written BEFORE the provider call (status 'awaiting'), flipped by the verified
-- webhook ('paid'), or rolled back ('failed'/'expired'). `id` is our own reference
-- (e.g. BSF-flash-01-a1b2), not the provider's, so it's stable across providers.
CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,             -- our reference, e.g. BSF-flash-01-a1b2
  kind          TEXT NOT NULL,                -- 'flash' | 'deposit'
  status        TEXT NOT NULL,                -- 'awaiting' | 'paid' | 'failed' | 'expired' | 'refunded'
  provider      TEXT NOT NULL DEFAULT 'stripe', -- 'stripe' | 'paypal' | 'bank'
  provider_ref  TEXT,                         -- stripe session/intent (cs_…/pi_…), paypal order id, …
  amount_pence  INTEGER NOT NULL,             -- server-side authority; the client never sets this
  currency      TEXT NOT NULL DEFAULT 'gbp',
  email         TEXT,
  piece_id      TEXT,                         -- flash piece (NULL for a custom deposit)
  submission_id TEXT,                         -- links to submissions.id
  created_at    TEXT NOT NULL,                -- ISO 8601
  paid_at       TEXT                          -- ISO 8601, set on confirmation
);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider_ref);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_piece_id     ON payments(piece_id);

-- Webhook idempotency — providers re-deliver, so each event id is processed once.
-- A row here means "already handled"; a fresh INSERT (ON CONFLICT DO NOTHING) is
-- the signal to process.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,               -- provider event id (e.g. stripe evt_…)
  type        TEXT,                           -- event type, for debugging
  received_at TEXT NOT NULL                   -- ISO 8601
);

-- Stale-pending release: when an unpaid reserve should auto-free. NULL = no expiry
-- (the legacy manual-claim reserve never auto-expires); a checkout-created reserve
-- sets this ~48h out, so an abandoned payment frees the piece. Only 'pending' rows
-- are ever swept (see expirePendingClaims in src/lib/db.js).
ALTER TABLE flash_claims ADD COLUMN expires_at TEXT;
