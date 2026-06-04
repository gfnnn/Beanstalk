# Data compliance — retention & erasure (MVP)

The minimum that makes Beansprout v2 **launch-compliant under UK GDPR**: a concrete
retention period, a working **erasure path**, and a privacy page that matches both.
This clears the go-live blocker flagged in `ROADMAP.md`.

> **Why this got simpler.** Personal data now lives in **Cloudflare D1 (SQLite)**,
> not a key-value blob store — exactly so access/erasure/retention are plain SQL,
> queryable and auditable, instead of a scan-all script. This is the "proper,
> compliance-manageable store" decision recorded in the migration. The
> artist-facing admin UI (ROADMAP P2) will sit on top of these same tables.

## What personal data we hold, and where

All in the D1 database `beansprout` (bound as `DB` in the Worker):

| Table | Written by | Contents | Personal? |
|---|---|---|---|
| `submissions` | enquiry handler | enquiry + flash-claim `fields` (name, email, phone, idea, **health info**), `received_at`, `ip`, `email_status`; `email` is denormalised out of `fields` for fast lookup | **Yes — incl. special-category** (health) |
| `newsletter_consent` | newsletter handler | email, first name, `consented_at`, consent wording + version, source, ip | Yes |
| `flash_claims` | enquiry handler | piece-id → `pending`/`claimed` | No (reservation state only) |
| `rate_events` | rate limiter | abuse-limit counters (bucket, ts) — IP is in the bucket string | Low (transient) |

Image **bytes are never stored** — only filenames/counts — so an erasure only has
to clear the structured row. (Roxy's *email inbox* is a separate copy she controls;
erasure there is a manual delete in Gmail.)

## Retention policy (matches the privacy page)

- **Enquiries that don't lead to a booking:** kept **up to 12 months**, then deleted.
- **Records for a tattoo actually carried out** (consent + health): kept for the
  insurer/local-authority-mandated period (years) — do **not** age-prune these.
- **Newsletter consent:** kept until the subscriber unsubscribes.

These figures already appear on `apps/web/privacy/index.html` ("How long we keep
it") and the subject-rights paragraph ("respond within one month"). **If you change
the window, update both the privacy page and the prune SQL below.**

## The runbook (plain SQL via wrangler)

Every GDPR operation is one command. Run from `apps/functions/` (where
`wrangler.toml` lives), authenticated with `wrangler login`. Drop `--remote` to
hit the local dev DB instead of production.

**Subject access — everything we hold for a person** (requests arrive as an email):

```bash
wrangler d1 execute beansprout --remote \
  --command "SELECT id, kind, received_at, email_status, fields FROM submissions WHERE email = 'someone@example.com'"
wrangler d1 execute beansprout --remote \
  --command "SELECT * FROM newsletter_consent WHERE email = 'someone@example.com'"
```

**Erasure — delete everything for a person:**

```bash
wrangler d1 execute beansprout --remote \
  --command "DELETE FROM submissions WHERE email = 'someone@example.com'; \
             DELETE FROM newsletter_consent WHERE email = 'someone@example.com'"
```

Then delete the matching email(s) from Roxy's Gmail, and remove the contact from
the Resend Audience if it's a newsletter erasure. Respond within **one month** (as
the privacy page states).

**Retention prune — drop un-booked enquiries past 12 months:**

```bash
# Preview first:
wrangler d1 execute beansprout --remote \
  --command "SELECT id, received_at, email FROM submissions WHERE received_at < datetime('now','-12 months')"
# Then delete:
wrangler d1 execute beansprout --remote \
  --command "DELETE FROM submissions WHERE received_at < datetime('now','-12 months')"
```

⚠️ The prune deletes by age alone — it can't tell an un-booked enquiry from a
completed tattoo. Before deleting, eyeball the preview and **keep any record for a
tattoo that went ahead** (those have the insurer/LA retention). At studio volume
this manual check is trivial; automating it (a `booked` flag + a scheduled Worker)
is a post-launch follow-up. The `rate_events` table is transient and self-pruning;
no retention action needed.

## Go-live checklist (compliance slice)

- [x] Concrete retention period defined (12 months) and stated on the privacy page.
- [x] Working erasure path (delete-by-email) — the SQL above.
- [x] Access path (select-by-email) for subject-access requests.
- [x] Retention prune available, defaulting to the stated window.
- [ ] 👤 Run one **dry-run** (a `SELECT` access query + the prune preview) against
      the live DB so you know the runbook works before a real request arrives.
- [ ] 👤 Set a quarterly prune reminder.

## Strategic direction (post-launch)

D1 is already the "proper store" — queryable, with a DPA and EU/UK data-residency
options on Cloudflare. The remaining step is **management UI + automation**, folded
into the artist-facing admin view (ROADMAP P2): a per-subject view, one-click
erasure, a `booked` status so retention can run automatically, and an audit log of
who erased what. The SQL runbook covers us until that ships.
