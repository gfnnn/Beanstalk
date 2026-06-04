# Data compliance — retention & erasure (MVP)

The minimum that makes Beansprout v2 **launch-compliant under UK GDPR**: a concrete
retention period, a working **erasure path**, and a privacy page that matches both.
This clears the go-live blocker flagged in `ROADMAP.md`, `ENQUIRY-SETUP.md`, and
`apps/functions/netlify/functions/_shared.js` (`persistSubmission`).

> **Direction of travel (decided).** This is the *deliberately minimal* "do the
> least to be compliant now" approach: an offline operator runbook, no new public
> endpoint, no new infra. The agreed longer-term plan is to move captured
> submissions **out of the project** into a dedicated, secure data store with
> first-class compliance tooling (access/erasure workflows, audit log, retention
> automation, access control). See **"Strategic direction"** at the bottom and the
> P2 entry in `ROADMAP.md`. Until then, the runbook below is the system of record.

## What personal data we hold, and where

| Store (Netlify Blobs) | Written by | Contents | Personal? |
|---|---|---|---|
| `submissions` | `enquiry.js` → `persistSubmission` | enquiry + flash-claim fields (name, email, phone, tattoo idea, **health info**, image *names* only), `receivedAt`, IP, `emailStatus` | **Yes — incl. special-category** (health) |
| `newsletter-consent` | `newsletter.js` → `persistConsent` | email, first name, `consentedAt`, consent wording + version, source, IP | Yes |
| `flash-claims` | `_shared.js` reserve/release | piece-id → `pending`/`claimed` map | No (reservation state only) |

Image **bytes are never stored** — only filenames/counts — so an erasure only has
to clear the structured record. (The artist's *email inbox* is a separate copy she
controls; erasure there is a manual delete in Gmail.)

## Retention policy (matches the privacy page)

- **Enquiries that don't lead to a booking:** kept **up to 12 months** (`365` days),
  then deleted — the `RETENTION_DAYS_DEFAULT` in the runbook.
- **Records for a tattoo actually carried out** (consent + health): kept for the
  insurer/local-authority-mandated period (years). These should **not** be pruned by
  age — keep them out of routine prunes (see the prune note below).
- **Newsletter consent:** kept until the subscriber unsubscribes (Resend handles the
  list; the ledger entry is the lawful-basis proof).

These figures already appear on `apps/web/privacy/index.html` ("How long we keep
it") and the subject-rights paragraph ("respond within one month"). **If you change
the retention window, update both the privacy page and the runbook default.**

## The erasure / retention runbook

`apps/functions/scripts/data-admin.mjs` — a **local** operator tool run by hand
against the live Blobs stores. It is intentionally **not** deployed as a function,
so it adds **no new public attack surface**. It covers the three GDPR operations we
must be able to perform: **access** (find a person's data), **erasure**
(delete-by-key), and **retention** (prune past the window).

### One-time setup

It runs in Blobs "manual mode", so it needs read/write credentials for the site:

```bash
export NETLIFY_SITE_ID=...      # Netlify → Site configuration → General → Site ID
export NETLIFY_API_TOKEN=...    # Netlify → User settings → Applications → New token
```

Never commit these. Run from the repo root (deps are hoisted there).

### Honouring a request

**Subject access / erasure request** (arrives as an email address):

```bash
# 1. Find everything we hold for that person, across both personal stores:
node apps/functions/scripts/data-admin.mjs find someone@example.com

# 2. (Access) inspect a specific record in full:
node apps/functions/scripts/data-admin.mjs get submissions <key>

# 3. (Erasure) delete-by-key — dry-runs first; add --yes to actually erase:
node apps/functions/scripts/data-admin.mjs delete submissions <key>
node apps/functions/scripts/data-admin.mjs delete submissions <key> --yes
```

Also delete the corresponding email(s) from Roxy's Gmail to complete erasure, and
remove the contact from the Resend Audience if it's a newsletter erasure. Respond to
the requester within **one month** (as the privacy page states).

### Routine retention prune

```bash
node apps/functions/scripts/data-admin.mjs list                 # review what's held
node apps/functions/scripts/data-admin.mjs prune                # DRY RUN, 365-day default
node apps/functions/scripts/data-admin.mjs prune --days 365 --apply
```

Run this on a **calendar reminder** (e.g. quarterly). ⚠️ The prune deletes
`submissions` by age alone — it can't tell an un-booked enquiry from a completed
tattoo. Before `--apply`, eyeball the dry-run list and **keep any record for a
tattoo that went ahead** (those have the insurer/LA retention). For a small studio
volume this manual check is trivial; automating it is part of the strategic move
below.

All commands also accept the `consent` and `flash` stores (`list consent`,
`delete consent <key>`, …). `npm run data --workspace @beansprout/functions -- <args>`
works too.

## Go-live checklist (compliance slice)

- [x] Concrete retention period defined (12 months) and stated on the privacy page.
- [x] Working erasure path (delete-by-key) — the runbook above.
- [x] Access path (find-by-email) for subject-access requests.
- [x] Retention prune available, defaulting to the stated window.
- [ ] 👤 Generate `NETLIFY_SITE_ID` + `NETLIFY_API_TOKEN` and do one **dry-run**
      (`find` a test submission, `prune` dry-run) so you know the runbook works
      *before* a real request arrives.
- [ ] 👤 Set the quarterly prune reminder.

## Strategic direction (post-launch) — move the data out of the project

The runbook is sufficient to launch, but the agreed target is to stop using Netlify
Blobs as the long-term home for personal data and instead capture submissions into a
**dedicated, secure, managed store with built-in compliance features**:

- **Why:** Blobs has no access control beyond the API token, no audit trail, no
  built-in retention automation, and no per-subject view — every GDPR operation is
  manual. A purpose-built store makes access/erasure/retention first-class.
- **Candidate shapes:** a managed Postgres/SaaS DB (e.g. Supabase/Neon) behind the
  authenticated admin surface in `ROADMAP.md` P2; or a CRM/helpdesk the studio
  already trusts. Decision criteria: encryption at rest, EU/UK data residency, a
  DPA, role-based access, audit logging, and an erasure/retention API.
- **Sequencing:** this pairs naturally with the **artist-facing admin view** (ROADMAP
  P2) — the same surface that lists/manages submissions hosts the erasure UI and
  retention controls. Build it post-launch; the runbook covers us until then.
