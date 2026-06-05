# Deposits & flash purchase — payment plan (PayPal + Monzo)

Plan of work for taking **deposits** (custom enquiries) and **flash deposits** online,
using **PayPal** and **Monzo**. This is a **design/spec document for future work** — none
of it is wired yet. It supersedes the "Stripe deposit capture" backlog item in
`ROADMAP.md` (the studio confirmed PayPal + Monzo, not Stripe).

> **Status:** not implemented. The enquire/FAQ/services copy currently *names Stripe* and
> *promises* deposits, but no payment backend exists. See [Copy to fix](#copy-to-fix).

> **Related:** the deposit is the confirmation trigger for the **scheduling layer** —
> [`SCHEDULING.md`](./SCHEDULING.md) builds on this plan's reserve/TTL/`/studio`/customer-email
> primitives and the two are designed to **co-ship as one track**.

```
Flash claim (today)                       Flash claim + deposit (this plan)
─────────────────                         ────────────────────────────────
claim form  ─▶ Worker reserves piece      claim form ─▶ Worker reserves piece (pending)
            ─▶ persists submission                    ─▶ persists submission + reference + amount
            ─▶ emails ARTIST                           ─▶ emails ARTIST  (ref + amount + method)
            ─▶ card shows "Pending deposit"            ─▶ emails CUSTOMER (PayPal + Monzo links)
            (nothing ever marks it claimed)            ─▶ card shows "Pending deposit"
                                                       … customer pays out-of-band …
                                                       … artist matches the reference …
                                                       ─▶ artist marks piece CLAIMED (manual)
```

---

## The decision that shapes everything: **manual reconciliation**

Confirmed product decisions (2026-06):

| Decision | Choice |
|----------|--------|
| Monzo mechanism | **Monzo.me payment link**, reconciled by hand (Monzo has no merchant/acquiring API) |
| Confirmation | **Fully manual for both** providers — the artist confirms receipt and marks the claim |
| Flash amount taken online | **Deposit only** (flat £ or % of price — to be pinned, config-driven) |
| Custom-enquiry deposit | Taken **after** the artist quotes, via an emailed payment link (not inline) |

**Consequence — there is no payment-gateway integration to build.** Because nothing is
auto-confirmed:

- **No** PayPal Orders/Checkout API, **no** webhooks, **no** payment SDK.
- **No** card data ever touches the site — the links hand off to PayPal / Monzo's own pages.
- **No** new payment secrets in Cloudflare. The PayPal.Me / Monzo.me handles are **public**
  and live in non-secret Worker `[vars]`. The *only* new secret in the whole feature is a
  token for the artist's "mark paid" admin action (Phase 4).

The "links" are just pre-filled URLs:

- **PayPal:** `https://paypal.me/<handle>/<amount>GBP`
- **Monzo:** `https://monzo.me/<handle>?amount=<amount>&description=<reference>`
  (Monzo.me pre-fills the amount and a description we use to carry the reference).

What we *are* building is the bookkeeping and the human loop around those links: a **deposit
amount**, a **unique reference**, **payment instructions** shown on-screen and emailed, and a
way for the artist to **mark a claim paid**.

---

## Two gaps in today's code this exposes

Manual deposits require two things the current code does **not** do:

1. **Nothing moves a flash claim from `pending` → `claimed`.** `reserveFlashPiece()`
   (`apps/functions/src/lib/db.js`) sets `pending`; `releaseFlashPiece()` only rolls back on
   email failure. There is **no** path to `claimed`. Manual reconciliation needs an
   artist-facing way to set it (Phase 4).
2. **The customer is never emailed.** A flash claim only emails `ARTIST_EMAIL`
   (`apps/functions/src/handlers/enquiry.js`). An on-screen "now pay" panel is easily
   closed/lost, so the payment instructions **must also** go to the customer — that's a new
   Resend send to a new recipient (Phase 2).

A third, structural risk: an **unpaid `pending` claim locks a one-of-a-kind piece forever.**
The plan adds a **stale-pending expiry** so unpaid claims release the piece (Phase 2).

---

## What's already wired (and what each part means here)

| File | Role today | Touched by this plan |
|------|------------|----------------------|
| `apps/functions/src/handlers/enquiry.js` | Handles enquiry + flash; reserve → persist → email artist | Add deposit calc, reference, customer email, return payment info |
| `apps/functions/src/lib/db.js` | D1: persist, rate-limit, flash inventory (reserve/release) | Add `claimFlashPiece`, deposit columns, stale-release query |
| `apps/functions/src/lib/http.js` | CORS, JSON replies, anti-spoof IP, Request→event adapter | Reuse for the admin endpoint |
| `apps/functions/migrations/0001_init.sql` | D1 schema (`flash_claims` etc.) | New migration `0002_deposits.sql` |
| `apps/functions/wrangler.toml` | Worker name, D1 binding, vars | Add handle/deposit-rule `[vars]` + one admin-token secret; cron trigger |
| `apps/functions/src/index.js` | Routes `/enquiry` `/newsletter` `/flash-status` | Add `/flash-admin`; add `scheduled()` for stale-release |
| `apps/web/flash/index.html` + `src/js/modules/flash.js` | Flash grid + claim modal | Post-claim payment panel (links + reference) |
| `apps/web/src/data/flash.js` | Flash data (`price`, `status`, `id`) | Source of the deposit base price |
| `apps/web/enquire/index.html`, `faq/`, `services/` | Copy naming **Stripe** + deposit figures | Replace with PayPal/Monzo wording |

---

## Phase 0 — Decisions to pin (cheap, but blocking)

1. **Deposit rule.** Flat (e.g. £40) or % of `price` (e.g. 25%, rounded to whole £). Flash
   prices today are £130–£240 (`apps/web/src/data/flash.js`). One config constant.
2. **PayPal.Me handle** and **Monzo.me handle** (the studio's usernames).
3. **Reference format.** Short enough to type into a payment note, unique per claim — e.g.
   `BSF-<piece-id>-<4-char>` (`BSF-flash-07-9QX2`).
4. **Stale-pending window.** How long a `pending` claim holds a piece before auto-release if
   unpaid — e.g. **48h**.
5. **Reconciliation mechanism** (Phase 4): a small token-protected admin page (recommended)
   vs. a `wrangler d1 execute` one-liner.

---

## Phase 1 — Data & config

- **Migration `apps/functions/migrations/0002_deposits.sql`.** Extend `flash_claims` (keep
  it manual — no separate gateway table needed):
  - `reference TEXT` — the payment reference quoted by the customer
  - `deposit_pence INTEGER` — amount owed
  - `provider TEXT` — `paypal` | `monzo` | `NULL` until paid
  - `paid_at TEXT` — ISO timestamp the artist confirmed
  - `expires_at TEXT` — when an unpaid `pending` claim is released
  - `status` stays the source of truth: `pending` → `claimed` (or back to absent on release).
- **Config.** A non-secret module computing `deposit_pence` from a piece's `price` + the
  rule, and building the PayPal/Monzo URLs from the handles. Handles + rule + stale-window in
  `wrangler.toml` `[vars]` (e.g. `PAYPAL_HANDLE`, `MONZO_HANDLE`, `DEPOSIT_FLASH_PCT` or
  `DEPOSIT_FLASH_PENCE`, `PENDING_TTL_HOURS`).

## Phase 2 — Backend (Worker)

- **`enquiry.js`, flash path:** after `reserveFlashPiece()` succeeds, compute the deposit +
  reference, persist them on the claim, set `expires_at`, and **return them in the JSON
  response** (so the frontend can render instructions). Add reference + amount + "pay by
  PayPal or Monzo" to the **artist** email.
- **Customer confirmation email:** new Resend send to the claimant with both payment links,
  the amount, and the reference. Reuses existing Resend plumbing; new recipient. Keep
  fail-safe — a Resend hiccup must not strand the reservation differently than today.
- **`/flash-admin` endpoint (`index.js` + new handler):** token-protected `POST` to
  **mark a piece `claimed`** (record `provider` + `paid_at`) or **release** it. The artist's
  reconciliation tool. Token = the one new Worker secret. Reuse `http.js` CORS/JSON helpers;
  restrict origin/method tightly.
- **Stale-pending release:** a Cloudflare **scheduled (cron) handler** (`scheduled()` in
  `index.js`, `[triggers] crons` in `wrangler.toml`) releasing `pending` claims past
  `expires_at`. *(Alternative with no cron: release lazily during the `flash-status` read.)*

## Phase 3 — Frontend

- **Flash claim modal (`flash/index.html` + `modules/flash.js`):** on a successful claim,
  swap the "claim sent" state for a **"Pay your £X deposit to hold this piece"** panel — a
  PayPal button, a Monzo button (both from the Worker's response), and the **reference to
  quote**. Card stays amber "Pending deposit" (already implemented) until the artist confirms.
- **Enquire flow (custom):** deposit comes *after* the quote, so **no inline payment** — keep
  the acknowledgement checkbox, update the timeline/aside copy, and let the artist email a
  payment link later (same reference scheme + a reusable email snippet).
- **Copy to fix** — replace every **Stripe** mention and align deposit figures:
  - `apps/web/enquire/index.html` (~L504, "handled securely through Stripe")
  - `apps/web/faq/index.html` deposit FAQs (~L294–314)
  - `apps/web/services/index.html` deposit amounts (still placeholders; match the rule)
  - `apps/web/src/styles/pages/flash.css` + `apps/web/src/data/flash.js` comments describing
    the old flow.

## Phase 4 — Reconciliation (the artist's daily loop)

The "fully manual" core. Match an incoming PayPal/Monzo payment (by **reference**) to a
pending claim, then mark it paid. Pick the mechanism in Phase 0:

- **A: token-protected admin page** (`/studio/`, `noindex`) listing pending claims with
  "Mark paid (PayPal/Monzo)" / "Release" buttons hitting `/flash-admin`. Best for a
  non-technical artist. **Recommended.**
- **B: `wrangler d1 execute` one-liner.** Zero UI, fully technical.

Either way, the **reference** is what makes a bank/PayPal notification matchable to a claim.

## Phase 5 — Compliance & docs

- **`docs/DATA-COMPLIANCE.md`:** deposit fields are personal/financial data tied to a
  submission — extend retention + the erasure-runbook `DELETE` to cover the new columns. A
  **paid** deposit means the booking went ahead → that record follows the **long-retention**
  (insurer/LA) rule, not the 12-month prune.
- **`docs/PAYMENTS-SETUP.md`:** the operational setup doc (handles, vars, the reconciliation
  loop, testing, troubleshooting) — written when build starts. Must state plainly that this
  is **manual** and **why Monzo can't be automated**.
- **`docs/ROADMAP.md`:** replace the "Stripe deposit capture (P2)" item (L95–97, L369–371)
  with this PayPal/Monzo manual plan.
- **Tests (`apps/functions/tests/`):** deposit calc, reference generation, response shape,
  `/flash-admin` auth + `pending`→`claimed` transition, stale-release. Front-end: payment
  panel renders the right amount + links.

---

## Out of scope (by design)

- Automatic payment confirmation, webhooks, real-time "paid" status.
- Storing card/PAN data (the links hand off to PayPal/Monzo entirely).
- Refund automation — a refund is a manual PayPal/Monzo action + a `/flash-admin` release.
- **Apex stays on v1.** This ships to the staging Pages URL + the Worker only — no
  `apps/web/public/CNAME`, per the deploy guardrail in `CLAUDE.md`.

## Sequencing

```
Phase 0 (decisions)
   ├─▶ Phase 1 (data/config)  ─┐
   └─▶ Phase 3 copy cleanup    │  (parallel)
              ▼                ▼
        Phase 2 (backend) ─▶ Phase 3 payment panel ─▶ Phase 4 (admin) ─▶ Phase 5 (docs/compliance/tests)
```

One small PR per phase (repo rule: one PR per change, squash-merge). Deposits are
**post-launch** — they don't block the apex cutover; the site ships without them.

## Open items to pin first

1. **Deposit rule** — flat vs % (shapes Phases 1–3).
2. **Reconciliation mechanism** — admin page vs CLI (shapes Phases 2 & 4).
3. PayPal.Me + Monzo.me handles, reference format, stale-pending window.
