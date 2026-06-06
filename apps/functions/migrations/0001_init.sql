-- D1 schema for the Beansprout form/email worker.
-- Apply with:  wrangler d1 migrations apply beansprout   (see docs/ENQUIRY-SETUP.md)
--
-- Personal / special-category data lives here (submissions.fields can include
-- health info); see docs/DATA-COMPLIANCE.md for retention + erasure (plain SQL,
-- which is the whole reason this is D1 rather than a key-value blob store).

-- Enquiry + flash-claim submissions. `fields` is the raw JSON the form sent;
-- `email` is denormalised out of it so access/erasure requests are one indexed
-- lookup. Image BYTES are never stored — only the count/names.
CREATE TABLE IF NOT EXISTS submissions (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,                 -- 'enquiry' | 'flash'
  email        TEXT,                          -- denormalised from fields.email
  received_at  TEXT NOT NULL,                 -- ISO 8601
  ip           TEXT,
  fields       TEXT NOT NULL,                 -- JSON
  image_count  INTEGER NOT NULL DEFAULT 0,
  image_names  TEXT NOT NULL DEFAULT '[]',    -- JSON array
  skipped      INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'pending' -- 'pending' | 'sent' | 'failed'
);
CREATE INDEX IF NOT EXISTS idx_submissions_email       ON submissions(email);
CREATE INDEX IF NOT EXISTS idx_submissions_received_at ON submissions(received_at);

-- Newsletter consent ledger — proof of lawful basis (single opt-in). No email is
-- ever sent from here; it just records WHEN and to WHAT wording each subscriber
-- consented.
CREATE TABLE IF NOT EXISTS newsletter_consent (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  first_name   TEXT,
  consented_at TEXT NOT NULL,
  statement    TEXT,
  version      TEXT,
  source       TEXT,
  ip           TEXT
);
CREATE INDEX IF NOT EXISTS idx_consent_email ON newsletter_consent(email);

-- Flash inventory — a one-of-a-kind piece is reserved here on claim so it can't be
-- double-claimed. piece_id is the PK, which makes the reserve atomic (INSERT … ON
-- CONFLICT DO NOTHING), an improvement on the old read-modify-write blob.
CREATE TABLE IF NOT EXISTS flash_claims (
  piece_id   TEXT PRIMARY KEY,
  status     TEXT NOT NULL,                   -- 'pending' | 'claimed'
  updated_at TEXT NOT NULL
);

-- Rate-limit events — one row per successful action, bucketed per-IP and per-day.
-- The per-IP sliding window and the global daily ceiling are both COUNT()s over
-- this table; old per-IP rows AND stale per-day counters are both pruned
-- opportunistically on commit (see rateLimit() in src/lib/db.js).
CREATE TABLE IF NOT EXISTS rate_events (
  id     INTEGER PRIMARY KEY,                 -- rowid alias; avoids ts collisions
  bucket TEXT NOT NULL,                       -- '<store>:ip:<ip>' | '<store>:day:<YYYY-MM-DD>'
  ts     INTEGER NOT NULL                     -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_rate_bucket_ts ON rate_events(bucket, ts);
