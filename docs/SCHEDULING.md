# Scheduling / appointment booking — plan & open questions

Plan of work for adding a **scheduling layer** to Beansprout — letting a flash claim (and,
later, a custom enquiry) move toward a **confirmed date** rather than living as an open-ended
email thread. This is a **design/spec document for future work**; **nothing here is wired
yet**. Architecture context: [`CLAUDE.md`](../CLAUDE.md); backlog/sequencing:
[`ROADMAP.md`](./ROADMAP.md); the deposit mechanics it sits on top of:
[`PAYMENTS-PLAN.md`](./PAYMENTS-PLAN.md).

> **Status:** planned, **post-go-live switch-over feature — not MVP.** The site ships
> first (clears the GDPR + real-images blockers and the apex cutover); scheduling is a
> later track, and several product decisions below are **Roxy's to confirm before any
> build starts**. See [§8 — For Roxy to confirm](#8--for-roxy-to-confirm).

---

## 1. What "scheduling" means here (and what it deliberately is *not*)

A tattoo booking is **consultative**, not a commodity slot: the artist scopes the idea,
estimates the chair time, and takes a deposit before a date is real. Two facts from the
existing system shape every option below:

1. **Beansprout is a guest/resident artist at Tiny Knives** (the studio is the
   `workLocation` in the homepage JSON-LD — Beansprout is the *artist*, not the studio).
   So her bookable availability is **gated by the host studio's chair schedule**, which the
   site does not own. We can never promise a slot the studio hasn't freed.
2. **Deposits are reconciled by hand** ([`PAYMENTS-PLAN.md`](./PAYMENTS-PLAN.md)): PayPal.Me
   + Monzo.me links, **no payment gateway, no webhooks, no auto-confirmation.** Nothing in
   the stack can automatically learn that a deposit was paid.

**Consequence (the single most important design fact):** because payment can't auto-confirm,
**a slot cannot be self-serve "pick → pay → instantly booked".** Confirmation is a *human*
step — exactly as a flash claim today goes `pending` → (artist confirms) → `claimed`. So the
realistic model is **request/hold + manual confirm**, *not* a Calendly-style instant booker.
The scheduling layer is the calendar-shaped sibling of the flash inventory we already have.

This document plans the **request/hold + confirm** model on our own stack, and records the
**buy-an-embed** alternative ([§7](#7--alternative-build-vs-buy)) so the trade-off is on the
record before we commit.

---

## 2. What exists today (the foundation to build on)

The codebase already has most of the primitives a scheduler needs — scheduling is largely
*recombining* them around a date.

| Capability | Where | Reused for scheduling as… |
|---|---|---|
| **Atomic one-of-a-kind reservation** (`INSERT … ON CONFLICT DO NOTHING`) | `reserveFlashPiece()` in `apps/functions/src/lib/db.js` | the **double-booking guard** — a slot is a "piece"; the unique key is the slot, not the design |
| **Reserve → persist → email, with rollback on failure** | `apps/functions/src/handlers/enquiry.js` | reserve-the-slot → persist → notify, release on send failure |
| **Live-availability read endpoint** (static grid + JSON overlay) | `flash-status.js` + `loadLiveStatus()` in `modules/flash.js` | a `/availability` read the slot-picker calls on load |
| **Stale-pending expiry + cron** (planned) | `PAYMENTS-PLAN.md` Phase 2 (`scheduled()` + `[triggers] crons`) | **auto-release of unpaid/unconfirmed held slots** — the same TTL mechanism |
| **Token-protected artist admin** (planned `/studio/`, `/flash-admin`) | `PAYMENTS-PLAN.md` Phase 4 | where Roxy **sets availability and confirms bookings** |
| **Customer-facing email** (planned) | `PAYMENTS-PLAN.md` Phase 2 | booking-hold + confirmation emails, `.ics` invite |
| **Timing capture already collected** | enquiry `date_from`/`date_to`/`days[]`; flash `available_dates` | the **input** a propose/confirm flow turns into a real date |
| **D1 as system of record, fail-safe/open** | `apps/functions/src/lib/db.js` | a `bookings` table joins the family |

The gap is narrow and specific: **a `bookings` table, an availability source, a slot-hold
write-path, and a slot-picker UI** — most of the hard parts (atomic reserve, TTL release,
admin surface, customer email, deposit links) are already designed in `PAYMENTS-PLAN.md`.
**Scheduling and the deposit plan are the same initiative seen from two angles** and should
ship as one coordinated track.

---

## 3. The recommended model — request / hold + manual confirm

A flow that fits the consultative reality, the guest-artist constraint, and manual deposits:

```
FLASH (fixed scope — the strong candidate to go first)
  claim a piece ─▶ choose from offered slots ─▶ Worker HOLDS the slot (pending) + reserves the piece
              ─▶ deposit links shown + emailed (PayPal/Monzo, reference)   [PAYMENTS-PLAN]
              … customer pays out-of-band; artist matches the reference …
              ─▶ artist marks paid in /studio  ─▶ slot CONFIRMED ─▶ .ics invite emailed to both
              (held slot auto-releases after the TTL if unpaid — same cron as a stale claim)

CUSTOM ENQUIRY (needs scoping first — propose-after-triage, never inline)
  enquiry (with rough availability) ─▶ artist triages + quotes
              ─▶ artist proposes 1–3 slots from /studio (or a magic-link "choose your time" page)
              ─▶ customer confirms one ─▶ slot HELD ─▶ emailed deposit link  [PAYMENTS-PLAN]
              ─▶ artist marks paid ─▶ slot CONFIRMED ─▶ .ics invite
```

Why this shape:

- **Flash is the natural first surface.** A flash piece has a *fixed* design, size and
  rough duration, so a slot can be offered at claim time without a consult. Custom enquiries
  can't be — they need the quote first — so they stay **propose-after-triage**.
- **The hold is the flash-reserve pattern with a date.** Holding a slot uses the same atomic
  `ON CONFLICT DO NOTHING` guard, so two people can't take the same slot — proven by the
  flash inventory already.
- **Confirmation stays manual**, consistent with `PAYMENTS-PLAN.md`. No webhook fantasy.
- **Held-but-unpaid slots self-release** on the same TTL/cron the deposit plan already needs,
  so the calendar can't silently fill with dead holds.

---

## 4. Where availability comes from (the genuinely new question)

Holding a slot is easy; **knowing which slots to offer** is the new problem the flash
inventory never had. Options, simplest first:

- **(a) Artist-defined windows in `/studio`** — Roxy publishes recurring availability (e.g.
  "Tue–Sat, 11:00 & 15:00 starts") and one-off blocks/days-off. The site offers those minus
  already-held/confirmed slots. **No calendar integration; Roxy keeps personal commitments
  off those windows.** _Smallest, most predictable; recommended for v1._
- **(b) One-way push to her calendar** — availability still lives in `/studio` (as in **a**),
  but a **confirmed** booking emails an **`.ics` invite** (RFC 5545) she accepts into Google
  Calendar — *and/or* later a direct Google Calendar API write. Gives her a real calendar of
  bookings without exposing her schedule to the site. _Recommended add-on; the `.ics` half is
  cheap (just another Resend send)._
- **(c) Two-way / free-busy read** — the site reads her calendar's busy times (Google Calendar
  API / CalDAV) so it never offers a slot she's personally blocked. Most convenient for her,
  **most complex and highest blast-radius** (OAuth, token storage, a SaaS dependency that cuts
  against the project's self-contained identity). _Defer; only if (a)+(b) prove too manual._

The **guest-artist constraint** sits on top of all three: whatever windows Roxy publishes must
already be **chair time the Tiny Knives studio has agreed** — the site can't see the studio's
diary, so the windows are her promise, not a live truth. Worth a line of copy so a customer
understands a slot is *requested*, then *confirmed*.

---

## 5. Sketch architecture (build-on-stack path)

Everything lands on the **existing Worker + D1 + Resend**, no new infra — the same shape as
the deposit plan it co-ships with.

- **New D1 (`migrations/0003_scheduling.sql`)**
  - `availability` — Roxy's published windows/rules + one-off blocks (or a small ruleset the
    Worker expands into concrete slots on read).
  - `bookings` — `id`, `kind` (`flash` | `enquiry`), `submission_id` (FK to the existing
    `submissions` row), `slot_start`/`slot_end`, `status` (`held` | `confirmed` |
    `cancelled`), `expires_at` (TTL for an unpaid hold), and a link to the deposit fields the
    payments plan adds. **Unique constraint on the slot** → atomic no-double-book, exactly
    like `flash_claims.piece_id`.
- **Worker routes (`src/index.js` + handlers)**
  - `GET /availability` — read-only open-slots map (the `flash-status` pattern; fails safe to
    empty).
  - `POST /book` — atomically **hold** a chosen slot (`ON CONFLICT DO NOTHING`), persist,
    return the deposit instructions (reuses the payments-plan response shape).
  - `/studio` admin (shared with payments) — **set availability**, **propose** slots for an
    enquiry, **confirm** a paid hold (→ `confirmed` + send `.ics`), **cancel/reschedule**.
  - `scheduled()` cron — release `held` slots past `expires_at` (the deposit plan's
    stale-release, generalised to bookings) and send **reminders** (e.g. 24 h before).
- **Front-end (`apps/web`)**
  - `src/js/modules/schedule.js` — a slot-picker that **no-ops when absent** (the house
    rule), fed by `GET /availability`.
  - **Flash:** extend the existing claim modal — after a claim, offer slots, then hand off to
    the payments panel.
  - **Enquiry:** a tokenised **"choose your time"** magic-link page the artist sends
    post-quote (no inline picker — the quote must come first).
- **Calendar:** `.ics` invite on confirm (cheap) first; Google Calendar API push later
  ([§4](#4--where-availability-comes-from-the-genuinely-new-question) option b).

### Reschedule / cancel
Tokenised magic-link (no accounts) to a page that releases the old slot and re-runs the hold
flow, bounded by a **cut-off window** tied to the deposit/cancellation terms the enquire copy
already states. Self-serve reschedule is a Roxy decision ([§8](#8--for-roxy-to-confirm)).

---

## 6. Compliance & sequencing

- **GDPR:** a booking adds appointment date/time + reminder contact, but **no new
  special-category data** beyond what the enquiry already collects (allergies/DOB). Extend
  the `DATA-COMPLIANCE.md` retention + erasure `DELETE` to the `bookings` table; a **completed
  booking** follows the long-retention (insurer/LA) rule, an unpaid lapsed hold prunes with
  its submission.
- **CSP:** building on our own Worker needs **no CSP change** (`connect-src` is already the
  Worker origin). **Embedding** a third-party booker ([§7](#7--alternative-build-vs-buy))
  would need `frame-src`/`connect-src`/`script-src` widening in `src/build/security.js` —
  pairs with the **infra-consolidation** track (`ROADMAP.md`) that unlocks fuller headers.
- **Couples with two parked backlog items** — don't build in isolation:
  - **`PAYMENTS-PLAN.md`** — the deposit gate *is* the booking-confirmation trigger. **Build
    payments first (or together);** scheduling without it is a calendar with no commitment.
  - **P2 artist-facing view** (`ROADMAP.md`) — the `/studio` admin where Roxy sets
    availability and confirms bookings is the **same surface** as the submissions/claims
    admin. One admin app, several jobs.
- **Post-go-live, like everything in the backlog.** Do **not** entangle with the Phase 6 apex
  cutover; ships to the staging Pages URL + Worker only (no `apps/web/public/CNAME`).

Rough order once started: **payments deposit loop** → **availability + `/studio` set-up** →
**flash slot hold + confirm + `.ics`** → **enquiry propose-a-time** → **reminders /
reschedule** → **(optional) calendar free-busy read**.

---

## 7. Alternative — build vs buy

Worth stating plainly, the way `CMS.md` weighed Sanity before choosing the git-backed tool.

- **Buy / embed** (Cal.com, Calendly, SavvyCal, Acuity, Square Appointments): live in days;
  handles the genuinely hard parts for free — timezones/DST, reminders, reschedule/cancel
  UIs, calendar sync, and (with some) the deposit. **But:** it's a SaaS dependency that cuts
  against the project's self-contained, git-backed, Cloudflare-centred identity (the same
  reason Sanity lost in `CMS.md`); booking/personal data leaves the stack; it needs CSP
  `frame-src` widening; branding/locale control is limited; and most assume **instant
  card-confirmed** booking, which **clashes with the studio's manual PayPal/Monzo decision** —
  so the deposit story still wouldn't line up.
- **Build on the existing Worker + D1** (this plan): fits the stack exactly, reuses the
  flash-reserve / TTL / `/studio` / Resend primitives, keeps data in our D1, on-brand, no new
  SaaS. **But:** we own the calendar logic (slot generation, DST, reminders, reschedule) —
  genuinely more than the flash inventory was.

**Leaning:** the **request/hold + manual-confirm build** is the more *consistent* answer
because the manual-deposit decision already rules out the instant-booking model the SaaS tools
are built around — but **this is exactly the kind of scope/effort call to put to Roxy before
committing** ([§8](#8--for-roxy-to-confirm)). A pragmatic middle path: if Roxy wants
self-serve calendar UX sooner than a build can deliver, trial an **embedded booker for flash
only** while custom enquiries stay on the propose-a-time email flow.

---

## 8. For Roxy to confirm

The plan above is a **proposal**, not a decision. These shape what gets built — please
confirm/adjust before anything is firmed up. None require code to answer.

1. **How much should customers self-serve?** Recommended: customers **request/choose** a slot
   but you **confirm** it (consistent with manual deposits). Are you comfortable staying the
   confirming human, or do you actually want hands-off instant booking (which would mean a
   third-party tool and an automated deposit)?
2. **Flash first, enquiries later?** Recommended: **yes** — flash has fixed scope so a slot
   can be offered at claim time; custom work gets a *proposed* time after you've quoted it. Is
   that the right split, or do you not want online dates on flash either?
3. **Build on our own site vs an embedded tool (Cal.com/Calendly/Acuity/Square)?** The trade-
   off in [§7](#7--alternative-build-vs-buy). A tool is faster but is another subscription,
   moves customer data off-site, and assumes card-confirmed booking (vs your PayPal/Monzo).
4. **Deposit-gated?** Recommended: a slot is **held**, then **confirmed only once the deposit
   is paid** (you mark it, as in `PAYMENTS-PLAN.md`). Unpaid holds release automatically after
   a window — **how long should a held slot wait for the deposit?** (the deposit plan suggests
   ~48 h).
5. **Where does your availability live, and do you want it on your calendar?**
   [§4](#4--where-availability-comes-from-the-genuinely-new-question): (a) you publish windows
   in the studio admin; (b) confirmed bookings also drop into your Google Calendar via an
   invite; (c) the site reads your calendar to avoid clashes (most convenient, most complex).
   Recommended **(a) + the (b) invite**.
6. **Tiny Knives chair time.** Any slots offered are only ones the **studio has freed for
   you**, right? Should the site say a date is *requested then confirmed* so no one assumes an
   instant lock? Are there fixed studio days/hours to encode?
7. **Consultation vs the tattoo session — what are we booking?** Just the tattoo session? A
   (free/paid) **consultation** first for bigger custom pieces? Both?
8. **Multi-session pieces.** Large work spans several sittings — should scheduling book just
   the **next** appointment, or a series?
9. **Session length & buffer.** Who sets how long each piece needs (and the gap between
   clients)? Per-flash-piece duration, or a couple of standard lengths (small / half-day /
   full-day)?
10. **Reschedule / cancel.** Should customers **self-reschedule** via a link (up to a cut-off),
    or always go through you? How close to the date can they change without losing the deposit
    (must match the cancellation terms in the enquire/services copy)?
11. **Reminders.** Email reminders before the appointment — yes? (cheap). **SMS** reminders
    cost money and need a provider — worth it, or email-only?
12. **Time zone.** UK clients only (simplest — one zone, just DST handling), or do you take
    travelling/overseas bookings that need timezone-aware slots?

---

## 9. Out of scope (for the first cut, by design)

- **Instant, card-confirmed self-serve booking** — incompatible with the manual-deposit
  decision (`PAYMENTS-PLAN.md`); revisit only if Roxy chooses a third-party tool ([§7](#7--alternative-build-vs-buy)).
- **Two-way calendar free-busy sync** ([§4](#4--where-availability-comes-from-the-genuinely-new-question) option c) — deferred behind the simpler windows + `.ics` invite.
- **Customer accounts / logins** — bookings ride tokenised magic-links, no account system.
- **SMS reminders** unless Roxy opts in (needs a paid provider).
- **Apex stays on v1** — ships to the staging Pages URL + the Worker only; no
  `apps/web/public/CNAME`, per the deploy guardrail in `CLAUDE.md`.
</content>
</invoke>
