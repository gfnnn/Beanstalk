# Payments roadmap — integrated deposits & flash payments

How we get from today's code to **taking money on the site**: flash payments wired into
the flash inventory, and a deposit system for custom bookings. Companion to
[`PAYMENTS-PLAN.md`](./PAYMENTS-PLAN.md) (the original manual-links decision — now evolving,
see below), [`PAYMENTS-FEES.md`](./PAYMENTS-FEES.md) (the fee maths), and
[`SCHEDULING.md`](./SCHEDULING.md) (a paid deposit is the booking-confirmation trigger).

> **Direction change.** `PAYMENTS-PLAN.md` assumed *manual* PayPal.Me / Monzo.me links with
> **no gateway to build**. The new requirement — *"safest integration, highest functionality
> and control,"* plus **Klarna** — can't be done with manual links (Klarna is a real
> gateway method; "control/automation" means webhooks). So this roadmap moves to an
> **integrated checkout**. The manual links survive only as the zero-build fallback in
> Phase 0 and for bank-transfer deposits.

## The core rule: two different payment models

The split the studio asked for, made precise:

- **Flash = fixed price → take FULL payment online.** Every piece already has a `price` in
  `apps/web/src/data/flash.js`, so the amount is known at build time. Paying *is* the claim.
- **Custom enquiry = DEPOSIT only online.** **Never auto-generate a full price for a custom
  tattoo** — it can't be priced without the consultation. The deposit confirms the booking
  date; the **balance/full fee is quoted and paid in person on the day** at the final
  consultation. The website never charges the custom total.
- **Deposit is the shared primitive** (flat £ or % of a known price — config-driven), and
  it's the trigger that hands off to [`SCHEDULING.md`](./SCHEDULING.md).

| Path | What the site charges | When | Methods that fit |
|---|---|---|---|
| **Flash** | Full price (e.g. £180) | At claim | Card, **Klarna** (pay-in-3 ≈ £60×3), PayPal, bank transfer |
| **Custom** | Deposit only | After the artist quotes | Card, bank transfer, PayPal (Klarna pointless on a small deposit) |
| **Custom balance** | Nothing online | In person, on the day | — |

## The architecture: one engine, three "locations"

The studio's three payment locations are **Monzo Business, PayPal, Klarna**. The safest,
highest-control way to actually deliver them resolves like this:

- **Stripe is the engine.** A *single* Stripe integration gives **card + Klarna** (Stripe
  carries Klarna in the UK out-of-the-box — no separate Klarna merchant contract, funds land
  in your Stripe balance upfront minus fees, Klarna carries the customer-credit risk).
  Use **hosted Stripe Checkout / Payment Element** so card data never touches the site
  (**PCI SAQ-A — this is the "safest" part**), with full API/webhooks/dashboard/refunds
  (the "functionality and control" part).
- **Monzo Business is the bank account**, not a separate integration: Stripe **pays out**
  into it. It also gives the **free bank-transfer deposit** route (Monzo Business "Get Paid"
  easy bank transfer, £0 fee — see `PAYMENTS-FEES.md`) for customers who prefer it. Note:
  Monzo's *own* card links are Stripe under the hood, so going Stripe-direct is strictly
  *more* control than routing through Monzo.
- **PayPal is a parallel method** (its own Orders API + webhook) for customers who insist on
  it — the heaviest per-value option, so it phases in after the Stripe backbone.
- **Klarna is delivered via Stripe** (just enable the method), best fit on **flash full
  payments**.

So the customer sees **card · Klarna · PayPal · bank transfer**, and everything settles into
the **Monzo Business** account.

## What already exists (lean on it)

The Worker + D1 spine is in place — `apps/functions/src/lib/db.js`:

- `reserveFlashPiece()` — atomic one-of-a-kind reserve (`ON CONFLICT DO NOTHING`), sets
  `pending`.
- `releaseFlashPiece()` — rolls a reservation back if the follow-through fails.
- `getFlashClaims()` + the `flash-status` endpoint — live availability overlay on the static
  grid.
- `persistSubmission()`, the per-IP/daily rate limiter, all fail-safe/fail-open.
- `flash.js` carries `price` and a `status` of `available | pending | claimed`.

## The gaps to close

From `PAYMENTS-PLAN.md`, still true, plus the new gateway pieces:

1. **No `pending → paid → claimed` promotion.** `reserveFlashPiece` only sets `pending`.
   A **Stripe webhook** should promote it on payment success (was a manual artist action).
2. **No customer email.** A claim only emails the artist today; payment instructions /
   receipts must reach the customer (a new Resend send).
3. **No stale-pending release.** An unpaid hold locks a one-of-a-kind piece forever — needs a
   TTL (~48h) via a Cron Trigger or lazy release on the `flash-status` read.
4. **New:** a `payments` table, checkout + webhook routes, provider secrets, CSP widening, a
   `/studio` reconciliation surface, and compliance updates.

## Phased delivery

### Phase 0 — Groundwork (no customer-facing change)
- **Pin the decisions** (see the list at the foot of this file).
- Open/confirm the **Stripe account** with **payout to the Monzo Business account**.
- **D1 migration `0002_payments.sql`**: a `payments` table (`id, kind, ref, provider,
  provider_payment_id, amount_pence, currency, status, piece_id|enquiry_id, created_at,
  paid_at`) and extend `flash_claims` with `paid`, `amount_pence`, `provider_ref`,
  `expires_at`.
- **`DATA-COMPLIANCE.md`**: add payment/financial-data retention — a **paid** record follows
  the long-retention rule, not the 12-month prune.

### Phase 1 — Stripe checkout for FLASH full payment (the backbone)
> **Specced file-by-file in [`PAYMENTS-STRIPE-BUILD.md`](./PAYMENTS-STRIPE-BUILD.md)** —
> the executable build plan (migration, handlers, frontend, tests, sequencing).
- **Worker:** `POST /checkout` (create a Stripe Checkout Session for a flash piece at its
  `price`; reserve the piece `pending` first) and `POST /webhooks/stripe` (verify the
  `Stripe-Signature`, and on `checkout.session.completed` promote `pending → claimed`, record
  the payment, email customer + artist — **idempotent**, keyed on the event id).
- **Frontend:** flash claim → hosted Stripe Checkout (card **+ Klarna**); reuse the
  `spinner` busy-state. No card fields on our pages.
- **CSP:** add Stripe (+ Klarna) hosts to `connect-src` / `frame-src` / `script-src` in
  `apps/web/src/build/security.js`.
- **Stale-release:** lazy release on the `flash-status` read, or a Cloudflare **Cron
  Trigger**.
- **E2E:** extend the flash spec under `apps/web/e2e/` with Stripe in test mode / stubbed —
  this is a browser-only path the unit tier can't cover.

### Phase 2 — Deposit system for CUSTOM bookings (post-quote)
- The artist reviews & **quotes** (offline / email), which issues a **tokenised "pay your
  deposit" magic link** — *no full price is ever auto-generated*. Deposit via Stripe Checkout
  (card) or the free Monzo bank-transfer link.
- **Deposit paid → booking date confirmed**, handing off to `SCHEDULING.md` (optional `.ics`
  invite); customer + artist emailed.
- **`/studio` admin** (token-protected — shared with the ROADMAP "artist-facing view"): see
  deposits, **mark a manual bank-transfer one paid**, issue refunds.

### Phase 3 — More methods & polish
- **PayPal** as a method (Orders API + webhook).
- **Klarna** confirmed on flash (already available through Stripe — just toggle on).
- Refund / cancellation flows matching the cancellation copy; a reconciliation view;
  reminders.

## Safety & compliance checklist (the "safest" part)

- **Hosted checkout only** — no card data on the site (PCI **SAQ-A**).
- **Secrets in the Worker** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_*`) via
  `wrangler secret put` — never in the repo.
- **Webhook signature verification + idempotency** on every provider callback; **rate-limit**
  the checkout route (reuse the existing limiter); keep the DB writes fail-safe.
- **CSP scoped** to exactly the provider hosts that are loaded.
- **Financial-data retention** added to `DATA-COMPLIANCE.md`.
- **Staging only until the apex cutover** — no `apps/web/public/CNAME` (deploy guardrail in
  `CLAUDE.md`).

## Decisions to confirm before Phase 1

1. **Stripe as the engine** — OK to open a Stripe account paying out to Monzo Business? It's
   the only way to get Klarna + cards in one safe, high-control integration (and it's what
   Monzo's own card links use anyway). *This is the load-bearing decision.*
2. **Flash:** full-payment-only, or also offer a deposit-to-hold + balance on the day?
3. **Deposit rule:** flat £ or % of price — and the figure?
4. **PayPal:** real integration (Phase 3), or keep as a manual PayPal link until then?
5. **Klarna on flash from day one** (cheap to enable via Stripe), or hold it back?
6. **Reference format** (e.g. `BSF-<piece-id>-<4char>`) and the **stale-pending window**
   (~48h).
</content>
