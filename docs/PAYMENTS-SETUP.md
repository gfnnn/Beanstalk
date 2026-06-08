# Payments — go-live setup (Stripe + Monzo Business)

The studio/operator runbook to take the **shipped-dark** Stripe backbone live. The code is
done ([`PAYMENTS-STRIPE-BUILD.md`](./PAYMENTS-STRIPE-BUILD.md), steps 1–3 & 5 ✅; step 4 frontend
wires the modal to it). This is the **account, secrets, dashboard, and verification** work —
none of it is in the repo, all of it is the studio's to do. Do it in **test mode first**, verify
end-to-end, then swap to live keys.

> **One integration, on purpose.** Everything below configures a **single Stripe account**. The
> site surfaces card · Link · Apple/Google Pay · Klarna · **PayPal** from that one integration via
> the embedded Payment Element + `automatic_payment_methods` — you enable each method in the
> dashboard, no extra code. The **Monzo Business** account is the *payout bank*, not a separate
> integration; its free bank-transfer route is a manual option handled in the artist dashboard
> ([`DASHBOARD.md`](./DASHBOARD.md)), not an on-page method. Don't add a PayPal Orders-API
> integration — Stripe carries PayPal natively for UK accounts (verified June 2026).

## 0. Prerequisites

- A **Monzo Business** account (Lite £0/mo is enough to *receive* Stripe payouts — see
  [`PAYMENTS-FEES.md`](./PAYMENTS-FEES.md)). You need its **sort code + account number** (Monzo
  app → account details).
- Wrangler installed and logged in (`npm i -g wrangler && wrangler login`) — same as
  [`ENQUIRY-SETUP.md`](./ENQUIRY-SETUP.md).
- The Worker already deployed (`beansprout-forms`) with D1 bound (`apps/functions/wrangler.toml`).

## 1. Open / configure the Stripe account (test mode)

1. Create a Stripe account at https://dashboard.stripe.com (UK business, GBP). Stay in **Test
   mode** (toggle, top-right) for everything in §1–§8.
2. Complete the business profile enough to use test mode (full activation/KYC is only needed
   before live keys in §9).

## 2. Connect Monzo Business as the payout bank

Stripe → **Settings → Business → Bank accounts and currencies** (or **Balance → Payout
settings**) → **Add bank account**:
- Enter the **Monzo Business sort code + account number**; the account-holder name must match the
  Monzo statement. (Stripe pays out here a few working days after each payment, and takes its
  fees/refunds/disputes from this account.)
- Set the payout schedule (default automatic daily is fine).

*(Monzo's own "Get Paid" card links are Stripe under the hood, so going Stripe-direct paying out
to Monzo is strictly more control — see [`PAYMENTS-FEES.md`](./PAYMENTS-FEES.md).)*

## 3. Enable payment methods (no code)

Stripe → **Settings → Payment methods**. Turn on, for GBP:
- **Cards** (on by default).
- **Link** (on by default; one-click).
- **Klarna** — "Turn on". Best fit on fixed-price flash. Funds land in your Stripe balance
  upfront minus fees; Klarna carries the customer-credit risk.
- **PayPal** — locate it and **"Turn on"** (eligible for UK accounts). It then appears in the
  Payment Element automatically via `automatic_payment_methods` — **no code change**.
- **Apple Pay / Google Pay** — enable; for **Apple Pay** you must **register the web domain**
  under **Settings → Payment methods → Apple Pay → Add domain** (the staging Pages domain now,
  the apex at cutover). Google Pay needs no domain step.

These map 1:1 to what the embedded Payment Element renders for a UK GBP customer. The Worker
already requests them all (`automatic_payment_methods[enabled]='true'` —
`apps/functions/src/handlers/checkout.js:115`).

## 4. Get the API keys

Stripe → **Developers → API keys** (Test mode):
- **Publishable key** `pk_test_…` — **not secret**, baked into the web bundle as
  `VITE_STRIPE_PUBLISHABLE_KEY`.
- **Secret key** `sk_test_…` — **Worker secret only**, never in the repo/bundle.

## 5. Register the webhook endpoint + copy the signing secret

Stripe → **Developers → Webhooks → Add endpoint**:
- **Endpoint URL:** `https://beansprout-forms.harrisonfisher1990.workers.dev/webhooks/stripe`
  (the deployed Worker; swap host if your workers.dev subdomain differs).
- **Events to send:** `payment_intent.succeeded` **and** `payment_intent.canceled` — exactly the
  two the handler processes (`apps/functions/src/handlers/stripe-webhook.js`). Don't
  over-subscribe; other events are acked-and-ignored but add noise.
- Save, then **reveal the Signing secret** `whsec_…` and copy it — it goes into
  `STRIPE_WEBHOOK_SECRET` (§6). This is what the Web-Crypto HMAC verify checks
  (`apps/functions/src/lib/stripe.js`).

## 6. Set the Worker secrets + flags

From `apps/functions/` (test-mode keys first):
```bash
wrangler secret put STRIPE_SECRET_KEY        # paste sk_test_…
wrangler secret put STRIPE_WEBHOOK_SECRET    # paste whsec_… from §5
```
Set `PAYMENTS_ENABLED` so `/checkout` stops returning 503. Either uncomment in
`apps/functions/wrangler.toml` `[vars]`:
```toml
PAYMENTS_ENABLED = "true"
```
…and `wrangler deploy`, or set it as a var in the Cloudflare dashboard. (Resend secrets for the
receipt/artist emails — `RESEND_API_KEY`, `FROM_EMAIL`, `ARTIST_EMAIL` — are already set per
[`ENQUIRY-SETUP.md`](./ENQUIRY-SETUP.md); the webhook reuses them.)

**Web build vars** — set on the build that serves the flash page (Cloudflare Pages project env
for staging; GitHub Actions Variables for the Pages production build — see `CLAUDE.md` → Deploy
targets). Add to `.env` locally / the build env:
```
VITE_PAYMENTS_ENABLED=true
VITE_CHECKOUT_FN_URL=https://beansprout-forms.harrisonfisher1990.workers.dev/checkout
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…
```
**Rebuild after changing these — Vite bakes them in.** With `VITE_PAYMENTS_ENABLED` unset/false
the Claim button behaves exactly as today (POST `/enquiry`), so the frontend can ship dark.

## 7. Apply the migration + sync prices

```bash
cd apps/functions
npm run migrate           # applies 0002_payments.sql (payments + webhook_events + flash_claims.expires_at)
npm run sync:prices       # regenerates src/data/flash-prices.json from apps/web/src/data/flash.js
```
- `0002` is **purely additive** and only needed when payments go on (detail in
  [`PAYMENTS-STRIPE-BUILD.md`](./PAYMENTS-STRIPE-BUILD.md) §2). Re-run `migrate` against the live
  D1 too before live keys.
- **Run `sync:prices` whenever a flash price changes** and **commit** the regenerated JSON; a CI
  drift guard fails if the manifest and `flash.js` disagree. The Worker charges from this manifest,
  never the client (`checkout.js`).

## 8. Verify in test mode (before live keys)

1. Build the web with the test `VITE_*` vars and serve it (staging Pages, or local
   `npm run build && npm run preview`).
2. On `/flash/`, claim an available piece. Pay with Stripe **test cards** (`4242 4242 4242 4242`,
   any future expiry/CVC) — confirm the in-modal confirmation.
3. Run the **redirect** methods: **Klarna** test flow and **PayPal** sandbox — confirm the bounce
   to the provider and back to `/flash/payment-return/`, and the correct status there.
4. Check the **webhook** delivered (Stripe → Developers → Webhooks → your endpoint → recent
   deliveries: `payment_intent.succeeded` = 200). Confirm the piece is now **claimed** on a
   `/flash/` reload (the `flash-status` overlay), the **receipt + artist emails** arrived, and the
   **`payments` row** is `paid` (Stripe Dashboard → Payments, and/or
   `wrangler d1 execute beansprout --command "SELECT id,status,amount_pence FROM payments ORDER BY created_at DESC LIMIT 5"`).
5. **Abandon** a checkout (close before paying / cancel): confirm the 48h hold and that the piece
   frees on the next grid load (lazy `expirePendingClaims`), and/or a `payment_intent.canceled`
   marks the payment `expired` and releases the hold.
6. Confirm the **CSP** doesn't block the Element: load the **built** flash page (CSP is
   build/preview only) with the console open — no CSP violations for `js.stripe.com` /
   `api.stripe.com` / `hooks.stripe.com`. If a 3DS test card surfaces a frame violation, add
   `https://m.stripe.network` to `frame-src` (`apps/web/src/build/security.js`).

## 9. Go live

Only after §8 is clean **and** the apex-domain guardrail allows it (`CLAUDE.md` — no
`apps/web/public/CNAME` until Phase 6; until then payments run on **staging only**):
1. Stripe → flip to **Live mode**; complete full business activation/KYC if prompted.
2. Re-do §3 (enable methods in **live**), §4 (live `pk_live_…`/`sk_live_…`), §5 (a **live**
   webhook endpoint → new `whsec_…`).
3. Re-run §6 with the **live** keys (`wrangler secret put` again; update
   `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` and rebuild), and §7 `migrate` against the live D1.
4. Do **one real low-value live transaction** end-to-end (a £-test flash, or refund yourself
   afterward) and confirm the webhook + emails + payout-to-Monzo.

## Reconciliation, refunds, bank transfer

Manual reconciliation, refunds, and marking an off-page **Monzo bank-transfer** deposit paid live
in **the artist dashboard ([`DASHBOARD.md`](./DASHBOARD.md))** and the Stripe Dashboard — not in
this flow. Refund note: Stripe doesn't return the original processing fee
([`PAYMENTS-FEES.md`](./PAYMENTS-FEES.md)).

## To turn payments OFF again

Unset `PAYMENTS_ENABLED` (Worker) → `/checkout` returns 503 and the modal falls back to the
enquiry flow; unset `VITE_PAYMENTS_ENABLED` + rebuild → the Claim button reverts to today's
POST-`/enquiry` behaviour. No code change either way.

## Sources (verified June 2026)

- Stripe — PayPal payment method availability (UK + EEA/CH; activate in Dashboard; works with
  Payment Element + automatic_payment_methods): https://docs.stripe.com/payments/paypal ·
  https://docs.stripe.com/payments/paypal/activate
- Stripe — dynamic / automatic payment methods (one integration, Stripe picks eligible methods):
  https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods
- Stripe — Payment Element: https://docs.stripe.com/payments/payment-element
- Stripe — recommended CSP (script-src js.stripe.com; frame-src js.stripe.com hooks.stripe.com;
  connect-src api.stripe.com; img-src *.stripe.com): https://docs.stripe.com/security/guide
- Monzo — Stripe payout to a Monzo Business account:
  https://monzo.com/help/business-getpaid/stripe-pay-out-web
- Stripe — add a bank account for payouts:
  https://support.stripe.com/questions/add-a-bank-account-for-payouts
