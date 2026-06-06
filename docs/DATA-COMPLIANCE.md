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
to clear the structured row. (The artist's *email inbox* is a separate copy they
control; erasure there is a manual delete in Gmail.)

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

Then delete the matching email(s) from the artist's Gmail, and remove the contact from
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
is a post-launch follow-up. The `rate_events` table is largely self-pruning: the
per-IP sliding-window rows are deleted on each commit, and the per-day counter rows
(one per successful send) are tiny and aged out opportunistically too — so no manual
retention action is needed.

## Go-live checklist (compliance slice)

- [x] Concrete retention period defined (12 months) and stated on the privacy page.
- [x] Working erasure path (delete-by-email) — the SQL above.
- [x] Access path (select-by-email) for subject-access requests.
- [x] Retention prune available, defaulting to the stated window.
- [ ] 👤 Run one **dry-run** (a `SELECT` access query + the prune preview) against
      the live DB so you know the runbook works before a real request arrives.
- [ ] 👤 Set a quarterly prune reminder.
- [x] Recovery path for a mistaken erasure/prune documented — D1 Time Travel
      (see *Backup & recovery* below); no setup, ~30-day window on the free tier.

## Backup & recovery (the erasure/prune safety net)

The runbook above hands an operator destructive `DELETE`s by hand, so a typo in a
`WHERE email = …` clause (or an over-broad prune) could drop the wrong rows. The
safety net is **Cloudflare D1 Time Travel** — point-in-time restore, on by default,
**no setup**, retaining ~30 days of history on the free tier. It is also the answer
to "where are the backups?" for the personal/special-category data now that D1 is the
system of record.

Before running an erasure or prune against production, note the current restore point
(a bookmark) so you can roll back if it goes wrong:

```bash
# Snapshot a restore point right before a destructive op (copy the bookmark it prints):
wrangler d1 time-travel info beansprout --remote
# …run the DELETE… then, if it took the wrong rows, restore to that point in time:
wrangler d1 time-travel restore beansprout --remote --bookmark <bookmark>
#   (or --timestamp <ISO-8601 from just before the op>)
```

⚠️ A Time Travel **restore rewinds the whole database**, so it un-does any other
writes (new enquiries, flash claims) since that point too — use it immediately after a
mistaken op, not days later. For a single mis-deleted row it's usually quicker to
re-enter it from the artist's Gmail copy of the enquiry. Time Travel does **not** survive the
database being deleted/recreated, and it is **not** a GDPR loophole: a genuine erasure
must not be silently restored — only use restore to recover from an *operator error*,
and re-run the erasure afterwards if the subject's data comes back with it.

## Strategic direction (post-launch)

D1 is already the "proper store" — queryable, with a DPA and EU/UK data-residency
options on Cloudflare. The remaining step is **management UI + automation**, folded
into the artist-facing admin view (ROADMAP P2): a per-subject view, one-click
erasure, a `booked` status so retention can run automatically, and an audit log of
who erased what. The SQL runbook covers us until that ships.
