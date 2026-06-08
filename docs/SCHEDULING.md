# Scheduling / appointment booking — backlog stub

A **scheduling layer** so a flash claim (and later a custom enquiry) can move toward a
**confirmed date** instead of an open-ended email thread. **Post-launch backlog — not
built, not blocking the apex cutover.** This is a deliberately short stub: the model and
constraints below are the durable part; the detailed architecture/migration sketch and
the full question list were trimmed to avoid going stale before the work starts (see git
history for the earlier long-form spec). Flesh it back out when it's picked up.

> Co-ships with the payments track ([`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md) — the
> live **Stripe** plan; superseded manual-links decision in
> [`PAYMENTS-PLAN.md`](./PAYMENTS-PLAN.md)) — the deposit is the booking-confirmation
> trigger, and scheduling reuses its reserve/TTL/`/studio`/customer-email primitives —
> **several of which the shipped payments backbone already provides** (the 48h hold
> `expires_at` + lazy stale-release, `promoteFlashClaim`, and the webhook customer-email).
> Couples with the ROADMAP "artist-facing view" (same admin surface).

## The model: request / hold + manual confirm (not instant booking)

Two facts force the shape:

1. **Beansprout is a guest artist at Tiny Knives** — bookable time is gated by the host
   studio's chair schedule, which the site doesn't own.
2. **The date still needs a human confirm.** Under the **Stripe** payments direction
   ([`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md)) the webhook *can* auto-learn a deposit
   was paid — so payment is no longer the manual bottleneck it was under the original
   PayPal/Monzo plan. What remains manual is **fact 1**: the chair schedule the site doesn't
   own, so a specific date can't be auto-granted on payment.

So a slot **cannot** be self-serve "pick → pay → instantly booked": even with the deposit
auto-confirmed, the **date** still needs a human confirm against Tiny Knives' chair time,
exactly like a flash claim goes `pending` → (artist confirms) → `claimed`.
The realistic design is **request/hold + manual confirm** — the calendar-shaped sibling
of the flash inventory. **Flash goes first** (fixed scope → a slot can be offered at
claim time); **custom enquiries are propose-after-triage** (the quote comes first, via a
tokenised "choose your time" magic link).

## Why it's mostly recombining what exists

The hard primitives already ship: atomic one-of-a-kind reserve (`reserveFlashPiece`,
`ON CONFLICT DO NOTHING`), reserve→persist→email with rollback, a live-availability read
endpoint (`flash-status`), timing capture on the forms (`date_from`/`days[]` /
`available_dates`), and — new with the payments backbone — a **hold TTL** (`expires_at` +
lazy stale-release) and a `pending → claimed` promotion (`promoteFlashClaim`). The genuinely **new** problem is *availability* — knowing which slots
to offer. Simplest workable answer: **(a) artist-defined windows in `/studio`** minus
held/confirmed slots, plus **(b) an `.ics` invite on confirm** (cheap). A two-way
calendar free-busy read (option c) is deferred — high blast-radius (OAuth/token storage).

## Build vs buy

An embedded booker (Cal.com/Calendly/Acuity/Square) ships in days and handles timezones/
reminders/reschedule — **but** it's a SaaS dependency that moves booking data off-stack
(same reason Sanity lost in `CMS.md`), needs CSP `frame-src` widening, and most assume
instant card-confirmed booking — which still **clashes with the host-studio chair-time
constraint** (the site can't promise a slot it doesn't own), even though the Stripe deposit
itself could now confirm automatically.
**Leaning:** build the request/hold + manual-confirm flow on the existing Worker + D1 —
it's the more consistent answer. Pragmatic middle path if the artist wants self-serve sooner:
trial an embedded booker for **flash only** while custom enquiries stay on the email flow.

## Open — for the artist to confirm before any build

How much customers self-serve (request vs instant); flash-first vs enquiries too;
build-vs-buy; deposit-gated + hold TTL; where availability lives (and whether it lands on
their calendar); Tiny Knives chair-time constraints; consultation vs session; multi-session
pieces; session length/buffer; reschedule/cancel self-serve + cut-off (must match the
cancellation terms in the copy); reminders (email vs paid SMS); timezone (UK-only?).

**Out of scope by design:** instant card-confirmed booking, two-way calendar sync,
customer accounts (bookings use tokenised magic-links). Ships to staging only — no
`apps/web/public/CNAME` (deploy guardrail in `CLAUDE.md`).
