# Scheduling / appointment booking — plan

A **scheduling layer** so a flash claim (and later a custom enquiry) can move toward a
**confirmed date** instead of an open-ended email thread. **Post-launch backlog — not built,
not blocking the apex cutover.** A stub of the durable decisions + the questions for the artist.

> Co-ships with the payments track ([`PAYMENTS.md`](./PAYMENTS.md)). **A paid deposit is the
> booking-confirmation trigger**, and scheduling reuses the shipped payments primitives (see
> "What it reuses" below). The **confirm / decline action lives in the artist dashboard**
> ([`DASHBOARD.md`](./DASHBOARD.md)) — the same gated D1 surface the payments reconciliation
> and GDPR erasure UI use; scheduling adds one action to it, not a new app.

## The model: request / hold + manual confirm (not instant booking)

Two facts force the shape, and neither is going away:

1. **Beansprout is a guest artist at Tiny Knives.** Bookable chair time is gated by the host
   studio's schedule, which **the site does not own**. We can never auto-grant a specific date.
2. **The date still needs a human confirm.** The Stripe webhook *can* auto-learn a deposit was
   paid — payment is no longer the manual bottleneck; what stays manual is **fact 1**. A paid
   deposit confirms the customer is *committed*; it cannot confirm the *slot*.

So a slot **cannot** be self-serve "pick → pay → instantly booked". The design is
**request/hold + manual confirm** — the calendar-shaped sibling of the flash inventory,
mirroring `pending → (artist confirms) → claimed`. **Flash goes first** (fixed scope → a slot
can be offered at claim time); **custom enquiries are propose-after-triage** — the quote comes
first, then a tokenised "choose your time" magic link (no full price is ever auto-generated;
see [`PAYMENTS.md`](./PAYMENTS.md)). This model is **the same whether we build or buy** — it's
a product constraint, not a tech choice.

## "Google-Calendar-level control" — what it means here

The artist wants **"full Google-Calendar-level of control over bookings"**: their own calendar
as the source of truth for availability, two-way sync, direct manipulation from the calendar
UI, and **no second place to keep in sync by hand**. The honest read: a hand-rolled
availability editor in D1 is *not* that — it's a second calendar to maintain. Delivering it
means the **Google Calendar API is the control surface**, whichever route we take — so
build-vs-buy is really *"who owns the Google Calendar integration: a SaaS, or our Worker."*

## Build vs buy — the verdict

**Build it on the Worker; don't adopt a SaaS booker.** The vendor read-out, in one paragraph:
**Calendly, Acuity, SavvyCal and Google Appointment Schedules all assume instant card-confirmed
booking with no real approval gate** — which clashes with the host-studio chair-time constraint
(we can't promise a slot we don't own) — and the SaaS options move booking data **off-stack**
(the same reason Sanity lost in [`CMS.md`](./CMS.md); keeping data on-stack with no cookie
banner owed is a standing project value). **Cal.com is the only buy option that natively does
request/approval** ("Requires Confirmation": request sits pending until the host accepts or
declines), with two-way Google Calendar sync and a Stripe deposit app — but Cloud is off-stack,
and self-hosting it is a **heavyweight Next.js + Postgres second app** with its own PII store,
OAuth app and upgrades, bolted next to a deliberately tiny Worker+D1. We'd take on most of the
build route's integration work *anyway* (the OAuth app, the Stripe deposit wiring) **plus** a
whole framework to operate.

**The cost of the build route is one thing: OAuth/token blast radius.** Freebusy + Events
aren't service-account-able for a personal Gmail calendar — they need **OAuth with the artist's
consent and a stored refresh token**: a long-lived third-party credential the Worker must hold
encrypted and never log, plus token refresh, a re-consent path, and Google's sensitive-scope
app verification. That's a meaningfully bigger security/ops surface than anything currently on
the Worker (today: only Resend + Stripe API keys, no user-delegated OAuth) — feasible, but the
single biggest reason this was deferred. Any Google failure must **fail safe** (degrade to
manual confirm with no calendar write), consistent with the rest of the storage layer.

**The recommendation is a two-step build:**

1. **Ship request/hold + manual confirm *without* live calendar sync first** (the cheap 80%):
   artist-defined session windows in D1, confirm/decline in the artist dashboard, an **`.ics`
   invite** on confirm. Zero OAuth blast radius; proves the flow.
2. **Then add the Google Calendar API as the control surface** (Freebusy read + tentative/
   confirmed event writes) — the step that actually delivers the requested control. Gate it
   behind its own flag, like the payments backbone, so step 1 ships independently.

**When buying would win, and the off-ramp:** if the artist wants self-serve sooner than the
build lands, **trial Cal.com Cloud for flash only** (instant-confirm is *tolerable* for flash:
fixed piece, deposit = full payment) while custom stays on the email/quote flow — a temporary
bridge, not the destination. One nuance to verify in Stripe test mode first: whether "Requires
Confirmation" + payment charges at request time or only on approval.

## What it reuses from the payments track

The shipped payments backbone provides the spine, fail-safe throughout ([`PAYMENTS.md`](./PAYMENTS.md)):

- the **atomic one-of-a-kind reserve** (`reserveFlashPiece`) with the 48h hold `expires_at`,
  **lazy stale-release** (`expirePendingClaims`, wired into `getFlashClaims`) and rollback
  (`releaseFlashPiece`);
- the **`pending → claimed` promotion** (`promoteFlashClaim`) driven by the verified webhook,
  the **payments ledger** (`recordPayment` / `markPaymentStatus`) and the **webhook
  customer-email**;
- the **read-endpoint shape** of `flash-status` for exposing offerable slots fail-safe;
- the **`/studio` artist dashboard** ([`DASHBOARD.md`](./DASHBOARD.md)) for the confirm/decline
  queue — confirm clears the hold and emails the customer; decline releases it and refunds the
  deposit via the payments refund flow.

The `requested → held → confirmed` slot lifecycle is a direct generalisation of the flash
pattern (slot key instead of piece id). Rollout mirrors the payments isolation discipline:
additive Worker routes, flagged off, fail-safe, staging-only until the apex cutover.

## Open — for the artist to confirm before any build

- **Control bar:** is the step-1 `.ics`/dashboard-windows flow enough to start, or is **live
  Google Calendar sync (step 2) a day-one requirement**? (Load-bearing — step 2 is where the
  OAuth blast radius lives.)
- **Build vs the Cal.com bridge:** happy to build the two-step plan, or trial the Cal.com
  off-ramp above?
- **Which calendar** is the source of truth (personal Gmail vs a dedicated bookings calendar vs
  a Tiny Knives shared calendar) — affects OAuth scope and what Freebusy reads.
- **Self-serve depth:** customers *request* (our recommendation) vs *instant* for flash;
  flash-first vs enquiries too.
- **Session shape:** consultation vs session; multi-session pieces; length + buffer; flash
  full-payment vs deposit-to-hold (open decisions in [`PAYMENTS.md`](./PAYMENTS.md)).
- **Tiny Knives chair-time:** which days/hours can be offered, and how the artist keeps that
  current (this is *why* a human confirm exists).
- **Reschedule/cancel:** self-serve via tokenised magic link + a cut-off window, which **must
  match the deposit copy** ([`COPY-REVIEW.md`](./COPY-REVIEW.md)).
- **Reminders:** email-only to start (SMS is paid)? Timezone (UK-only assumed)?

**Out of scope by design:** instant card-confirmed booking that bypasses the chair-time
confirm; customer accounts (bookings use tokenised magic-links).

## Key sources (verified June 2026 — re-confirm before committing)

- Cal.com "Requires Confirmation" + paid bookings: https://cal.com/features/requires-confirmation · https://cal.com/help/bookings/paid-bookings
- Google Appointment Schedules — instant-confirm only, Stripe-only/Workspace-gated payments: https://support.google.com/calendar/answer/13762729
- Google Calendar API — Events (tentative/confirmed, transparency) + Freebusy: https://developers.google.com/workspace/calendar/api/v3/reference/events
- Google OAuth refresh-token storage best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
