# Scheduling / appointment booking — plan

A **scheduling layer** so a flash claim (and later a custom enquiry) can move toward a
**confirmed date** instead of an open-ended email thread. **Post-launch backlog — not built,
not blocking the apex cutover.** This doc is the durable plan: the model, the build-vs-buy
call against the artist's "Google-Calendar-level control" requirement, the recommendation, an
implementation sketch for the recommended path, and the questions left for the artist.

> Co-ships with the payments track ([`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md) — the live
> **Stripe** plan; build spec [`PAYMENTS-STRIPE-BUILD.md`](./PAYMENTS-STRIPE-BUILD.md);
> superseded manual-links decision in [`PAYMENTS-PLAN.md`](./PAYMENTS-PLAN.md)). **A paid
> deposit is the booking-confirmation trigger**, and scheduling reuses primitives the shipped
> payments backbone already provides: the atomic one-of-a-kind reserve, the 48h hold
> `expires_at` + lazy stale-release, the `pending → claimed` promotion, and the webhook
> customer-email. The **confirm / decline action lives in the artist dashboard**
> ([`DASHBOARD.md`](./DASHBOARD.md)) — the same gated D1 surface (Cloudflare Access) the
> payments reconciliation and GDPR erasure UI use; scheduling adds one action to it, not a new app.

## The model: request / hold + manual confirm (not instant booking)

Two facts force the shape, and neither is going away:

1. **Beansprout is a guest artist at Tiny Knives.** Bookable chair time is gated by the host
   studio's schedule, which **the site does not own**. We can never auto-grant a specific date.
2. **The date still needs a human confirm.** Under the Stripe direction the webhook *can*
   auto-learn a deposit was paid — so payment is no longer the manual bottleneck it was under
   the old PayPal/Monzo plan. What stays manual is **fact 1**: the chair schedule. A paid
   deposit confirms the customer is *committed*; it cannot confirm the *slot*.

So a slot **cannot** be self-serve "pick → pay → instantly booked". The realistic design is
**request/hold + manual confirm** — the calendar-shaped sibling of the flash inventory,
mirroring `pending → (artist confirms) → claimed`:

- **Flash goes first** (fixed scope → a slot can be offered at claim time).
- **Custom enquiries are propose-after-triage** — the quote comes first, then a tokenised
  "choose your time" magic link (no full price is ever auto-generated; see
  [`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md)).

This model is **the same whether we build or buy** — it's a product constraint, not a tech
choice. The build-vs-buy question below is purely *how* to deliver request/hold + manual
confirm with the control the artist wants.

## What "Google-Calendar-level control" actually means

The artist wants **"full Google-Calendar-level of control over bookings."** Unpacked, that's:

- **The artist's own calendar is the source of truth** for availability — they block/free time
  the way they already do, in the tool they already live in, against Tiny Knives' chair days.
- **Two-way sync**: a booking taken on the site lands on the calendar; time blocked on the
  calendar removes it from the site's offerable slots (no double-booking).
- **Direct manipulation**: drag, edit, reschedule, cancel, annotate — all from the calendar UI,
  not a bespoke admin nobody maintains.
- **No second place to keep in sync by hand.** The failure mode to avoid is the artist
  managing availability in *both* a SaaS booker *and* their Google Calendar.

The honest read: a hand-rolled availability editor (artist-defined windows in D1) is **not**
that — it's a second calendar to maintain. Delivering genuine Google-Calendar control means the
**Google Calendar API is the control surface**, whichever route we take. That reframes
build-vs-buy: it's *"who owns the Google Calendar integration — a SaaS, or our Worker."*

## Build vs buy — with Google-Calendar control front and centre

### Buy — an embedded SaaS booker

For each, against our five must-haves: two-way Google Calendar sync · request/approval (not
instant-confirm) bookings · embeddable iframe · data residency (on/off our stack) · Stripe
deposit tie-in.

| Tool | Two-way GCal | Request/approve | Embed | Data residency | Stripe deposit |
|---|---|---|---|---|---|
| **Cal.com (cloud)** | ✅ OAuth, bidirectional | ✅ **"Requires Confirmation"** opt-in: request → pending → host accepts/declines [1] | ✅ | ⚠️ SaaS (US co.); EU/self-host possible | ✅ Stripe app; deposit/no-show-fee/held-payment options [4] |
| **Cal.com (self-host)** | ✅ (you supply OAuth creds) [2] | ✅ same feature | ✅ | ✅ **your infra** (AGPLv3) | ✅ your Stripe keys |
| **Calendly** | ✅ bidirectional, free Standard+ [3] | ⚠️ no true opt-in approval; "reconfirm" workflow is a reminder, not a gate [3] | ✅ | ❌ SaaS, off-stack | ⚠️ paid-plan add-on; Stripe/PayPal, instant-confirm oriented |
| **Acuity (Squarespace)** | ✅ | ⚠️ client self-books/reschedules/pays; control is calendar-side, not an approval gate [3] | ✅ | ❌ SaaS, off-stack | ✅ deposits/full, Stripe/Square/PayPal |
| **SavvyCal** | ✅ | ⚠️ polish over meeting-scheduling; no studio-style approval gate *(not independently verified)* | ✅ | ❌ SaaS | ⚠️ limited |
| **Google Appointment Schedules** | ✅ **native** (it *is* Google Calendar) | ❌ **instant-confirm only**, no approval gate [5] | ✅ (book button/embed) | ⚠️ Google (the calendar's home anyway) | ⚠️ **Stripe only, full-payment, redirects to Stripe; needs eligible Workspace edition; admin-gated** [5][6] |

Read-out:

- **Calendly / Acuity / SavvyCal** all assume **instant card-confirmed** booking and have no
  real *approval gate* — which **clashes with the host-studio chair-time constraint** (we can't
  promise a slot we don't own), and they move booking data **off-stack** (the same reason Sanity
  lost in [`CMS.md`](./CMS.md), and a standing project value: keep data on-stack, no cookie
  banner owed). They're the weakest fit.
- **Google Appointment Schedules** gives the *most* native calendar control (it's literally the
  artist's calendar) but is **instant-confirm only** — there's no "request → approve" — so it
  fails fact 1 outright, and its payments are Stripe-only / full-payment / redirect / gated on a
  paid Workspace edition [5][6]. Wrong shape for deposit-confirms-a-guest-slot.
- **Cal.com is the only buy option that natively does request/approval.** "Requires
  Confirmation" turns a booking into a request that sits **pending until the host accepts or
  declines** [1] — exactly fact 1 — with two-way Google Calendar sync and a Stripe app that can
  take a deposit / held payment [4]. **Cloud** is fastest but off-stack; **self-host** keeps it
  on-stack (AGPLv3) [2] but is a **heavyweight Next.js + Postgres app** — a second deploy target
  next to our deliberately tiny Worker+D1, with its own DB of customer PII, upgrades, and OAuth
  app to run. *(One nuance not fully verifiable from public docs: the exact **charge timing**
  when "Requires Confirmation" **and** payment are both on — whether the customer is charged at
  request time or only after the host accepts, and how that interacts with held payments [4].
  Verify in test mode before relying on it as the deposit-confirms-booking handoff.)*

### Build — a Worker+D1 booking layer on top of the Google Calendar API

The idea: **the artist's Google Calendar is the control surface** (they want
Google-Calendar-level control — so *use Google Calendar*), and our Worker is the thin booking
brain in front of it:

- **Availability source** = the Google Calendar **Freebusy API** [8] over the artist's calendar
  (optionally a dedicated "bookable" calendar for Tiny Knives chair days). The site's offerable
  slots = artist-defined session windows **minus** busy intervals. The artist manages
  availability by blocking time in Google Calendar — the one place, exactly the control they
  asked for.
- **On a confirmed booking**, the Worker writes the event to the calendar via the Events API,
  using `status` (`tentative` on hold, `confirmed` on confirm) and `transparency`
  (opaque = blocks time) [7] — so a held slot shows as tentative and a confirmed one blocks the
  chair. Two-way: site → calendar on booking; calendar → site via Freebusy on read.
- **Deposit-confirms-booking** stays exactly as the payments track already built: `/checkout` →
  reserve `pending` (+48h `expires_at`) → Stripe → webhook promotes → on success the Worker flips
  the calendar event `tentative → confirmed`. **It reuses the shipped primitives wholesale**:
  `reserveFlashPiece` with the hold TTL (`apps/functions/src/lib/db.js:126`), lazy stale-release
  (`expirePendingClaims`, `apps/functions/src/lib/db.js:191`; wired into `getFlashClaims` at
  `apps/functions/src/lib/db.js:101`), `promoteFlashClaim` (`apps/functions/src/lib/db.js:173`),
  the payments ledger (`recordPayment`/`markPaymentStatus`, `apps/functions/src/lib/db.js:213`,
  `:259`), and the webhook customer-email.

**The cost of this route is one thing: OAuth/token blast radius.** Freebusy + Events are *not*
service-account-able for a personal Gmail calendar — they need **OAuth with the artist's
consent and a stored refresh token**, which Google's docs flag as a long-lived secret to store
encrypted at rest and never log [9][10]. That introduces, for the first time on this stack, a
**long-lived third-party credential the Worker must hold**:

- A one-time OAuth consent flow (artist authorises; we capture the refresh token).
- Encrypted storage of that refresh token (Cloudflare secret or an encrypted D1 column), token
  refresh logic, and a re-consent path if it's ever revoked.
- A Google Cloud OAuth app + **verification** for the sensitive Calendar scope [8].
- A wider failure surface: a Google outage / expired token must **fail safe** (fall back to
  manual confirm with no calendar write) — consistent with the rest of `db.js`, but new code.

That's a meaningfully bigger security/ops surface than anything currently on the Worker (today
it holds only Resend + Stripe API keys, no user-delegated OAuth). It's *feasible* — a few
hundred lines and one OAuth dance — but it's the single biggest reason this was deferred.

## Recommendation

**Phase the build, and reach Google-Calendar control via the Google Calendar API — don't adopt
a SaaS booker.** Concretely, a **two-step build**:

1. **Ship request/hold + manual confirm *without* live calendar sync first** (the cheap 80%).
   Availability = artist-defined session windows (set in the artist dashboard, persisted to D1)
   minus held/confirmed D1 rows; **confirm/decline lives in the artist dashboard**
   ([`DASHBOARD.md`](./DASHBOARD.md)); on confirm, email an **`.ics` invite** the artist accepts
   into Google Calendar in one tap. This delivers a working booking flow with **zero OAuth blast
   radius**, reusing the payments primitives almost entirely. It is *not yet* full
   Google-Calendar control — it's a second availability source — but it ships in days and proves
   the flow.
2. **Then add the Google Calendar API as the control surface** (Freebusy read + tentative/
   confirmed event writes), which is the step that actually delivers *"Google-Calendar-level
   control"* — the artist manages availability in Google Calendar and nowhere else. Gate this
   behind a flag like the payments backbone, so step 1 ships independently.

**Why build over buy:**

- **Only Cal.com even fits the model** (request/approval); Calendly/Acuity/SavvyCal/Google
  Appointment Schedules are all instant-confirm and fail the guest-artist constraint.
- **Cal.com's cost is the same off-stack/SaaS downside we've repeatedly rejected** (Sanity in
  [`CMS.md`](./CMS.md)) — and self-hosting it is a **heavyweight second app** (Next.js +
  Postgres + its own PII store + OAuth app + upgrades) bolted next to a deliberately tiny
  Worker+D1. We'd take on most of the build route's integration work *anyway* (the OAuth app, the
  Stripe deposit wiring) **plus** a whole framework to operate.
- **The build reuses ~all the shipped payments scaffolding** — the reserve/TTL/stale-release/
  promote/ledger/webhook-email spine already exists and is fail-safe (`db.js` cited above). The
  genuinely new code is the OAuth+Calendar adapter — and that single adapter is *also* what any
  on-stack SaaS (self-hosted Cal.com) would force us to stand up.
- **It keeps booking data on-stack** (D1), no cookie banner owed, no CSP `frame-src` widening for
  a third-party booker — all standing project values.

**When buying would win, and the off-ramp:** if the artist wants self-serve sooner than the
build lands, **trial Cal.com Cloud for flash only** (instant-confirm is *tolerable* for flash:
a fixed piece, deposit = full payment, less chair-day ambiguity than a multi-hour custom
session), while custom enquiries stay on the email/quote flow. Treat it as a temporary bridge,
not the destination — and **verify in Stripe test mode that "Requires Confirmation" + payment
charges only on approval** before trusting it as the deposit gate (the unverified nuance above).

## Implementation sketch — the recommended build

### Data model — reuse, don't reinvent

No new tables for step 1; one small one for step 2. (Migration numbering: the artist dashboard
ships `0003_dashboard.sql`, so scheduling's is **`0004_scheduling.sql`**.)

- **Flash bookings ride the existing rows.** A flash claim already reserves `flash_claims`
  (`pending → claimed`) with an `expires_at` hold (`apps/functions/migrations/0002_payments.sql:45`),
  and the chosen date(s) are already captured on the form as `available_dates`
  (`apps/functions/src/handlers/enquiry.js`). The *confirmed date* is the only new datum —
  store it on the payment/submission, or add `flash_claims.booked_date TEXT`.
- **Custom bookings** need a slot record. Add a thin `bookings` table in `0004_scheduling.sql`
  (same numbered-SQL pattern as `0001`/`0002`):
  ```sql
  CREATE TABLE IF NOT EXISTS bookings (
    id            TEXT PRIMARY KEY,    -- our ref
    kind          TEXT NOT NULL,       -- 'flash' | 'custom'
    submission_id TEXT,                -- → submissions.id
    payment_id    TEXT,                -- → payments.id (the deposit)
    status        TEXT NOT NULL,       -- 'requested' | 'held' | 'confirmed' | 'cancelled'
    slot_start    TEXT,                -- ISO 8601
    slot_end      TEXT,
    gcal_event_id TEXT,                -- set in step 2
    expires_at    TEXT,                -- hold TTL, mirrors flash
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  ```
  The `requested → held → confirmed` lifecycle and `expires_at` stale-release are **direct
  copies of the flash pattern** — generalise `reserveFlashPiece`/`expirePendingClaims`/
  `promoteFlashClaim` (`apps/functions/src/lib/db.js:126`, `:191`, `:173`) to a slot key rather
  than a piece id, or add slot-shaped siblings. Same fail-safe discipline as the rest of `db.js`.

### The artist-dashboard confirm action

The **confirm / decline** lives in the artist dashboard ([`DASHBOARD.md`](./DASHBOARD.md)) — the
gated D1 surface behind Cloudflare Access, the same one the payments reconciliation and erasure
UI use. It lists `requested`/`held` bookings and offers two buttons:

- **Confirm** → `bookings.status = 'confirmed'`, clear `expires_at`, send the customer the
  confirmation + `.ics` (step 1) / write the `confirmed` calendar event (step 2), email the
  artist a copy.
- **Decline** → `cancelled`, release the hold (`releaseFlashPiece` analogue), refund the deposit
  if taken (Stripe refund — Phase 3 polish in [`PAYMENTS-STRIPE-BUILD.md`](./PAYMENTS-STRIPE-BUILD.md)),
  email the customer.

For **custom**, the artist quotes first (offline), which issues the tokenised "pay your deposit"
magic link; **deposit paid → `held`**, and the artist then confirms the *date* in the dashboard
against Tiny Knives' chair days. For **flash**, the customer picks date(s) at claim, pays the
full price, and the dashboard confirm is a quick date-OK against the chair schedule.

### Availability source

- **Step 1:** artist-defined session windows (day-of-week + time blocks, session length, buffer)
  stored in D1 and editable in the artist dashboard; offerable slots = windows **minus**
  `held`/`confirmed` `bookings` rows. The static `/enquire`/flash flow reads them via a small
  read endpoint (the **same shape as `flash-status`** — `getFlashClaims`,
  `apps/functions/src/lib/db.js:101` — fail-safe to "no slots, ask by email").
- **Step 2:** offerable slots = windows **minus** Google Calendar **Freebusy** busy intervals
  [8], so the artist's own calendar (incl. Tiny Knives chair blocks they add) is the truth. This
  is the step that delivers the requested control.

### Calendar sync / .ics

- **Step 1 — `.ics` invite** on confirm (cheap, no OAuth): generate a VEVENT, attach to the
  confirmation email; the artist taps to add it to Google Calendar. One-way, manual, zero blast
  radius.
- **Step 2 — Google Calendar API** (the real sync): on `held` write a `tentative` event; on
  `confirmed` flip to `confirmed` + `transparency: opaque` (blocks the chair) [7]; on `cancelled`
  delete it. OAuth refresh token stored **encrypted** (never logged), token-refresh + re-consent
  paths, sensitive-scope app verification [9][10]. **Fail safe**: any Google error degrades to the
  step-1 manual/`.ics` path — never blocks a real booking, consistent with `db.js`.

### Reminders

Reuse the Resend pattern (`apps/functions/src/handlers/enquiry.js`, the webhook receipt). A
booking reminder needs a **time trigger** — a Cloudflare **Cron Trigger** (`scheduled()` export,
already mooted as the belt-and-braces stale-sweep in
[`PAYMENTS-STRIPE-BUILD.md`](./PAYMENTS-STRIPE-BUILD.md) §5) scans for `confirmed` bookings ~24–48h
out and emails the customer. **Email-only first**; SMS is paid and deferred. Keep it cheap and
fail-safe.

### Reschedule / cancel

- **Customer-initiated**, via the tokenised magic link (no accounts — same as the
  deposit/booking links): a self-serve reschedule moves the slot back to `requested`/`held` (so
  the date re-enters the artist's confirm queue, because the chair constraint still applies); a
  cancel sets `cancelled` + frees the slot + (step 2) deletes the calendar event.
- **Cut-off** must match the **cancellation/deposit terms in the site copy** (deposit
  forfeit/refund window — see [`COPY-REVIEW.md`](./COPY-REVIEW.md) and the deposit rule in
  [`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md)). Refund handling = the Phase 3 Stripe refund flow.

### Isolation / rollout

Mirror the payments backbone discipline: **additive Worker routes, flagged off, fail-safe**, no
`apps/web` change until a build flag flips the UI (see
[`PAYMENTS-STRIPE-BUILD.md`](./PAYMENTS-STRIPE-BUILD.md) "Isolation"). Step 2's Google OAuth is its
own flag on top of step 1. **Ships to staging only** until the apex cutover — no
`apps/web/public/CNAME` (deploy guardrail in `CLAUDE.md`).

## Open — for the artist to confirm before any build

- **Control bar:** is the step-1 `.ics`/dashboard-windows flow enough to start, or is **live
  Google Calendar sync (step 2) a day-one requirement**? (This is the load-bearing question —
  step 2 is where the OAuth blast radius lives.)
- **Build vs the Cal.com bridge:** happy to build the two-step plan, or trial **Cal.com Cloud for
  flash only** as a temporary self-serve bridge while custom stays on email? *(If Cal.com:
  test-mode-verify charge-on-approval first.)*
- **Which calendar** is the source of truth (personal Gmail vs a dedicated "Beansprout bookings"
  calendar vs a Tiny Knives shared calendar) — affects OAuth scope and what Freebusy reads.
- **Self-serve depth:** customers *request* (our recommendation) vs *instant* for flash; flash-
  first vs enquiries too.
- **Session shape:** consultation vs session; multi-session pieces; session length + buffer;
  flash full-payment vs deposit-to-hold (see [`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md) open
  decisions).
- **Tiny Knives chair-time:** which days/hours can be offered, and how the artist keeps that
  current (this is *why* a human confirm exists).
- **Reschedule/cancel:** self-serve + the cut-off window, which **must match the cancellation/
  deposit copy**.
- **Reminders:** email-only to start (SMS is paid)? Timezone (UK-only assumed)?

**Out of scope by design:** instant card-confirmed booking that bypasses the chair-time confirm;
customer accounts (bookings use tokenised magic-links). Ships to staging only.

## Sources

Codebase claims cite `file:line` inline. Researched facts (verified June 2026; one nuance
flagged unverified in the Cal.com row):

1. Cal.com — Requires Confirmation (opt-in / pending → accept-decline): https://cal.com/features/requires-confirmation · https://cal.com/docs/api-reference/v2/bookings/decline-a-booking
2. Cal.com — self-host + Google Calendar OAuth setup: https://cal.com/docs/self-hosting/apps/install-apps/google
3. Calendly / Acuity — two-way Google Calendar sync, reconfirm-as-reminder, self-book/pay model: https://help.calendly.com/hc/en-us/articles/1500005846741 · https://acuityscheduling.com/learn/calendly-alternatives
4. Cal.com — paid bookings, deposits, no-show/held payments (Stripe): https://cal.com/help/bookings/paid-bookings · https://cal.com/blog/time-based-cancellation-fees-for-no-show
5. Google Calendar Appointment Schedules — paid bookings (Stripe-only, redirect, instant-confirm, Workspace-edition/admin-gated): https://support.google.com/calendar/answer/13762729 · https://support.google.com/a/answer/13765946
6. Stripe × Google Workspace payments in Calendar: https://stripe.com/newsroom/news/google-and-stripe
7. Google Calendar API — Events (status tentative/confirmed, transparency opaque/transparent): https://developers.google.com/workspace/calendar/api/v3/reference/events
8. Google Calendar API — Freebusy query + scopes: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query · https://developers.google.com/workspace/calendar/api/auth
9. Google OAuth 2.0 — web-server flow + refresh tokens (long-lived, secure storage): https://developers.google.com/identity/protocols/oauth2/web-server
10. Google OAuth — best practices (store tokens encrypted at rest, never in plaintext): https://developers.google.com/identity/protocols/oauth2/resources/best-practices

*Tool features, pricing, and method availability are 2026-reported and should be re-confirmed on
each vendor's own docs before committing to a route.*
