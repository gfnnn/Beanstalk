# Artist dashboard — plan

A **private dashboard for the artist** (Beansprout / Roxy) to manage what the site captures:
enquiries, flash claims, payments, and — once it ships — bookings, plus the GDPR tools. It is
**not** a tool for the host studio (Tiny Knives owns the chair schedule, not this site) and it
is **not** multi-user: one artist, one login. Today every enquiry and flash claim is persisted
to **D1** but the only way to *see* it is the artist's inbox + raw SQL. This is the
**read/manage surface** over that data — and the **load-bearing substrate** the post-launch
features reuse: payments reconciliation, the scheduling confirm step, and the GDPR erasure UI
all live here, so it's built once.

> **Status: planned, not built.** Post-launch backlog (ROADMAP P2). This is a stub of the
> durable decisions, not a build spec.

> **Naming.** It's the *artist's* dashboard, not a studio product — the route is just a path.
> This plan keeps the short route **`/studio`** (rename to `/dashboard` if preferred — a
> one-line change), and "`/studio`" remains an acceptable shorthand for it in other docs
> (ROADMAP/PAYMENTS use both interchangeably; they all link here).

## What it manages (all already in D1)

Everything is a query over tables that already exist — D1 being real SQL is the whole reason
this is a normal read/write layer, not a scan. **No new app**: it reuses the existing Worker +
D1.

- **Enquiries & flash claims** (`submissions`): list + detail view, and a **status lifecycle**
  (`new → replied → booked → completed`, plus `archived`/`spam`) with a private artist note —
  enquiries currently live only in Gmail, and a failed artist-email send means a lost lead;
  this makes D1 the durable, manageable record it's already designed to be.
- **Flash inventory** (`flash_claims`): see pending/claimed with hold countdowns; **release a
  stuck hold** (`releaseFlashPiece`).
- **Payments** (`payments`): reconcile the ledger; **mark a manual bank-transfer paid** (the
  human counterpart to the Stripe webhook — promotes the linked claim via `promoteFlashClaim`);
  refunds later, with the payments refund phase. Reuses the existing `db.js` payment helpers.
- **Bookings** (ships *with* [`SCHEDULING.md`](./SCHEDULING.md), not before): the
  **confirm/decline queue** for requested dates — the manual confirm the scheduling model
  requires.
- **GDPR / compliance**: look up everything held for an email, and **delete-by-email (erasure)**
  running the [`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md) runbook from a button — preview-count
  first, the paid-payment financial-retention exemption enforced, action logged. Plus a
  read-only proof-of-consent lookup over `newsletter_consent`.

The status lifecycle and an audit log are the only schema additions — a small, purely additive
migration applied only when the dashboard ships. (Don't bake the number into plans: `0003` is
now taken by the shipped `0003_claim_refs.sql`, so the dashboard's would be the next free
number.)

## Where it lives & how it's gated

**The Worker serves it; Cloudflare Access gates it.** The data lives in D1, which only the
Worker can reach, so the dashboard is a small set of **Worker routes under `/studio/*`** (a
server-rendered HTML page + a few JSON endpoints) rather than a page on the public static site
(GitHub Pages can't gate a route, and the marketing bundle shouldn't carry admin code).

- **Auth = Cloudflare Access**: a zero-code identity gate in front of the `/studio/*` routes —
  an **email one-time-PIN** policy allowing only the artist's address, on Cloudflare's free
  tier. No passwords, sessions, or auth code to build, store, or rotate; it pairs with the
  planned Cloudflare-front consolidation (`ROADMAP.md`). The alternative (a shared secret the
  Worker checks) is more code and a credential to leak/rotate; a full login system is overkill
  for one user. Access requires Cloudflare in front of the Worker — already true.
- **Defense in depth:** the Worker still **verifies the `Cf-Access-Jwt-Assertion`** header on
  every `/studio/*` request (validate the JWT against the Access public keys + the audience
  tag) so the admin routes fail closed even if Access is ever mis-bound. Admin routes are
  **never** added to the public CORS allowlist and carry the existing `SECURITY_HEADERS`;
  they're same-origin, no CORS.
- **Every write is parameterised and audit-logged**; **no new secrets in the repo** (Access
  config lives in Cloudflare; the Worker only needs the Access team domain + audience tag as
  vars). **D1 Time Travel** ([`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md)) is the undo for a
  mistaken erasure/status change. The dashboard is the only place that can read raw personal
  data over HTTP — so the Access gate is part of the compliance posture, not just convenience.

## Open questions (for the artist / owner)

- **Route + host:** `/studio` on the Worker, or a `dashboard.beansprout.ink` subdomain (cleaner
  Access binding)? Keep the `/studio` name or rename to `/dashboard`?
- **Lifecycle stages:** is `new → replied → booked → completed (+ archived/spam)` the right
  set, or does the artist think in different stages?
- **Notifications:** should a new enquiry also ping the artist (it already emails them) — or is
  the dashboard badge enough?
- **Refunds in-dashboard** vs done in the Stripe dashboard (Stripe's own UI is already a
  capable admin surface — the dashboard may only *need* to reconcile, not re-implement refunds).

## Non-goals

Multi-user/roles, a public "studio" page, analytics dashboards (see `ANALYTICS.md`), content
editing (that's the CMS — `CMS.md`), and anything the **Stripe dashboard** already does well
(detailed payment search, disputes) — link out rather than rebuild.
