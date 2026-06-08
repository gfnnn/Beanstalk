# Artist dashboard — design & build plan

A **private dashboard for the artist** (Beansprout / Roxy) to manage what the site captures:
enquiries, flash claims, payments, and — once it ships — bookings, plus the GDPR tools. It is
**not** a tool for the host studio (Tiny Knives owns the chair schedule, not this site) and it
is **not** multi-user: one artist, one login. Today every enquiry and flash claim is persisted
to **D1** (`submissions`, `flash_claims`, `payments`, `newsletter_consent`) but the only way to
*see* it is the artist's inbox + raw SQL. This is the **read/manage surface** over that data —
and the **load-bearing substrate** the post-launch features reuse: payments reconciliation,
the scheduling confirm step, and the GDPR erasure UI all live here, so it's built once.

> **Status: planned, not built.** Post-launch backlog (ROADMAP P2). This doc is the complete
> functional design; the build is sequenced at the foot so each slice ships independently.

> **Naming.** Earlier docs called this `/studio`. It's the *artist's* dashboard, not a studio
> product — the route is just a path. This plan keeps the short route **`/studio`** for
> continuity with those references; rename to `/dashboard` if preferred (one-line change). All
> other docs should read "the artist dashboard" wherever they say `/studio`.

## What it manages (all already in D1)

Everything is a query over tables that already exist (`apps/functions/migrations/0001_init.sql`,
`0002_payments.sql`) — D1 being real SQL is the whole reason this is a normal read/write layer,
not a scan:

| Surface | Source table(s) | Today | What the dashboard adds |
|---|---|---|---|
| **Enquiries & flash claims** | `submissions` (`kind`, `email`, `received_at`, `fields` JSON, `image_count`, `email_status`) | written on every form submit | a list + detail view, and a **status lifecycle** |
| **Flash inventory** | `flash_claims` (`piece_id`, `status`, `expires_at`) | atomic reserve on claim | see pending/claimed, **release a stuck hold** |
| **Payments** | `payments` (`status`, `provider`, `amount_pence`, `piece_id`, `paid_at`) | ledger written by `/checkout` + webhook | reconcile, **mark a manual bank-transfer paid**, refund (later) |
| **Bookings** | (new table, ships with `SCHEDULING.md`) | — | **confirm/decline a requested date** |
| **Newsletter consents** | `newsletter_consent` | consent ledger | read-only proof-of-consent lookup |
| **GDPR** | all of the above, keyed on `email` | manual SQL (`DATA-COMPLIANCE.md`) | **delete-by-email** with the paid-payment exemption |

## Where it lives & how it's gated

**The Worker serves it; Cloudflare Access gates it.** The data lives in D1, which only the
Worker can reach, so the dashboard is a small set of **Worker routes under `/studio/*`** (a
server-rendered HTML page + a few JSON endpoints) rather than a page on the public static site
(GitHub Pages can't gate a route, and the marketing bundle shouldn't carry admin code).

- **Auth = Cloudflare Access** (the recommended answer): a zero-code identity gate in front of
  the `/studio/*` routes — an **email one-time-PIN** policy allowing only the artist's address,
  on Cloudflare's free tier. No passwords, sessions, or auth code to build, store, or rotate;
  it pairs with the planned Cloudflare-front consolidation (`ROADMAP.md`). The alternative
  (a shared secret the Worker checks) is more code and a credential to leak/rotate; a full
  login system is overkill for one user.
- **Defense in depth:** the Worker still **verifies the `Cf-Access-Jwt-Assertion`** header on
  every `/studio/*` request (validate the JWT against the Access public keys + the audience tag)
  so the admin routes fail closed even if Access is ever mis-bound. Admin routes are **never**
  added to the public CORS allowlist (`src/lib/http.js`) and carry the existing
  `SECURITY_HEADERS`; they're same-origin, no CORS.
- **Access requires Cloudflare in front of the Worker** — already true (the Worker is on
  Cloudflare). For the static-site marketing pages nothing changes.

```
Artist → studio.beansprout.ink/… (or /studio on the worker)
      → Cloudflare Access (email OTP, artist only)   ← zero-code gate
      → Worker /studio/* routes
            verify Cf-Access-Jwt-Assertion (fail closed)
            → D1 reads/writes (parameterised)
```

## Functional design (the complete surface)

A single, **mobile-first** page (the artist will use it on a phone between clients), styled with
the site's existing tokens (`palette.js`), organised into tabs/sections. Each section below lists
its **view** and its **actions**.

### 1. Inbox — enquiries & flash claims
- **View:** newest-first list of `submissions` (filter by `kind` enquiry/flash, by status, by
  date; search by name/email). Each row: name, kind, date, status, a ⚑ if `email_status='failed'`
  (the artist's own copy didn't send — they can still see it here). Detail view renders the
  `fields` JSON readably (the enquiry answers, placement, size, dates, consents) + `image_count`
  (bytes were never stored — names only).
- **Actions — status lifecycle:** `new → replied → booked → completed`, plus `archived`/`spam`.
  This is the one genuinely new write to `submissions` (needs a `status` column — migration 0003).
  A free-text **note** per submission (artist's private memo) is useful too.
- **Why it matters:** enquiries currently live only in Gmail; a failed artist-email send means a
  lost lead. This makes D1 the durable, manageable record it's already designed to be.

### 2. Flash claims & inventory
- **View:** the `flash_claims` rows joined to the flash catalogue — which pieces are `pending`
  vs `claimed`, with the claimant (from the linked `submission`/`payment`) and the `expires_at`
  hold countdown.
- **Actions:** **release a stuck `pending`** (calls `releaseFlashPiece`) for the rare case a hold
  needs manual clearing; (the lazy TTL sweep already auto-frees abandoned checkout holds).

### 3. Payments & reconciliation
- **View:** `payments` ledger — `awaiting` / `paid` / `failed` / `expired` / `refunded`, amount,
  method (`provider`), piece, linked submission, timestamps. A simple **paid-this-month total**.
- **Actions:**
  - **Mark a manual bank-transfer paid** — for the Monzo bank-transfer route (no webhook), record
    a `provider:'bank'` payment as `paid` and promote the linked flash claim (`promoteFlashClaim`).
    This is the human counterpart to the Stripe webhook.
  - **Refund** (later, with the refunds phase) — call Stripe's refund API for a `paid` Stripe row
    and flip it to `refunded`.
- Reuses `recordPayment` / `markPaymentStatus` / `getPayment` (already in `db.js`).

### 4. Bookings (ships with scheduling)
- **View + actions:** the request/hold queue from `SCHEDULING.md` — **confirm or decline a
  requested date** against the host-studio chair schedule (the manual confirm the scheduling
  model requires). On confirm: write the booking, fire the customer email + `.ics`. This section
  is the dashboard's half of the scheduling feature; it's specced in `SCHEDULING.md` and built
  with it, not before.

### 5. Data & compliance tools
- **View:** look up everything held for an email (the access-request answer in one screen).
- **Actions:** **delete-by-email (erasure)** — runs the `DATA-COMPLIANCE.md` runbook from a
  button, with a **preview-count first**, and the **paid-`payments` exemption enforced** (a paid
  row inside its 6-yr financial-retention window is redacted, not deleted). Logs the action.
- **Newsletter consents:** read-only proof-of-consent lookup (the `newsletter_consent` ledger).

## Data-model additions (migration `0003_dashboard.sql`)

Small and additive — the read surface needs no schema change; only the lifecycle + audit do:

```sql
-- Enquiry/claim management lifecycle + the artist's private memo.
ALTER TABLE submissions ADD COLUMN status TEXT NOT NULL DEFAULT 'new'; -- new|replied|booked|completed|archived|spam
ALTER TABLE submissions ADD COLUMN note   TEXT;                        -- artist's private note
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

-- Audit log — who/what/when for every dashboard write (accountability + undo trail).
CREATE TABLE IF NOT EXISTS admin_actions (
  id         INTEGER PRIMARY KEY,
  actor      TEXT,                 -- the Access identity (email) from the JWT
  action     TEXT NOT NULL,        -- 'status' | 'mark_paid' | 'refund' | 'release' | 'erase' | …
  target     TEXT,                 -- submission/payment/piece id or email
  detail     TEXT,                 -- JSON
  created_at TEXT NOT NULL
);
```
Like `0002`, it's purely additive and only applied when the dashboard ships. Add matching
fail-safe `db.js` helpers (`setSubmissionStatus`, `listSubmissions`, `listPayments`,
`logAdminAction`, `eraseByEmail`).

## Security model

- **Cloudflare Access** in front + **Access-JWT verification** in the Worker (fail closed).
- Admin routes are **same-origin, never in the public CORS allowlist**; `SECURITY_HEADERS` apply.
- **Every write is parameterised** and **audit-logged** (`admin_actions`); reads are read-only.
- **No new secrets in the repo.** Access config lives in Cloudflare; the Worker only needs the
  Access team domain + audience tag (vars, not secrets).
- **D1 Time Travel** (`DATA-COMPLIANCE.md`) is the undo for a mistaken erasure/status change.
- The dashboard is the only place that can read raw personal data over HTTP — so the Access gate
  is part of the compliance posture, not just convenience.

## Build sequence (one PR per slice → `develop`, all gated from slice 1)

1. **Access gate + read-only inbox.** Stand up the Cloudflare Access app on `/studio/*`; Worker
   verifies the JWT; serve the submissions list + detail (read-only). _Delivers the "see my
   enquiries" win with zero write risk._
2. **Status lifecycle.** Migration `0003` (`status`/`note` + `admin_actions`); the status
   write-path + audit log; flash-inventory release.
3. **Payments reconciliation.** Payments list; mark-manual-bank-transfer-paid; the paid-this-month
   total. (Refunds fold in with the payments refund phase.)
4. **GDPR tools.** Delete-by-email with preview + the paid-payment exemption, from a button.
5. **Bookings.** The scheduling confirm/decline queue — ships *with* `SCHEDULING.md`, not before.

Slice 1 is independently valuable and low-risk; later slices add write-paths behind the same gate.

## Open questions (for the artist / owner)

- **Route + host:** `/studio` on the Worker, or a `dashboard.beansprout.ink` subdomain (cleaner
  Access binding)? And keep the `/studio` name or rename to `/dashboard`?
- **Lifecycle stages:** is `new → replied → booked → completed (+ archived/spam)` the right set,
  or does the artist think in different stages?
- **Notifications:** should a new enquiry also ping the artist (it already emails them) — or is
  the dashboard badge enough?
- **Refunds in-dashboard** vs done in the Stripe dashboard (Stripe's own UI is already a capable
  admin surface — the dashboard may only *need* to reconcile, not re-implement refunds).

## Non-goals

Multi-user/roles, a public "studio" page, analytics dashboards (see `ANALYTICS.md`), content
editing (that's the CMS — `CMS.md`), and anything the **Stripe dashboard** already does well
(detailed payment search, disputes) — link out rather than rebuild.

---

_Companion docs: payments (`PAYMENTS.md` — the reconciliation data, build spec, and operator
runbook), scheduling (`SCHEDULING.md` — the bookings section), compliance (`DATA-COMPLIANCE.md` —
the erasure runbook the GDPR tools wrap)._
