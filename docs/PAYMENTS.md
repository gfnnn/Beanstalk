# Payments — Stripe checkout for flash & deposits

The single source of truth for taking money on the site: **the model**, **the architecture**,
**what's shipped vs what remains**, the **file-by-file build spec**, the **fee maths**, and the
**operator go-live runbook**. (Consolidates the former `PAYMENTS-ROADMAP`, `-STRIPE-BUILD`,
`-FEES`, `-SETUP`, and the superseded `-PLAN` into one doc — read top-to-bottom, or jump to a
section.)

**Status in one line:** an integrated **Stripe** checkout — flash = full payment, custom =
deposit — whose **Worker backbone is built and shipped dark** behind `PAYMENTS_ENABLED`
(migration `0002`, server-side price authority, `/checkout`, `/webhooks/stripe`, stale-release,
all unit-tested). What remains: the **step-4 embedded frontend**, the studio's
account/dashboard setup, and a staging test-mode run before live keys. Scheduling co-ships
([`SCHEDULING.md`](./SCHEDULING.md)) — a paid deposit is its booking-confirmation trigger; the
artist-facing reconciliation surface is the [`DASHBOARD.md`](./DASHBOARD.md) `/studio` admin.

---

## 1. The model — two payment types

The split the studio asked for, made precise:

- **Flash = fixed price → full payment online.** Every piece carries a `price` in
  `apps/web/src/data/flash.js`, so the amount is known at build time. **Paying *is* the claim.**
- **Custom enquiry = deposit only.** **Never auto-price a custom tattoo** — it can't be priced
  without the consultation. The deposit confirms the booking date; the **balance is quoted and
  paid in person on the day**. The website never charges the custom total.
- **The deposit is the shared primitive** (flat £ or % of a known price — config-driven) and the
  trigger that hands off to [`SCHEDULING.md`](./SCHEDULING.md).

| Path | What the site charges | When | Methods that fit |
|---|---|---|---|
| **Flash** | Full price (e.g. £180) | At claim | Card, **Klarna** (pay-in-3 ≈ £60×3), PayPal, bank transfer |
| **Custom** | Deposit only | After the artist quotes | Card, bank transfer, PayPal (Klarna pointless on a small deposit) |
| **Custom balance** | Nothing online | In person, on the day | — |

## 2. Architecture — one Stripe engine

The studio wanted *"the safest integration with the highest functionality and control,"* plus
**Klarna**. That resolves to a single Stripe integration, embedded on-site:

- **Stripe is the engine.** One integration surfaces **card · Link · Apple/Google Pay · Klarna ·
  PayPal** via the embedded **Payment Element** + `automatic_payment_methods` — each method
  toggled on in the Stripe dashboard, **no code**. **PayPal is a native Stripe payment method for
  UK accounts** (verified June 2026), so there is **no separate PayPal Orders-API integration**.
  Code stays Stripe-only (`payments.provider` is always `'stripe'`).
- **Embedded, on-site — PCI SAQ-A.** Card fields are Stripe-hosted iframes, so **no raw card data
  touches our origin** (the "safest" part). Redirect methods (Klarna/PayPal/wallets) bounce
  off-site and back to a small return page — inherent to those methods, not a second integration.
- **No SDK.** The Worker calls the Stripe **REST API** directly with `fetch` and verifies webhooks
  with a hand-rolled **Web-Crypto HMAC-SHA256** (`src/lib/stripe.js`). Keeps the bundle tiny and
  needs no Node shims — there is intentionally no `stripe` dependency in `package.json`.
- **Monzo Business is the payout bank, not an integration.** Stripe pays out into it. It also
  gives the **free bank-transfer route** (Monzo Business "Get Paid", £0 fee — see §9), reconciled
  **manually in the [`/studio` dashboard](./DASHBOARD.md)**, *not* an on-page method. (Monzo's own
  card links are Stripe under the hood, so going Stripe-direct is strictly more control.)
- **Server-side amount authority.** The client never sends the price (see §6.2).

So the customer sees **card · Klarna · PayPal · bank transfer**, everything settles into the
**Monzo Business** account, and the whole on-site journey is a single Stripe Payment Element.

## 3. Status — shipped dark, and the isolation contract

The feature is built to **develop in the background and toggle on when ready**, with **no effect
on the launch journey** (marketing site, enquiry form, claim-by-enquiry, newsletter) until the
switch is flipped. Enforced in code + tests:

- **Front end is unchanged until a build flag flips it.** The backbone touches **no `apps/web`
  files** (the built bundle hash is identical). Step 4 gates the embedded UI behind a build-time
  `VITE_PAYMENTS_ENABLED`; **off → the flash "Claim" button behaves exactly as today** (POST
  `/enquiry` → `/enquiry-received/`), so the frontend can merge and ship dark too.
- **Worker routes are additive + flagged.** `/checkout` returns **503 unless
  `PAYMENTS_ENABLED === 'true'`**; `/webhooks/stripe` is a path nobody calls until Stripe is
  configured. `/enquiry`, `/newsletter`, `/flash-status` are untouched.
- **No dependency on migration `0002` for the non-payment path.** `reserveFlashPiece` without an
  expiry (the claim-by-enquiry path) uses the original 3-column insert and never references
  `expires_at`; the lazy stale-sweep in `getFlashClaims` is **gated on `PAYMENTS_ENABLED`**, so
  with payments off that read is byte-for-byte as before. `0002` only needs applying **when you
  turn payments on**, and is purely additive when you do.
- **Everything is fail-safe** — a half-configured state (code deployed, flag off, or migration not
  applied) degrades to "no payments offered", never to a broken enquiry/claim.

**To turn it on:** apply `0002` → set Worker secrets (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`) + `PAYMENTS_ENABLED="true"` → set `VITE_PAYMENTS_ENABLED` on the web
build → rebuild (full runbook in §9). **To turn it off:** unset `PAYMENTS_ENABLED` (and the build
flag). No code change either way.

## 4. End-to-end flow (Phase 1 — flash)

```
Claim modal (name, email, placement)
  → POST /checkout { kind:'flash', piece_id, fields }
      Worker: rate-limit → validate → look up price (server authority §6.2)
            → reserveFlashPiece(pending, +48h hold)    [409 if already taken]
            → recordPayment(status 'awaiting')
            → create Stripe PaymentIntent (REST via fetch)  → { client_secret }
  → browser mounts the Payment Element (card / Klarna / PayPal …) in the modal, confirms on-site
  → customer pays
      Stripe → POST /webhooks/stripe  (payment_intent.succeeded)
            Worker: verify signature (Web-Crypto HMAC) → dedupe by event id
                  → promote piece pending→claimed
                  → mark payment 'paid'
                  → email customer receipt + artist notification
  → in-modal confirmation (no page redirect; Klarna & co. bounce back via return_url)
Abandoned/unpaid → payment_intent.canceled + 48h stale-release frees the piece
```

---

# Build spec — Phase 1 (flash full payment)

The executable plan. Steps 1–3 & 5 are **shipped dark**; step 4 (frontend) is the one remaining
slice. Decisions locked with the studio (2026-06): in-flow embedded on-site, flash-only for now,
flash = full payment, one Stripe integration carries every method, server-side amount authority,
reference format `BSF-<piece-id>-<4char>`, stale-pending window 48h (PaymentIntent expires ~30
min), staging-only until the apex cutover (no `apps/web/public/CNAME` — guardrail in `CLAUDE.md`),
test-mode keys first behind `PAYMENTS_ENABLED`.

## 5. Dependencies & secrets

- **`apps/functions`: no SDK** (see §2). Worker talks Stripe REST + Web-Crypto HMAC.
- **Worker secrets** (`wrangler secret put …`, test-mode keys first): `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`.
- **Stripe dashboard**: connect the **Monzo Business** payout bank; enable **Klarna**/**PayPal**
  under Payment methods (they surface via `automatic_payment_methods`); add the webhook endpoint
  (`…workers.dev/webhooks/stripe`, events **`payment_intent.succeeded`** +
  **`payment_intent.canceled`**). Full click-path in §9.

## 6. Server side (shipped)

### 6.1 Data model — migration `0002_payments.sql`

Same numbered-SQL pattern as `0001_init.sql`; **purely additive**, only needed when payments go on.

```sql
-- Payments ledger — one row per checkout attempt; the system of record for money.
CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,          -- our ref, e.g. BSF-flash-01-a1b2
  kind          TEXT NOT NULL,             -- 'flash' | 'deposit'
  status        TEXT NOT NULL,             -- 'awaiting' | 'paid' | 'failed' | 'expired' | 'refunded'
  provider      TEXT NOT NULL DEFAULT 'stripe',
  provider_ref  TEXT,                      -- stripe session id (cs_…), then payment_intent (pi_…)
  amount_pence  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'gbp',
  email         TEXT,
  piece_id      TEXT,                      -- flash piece (NULL for a custom deposit)
  submission_id TEXT,                      -- links to submissions.id
  created_at    TEXT NOT NULL,
  paid_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider_ref);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status);

-- Webhook idempotency — Stripe re-delivers; process each event id once.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,            -- stripe event id (evt_…)
  type        TEXT,
  received_at TEXT NOT NULL
);

-- Stale-pending release: when an unpaid reserve should auto-free.
ALTER TABLE flash_claims ADD COLUMN expires_at TEXT;
```

Apply with `wrangler d1 migrations apply beansprout`. `flash_claims` keeps its `pending`/`claimed`
semantics; payment detail lives in `payments`, joined on `piece_id`/`submission_id`.

### 6.2 Server-side price authority (must-not-skip)

**The browser must never set the amount.** `flash.js` (in `apps/web`) is the price source of
truth, but the Worker can't import across workspaces without coupling the two deploys. Resolution:
`apps/functions/scripts/sync-flash-prices.mjs` reads `apps/web/src/data/flash.js` (pure data) and
writes a committed `apps/functions/src/data/flash-prices.json` (`{ "flash-01": 18000, … }`,
**pence**). The Worker imports that JSON and looks the price up by `piece_id`; an unknown id →
`400`. Run `npm run sync:prices` whenever a drop's prices change and **commit** the regenerated
JSON; a CI drift guard fails if the manifest and `flash.js` disagree.

### 6.3 Worker routes & handlers

`src/index.js` `ROUTES` adds:
```js
'/checkout':        checkout,        // POST  create a PaymentIntent (returns client_secret)
'/webhooks/stripe': stripeWebhook,   // POST  Stripe → us (no CORS, raw body)
```

**`src/handlers/checkout.js`** (mirrors `enquiry.js`): OPTIONS/POST + `corsFor`/`replyWith`;
env-guard `STRIPE_SECRET_KEY`; `PAYMENTS_ENABLED` guard → 503; parse
`{ kind:'flash', piece_id, fields:{ name, email, placement } }`; `clampFields`; honeypot;
validate required + `EMAIL_RE`; **rate-limit** (`storeName:'checkout-rate'`) before any Stripe
call; price lookup from the manifest (§6.2, reject unknown/zero); `reserveFlashPiece` → `409` if
taken, set `expires_at = now + 48h`; `persistSubmission` + insert a `payments` row
(`status:'awaiting'`, the `BSF-…` ref as id); create the PaymentIntent (REST, **idempotency-keyed
on our reference**):

```js
const body = new URLSearchParams()
body.set('amount', String(pricePence))                  // server-side authority (§6.2)
body.set('currency', 'gbp')
body.set('automatic_payment_methods[enabled]', 'true')  // card + Klarna + PayPal (per dashboard)
body.set('receipt_email', email)
body.set('metadata[kind]', 'flash')
body.set('metadata[piece_id]', piece_id)
body.set('metadata[payment_ref]', paymentRef)
const res = await fetch('https://api.stripe.com/v1/payment_intents', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Idempotency-Key': paymentRef,
  },
  body,
})
```

Store `intent.id` (`pi_…`) on the payment row; reply
`{ clientSecret, reference, amount, currency:'gbp' }`. **Failure rollback** mirrors `enquiry.js`:
on `!res.ok`/no `client_secret`, `releaseFlashPiece` + mark the payment `failed`, return `502`.

**`src/handlers/stripe-webhook.js`**: POST only; use the **raw** `event.body` (the `toEvent`
adapter hands us the untouched string — do **not** re-`JSON.stringify`) + the `stripe-signature`
header. **Verify with Web Crypto** (`src/lib/stripe.js`): split `t=`/`v1=`, recompute
`HMAC-SHA256(secret, "${t}.${rawBody}")`, compare, reject a stale timestamp → bad signature
`400`. **Idempotency:** `INSERT … ON CONFLICT DO NOTHING` into `webhook_events`; no row changed =
replay → `200` stop. On **`payment_intent.succeeded`**: read metadata, **re-check the amount**,
`promoteFlashClaim` (pending→claimed, idempotent), mark `payments` `paid` + `paid_at` + the
`pi_…`, send the two emails (§6.5). On **`payment_intent.canceled`**: mark `expired` +
`releaseFlashPiece`. Other types → `200` ignore. Return `200` quickly, never throw to Stripe; no
CORS (server-to-server) — just `SECURITY_HEADERS`.

**`src/lib/db.js`** helpers (all fail-safe): `recordPayment`, `getPayment`, `markPaymentStatus`,
`promoteFlashClaim`, `expirePendingClaims(now)`, `recordWebhookEvent`, plus `reserveFlashPiece`
hold-expiry.

### 6.4 Stale-pending release (shipped)

- **Lazy (shipped):** `expirePendingClaims(now)` runs at the top of `getFlashClaims` (the
  `flash-status` read on every grid load), so an abandoned reserve frees itself the next time
  anyone views `/flash/` — no cron.
- **Belt-and-braces (optional):** a Cloudflare **Cron Trigger**
  (`[triggers] crons = ["*/30 * * * *"]` + a `scheduled()` export) calling the same function. Add
  when convenient; the lazy path covers the common case.

### 6.5 Emails (Resend) — reuse the enquiry pattern

Same `fetch('https://api.resend.com/emails', …)` call as `enquiry.js`. **Customer receipt** —
"Your flash piece is booked", piece + amount + reference + what happens next (the in-person
session). **Artist notification** — "Flash <piece> PAID by <name>", contact + placement +
reference. Best-effort; the Resend secrets are the existing ones.

## 7. Frontend — the embedded Payment Element (step 4, the one remaining slice)

Wires the flash modal to the shipped backbone: one Stripe integration, embedded Payment Element,
no card data on our origin. Account/dashboard set-up is the studio's (§9).

**Method line-up — one integration, surfaced dynamically.** `/checkout` already creates the
PaymentIntent with `automatic_payment_methods[enabled]='true'`, so a UK GBP customer sees, from
this **single** integration (each toggled on in the dashboard, no code): **Card** (iframes, SAQ-A)
· **Link** · **Apple/Google Pay** (Apple Pay needs the domain registered — §9) · **Klarna**
(redirect) · **PayPal** (redirect; **native Stripe method for UK accounts** — no separate
integration). Bank transfer stays a manual, off-page option in the [dashboard](./DASHBOARD.md).

**Files to touch:**

- **`src/js/modules/flash.js`** — change only the modal submit path. Gate on `PAYMENTS_ENABLED`:
  off → **byte-for-byte today's behaviour** (POST `{kind:'flash', fields}` to `ENQUIRY_FN_URL`,
  `markCard('pending')`, close). On → POST to **`CHECKOUT_FN_URL`** with the form `fields` **and
  `piece_id` sent explicitly**, then on `{ clientSecret }` lazy-load Stripe.js, mount the Payment
  Element, and `stripe.confirmPayment({ elements, confirmParams: { return_url } })`. **Drop the
  optimistic `markCard('pending')`** — the **webhook is the source of truth**; the grid reconciles
  via `loadLiveStatus()`. Keep a `409` (taken → `markCard('claimed')`, modal open) and a `503`
  (payments off → fall back to the enquiry flow) branch, plus the shared spinner.
  - ⚠️ **Wiring caveat (load-bearing):** the Worker resolves the id from
    `payload.piece_id || fields.piece_id` (`checkout.js`) and the live modal hidden input is
    `name="piece_id"` (`flash/index.html`), but the jsdom fixture uses `name="id"`. **Send
    `piece_id` in the body and align the test fixture**, or the price lookup 404s. The price field
    is decorative — the Worker never trusts it (server authority §6.2).
- **`flash/index.html`** — add an empty `<div id="payment-element">`, a hidden confirmation panel,
  and a distinct "Pay" button revealed once the Element mounts (copy under the `FLASH-05` marker).
- **`src/js/modules/config.js`** — add `CHECKOUT_FN_URL` (`VITE_CHECKOUT_FN_URL`),
  `PAYMENTS_ENABLED` (`VITE_PAYMENTS_ENABLED === 'true'`), `STRIPE_PUBLISHABLE_KEY`
  (`VITE_STRIPE_PUBLISHABLE_KEY` — a `pk_…`, **safe in the bundle**; `sk_…`/`whsec_…` live only in
  the Worker). Document all three in `.env.example`.
- **`src/build/security.js`** — the Element needs Stripe hosts the site doesn't load today. Add
  `script-src https://js.stripe.com` · `frame-src https://js.stripe.com https://hooks.stripe.com`
  · `connect-src https://api.stripe.com` · `img-src https://*.stripe.com`, plus
  `VITE_CHECKOUT_FN_URL`'s origin in `workerConnectOrigins()`. *(If a 3DS test card surfaces a
  frame violation, add `https://m.stripe.network` to `frame-src`.)* Verify on
  `npm run build && npm run preview` — the strict CSP is build/preview-only.
- **`vite.config.js`** — add a **noindex** return landing `/flash/payment-return/` (its own Rollup
  `input`; **not** in `ROUTES`/sitemap, like `/enquiry-received/`). Redirect methods bounce back to
  its `return_url`; on load it reads `?payment_intent_client_secret`, calls
  `stripe.retrievePaymentIntent`, and renders the status (`succeeded` → "you're booked";
  `processing` → "we'll email you"; `requires_payment_method` → "try again"). The **webhook still
  does the real promotion** — this page is just the customer's view of the return.

**Confirmation UX:** card/Link resolve in the modal → confirmation panel; Klarna/PayPal/wallets
redirect to `/flash/payment-return/`. Either way money-truth = the webhook; the UI is
optimistic-but-honest and the grid catches up via the `flash-status` overlay.

## 8. Tests & build sequence

**Tests.** *Functions* (Vitest + `fake-d1`, mock `fetch` to Stripe/Resend): `checkout`
(validation, unknown-piece `400`, reserve `409`, happy path writes an `awaiting` payment + returns
a `client_secret`, rollback on Stripe failure); `stripe-webhook` (valid vs **bad signature** `400`,
**replay** dedupe, promotion pending→claimed + payment `paid` + emails fired, unknown event
ignored, fail-safe on DB error). *Web (jsdom)*: flash submit — **payments off** unchanged; **on**
POST `/checkout` with `piece_id`, **stub `window.Stripe`**, assert the Element mounts + the
confirmation panel; `409`/`503` branches. *E2E (Playwright — the real gate)*: a payments-on build
that **stubs both** `**/checkout` and `js.stripe.com` (never hit real Stripe) — open modal →
submit → assert the Element + confirm button → simulate success → assert confirmation; plus a small
`/flash/payment-return/` spec. *Web-session build proof* (no browser): `npm run build`, then grep
`dist/` for the Stripe CSP hosts + `/flash/payment-return/index.html`, and that with the flag off
the flash behaviour is unchanged.

**Build sequence** (one PR per step, all → `develop`):

1. ✅ **Groundwork (landed)** — migration `0002`, `scripts/sync-flash-prices.mjs` + the committed
   `flash-prices.json` (+ `npm run sync:prices` + CI drift guard), the `db.js` helpers, fail-safe
   unit tests. No customer-facing change.
2. ✅ **`/checkout` handler (landed)** — validate + rate-limit + server-side price → reserve (48h
   hold) → `recordPayment('awaiting')` → create PaymentIntent (REST, no SDK, idempotency-keyed) →
   return `client_secret`; rolls back on failure; dark behind `PAYMENTS_ENABLED` (503 until set).
   18 unit tests.
3. ✅ **`/webhooks/stripe` handler (landed)** — Web-Crypto signature verify → dedupe by event id →
   on success: re-check amount, `promoteFlashClaim` + `markPaymentStatus('paid')` + receipt/artist
   emails; on cancel: `expired` + release. Idempotent + fail-safe. 12 unit tests.
4. ⬜ **Frontend (the remaining slice)** — §7: wire the flash modal, mount the Payment Element,
   `/flash/payment-return/`, config/CSP/Vite wiring, web + E2E tests. Flag off → ships dark.
5. ✅ **Stale release (landed)** — `getFlashClaims` lazily sweeps lapsed holds before reporting;
   `DATA-COMPLIANCE.md` updated (payments = financial record, erasure-exempt while paid;
   `webhook_events` prunable).
6. ⬜ **Verify on staging** end-to-end with Stripe **test mode** (§9), then live keys.

---

## 9. Go-live setup (operator runbook — Stripe + Monzo Business)

The studio/operator work to take the shipped-dark backbone live — **none of it is in the repo**.
Do it in **test mode first**, verify end-to-end, then swap to live keys.

**0. Prerequisites.** A **Monzo Business** account (Lite £0/mo is enough to *receive* Stripe
payouts — §10); its sort code + account number. Wrangler installed & logged in. The Worker
already deployed (`beansprout-forms`) with D1 bound.

**1. Open the Stripe account (test mode).** Create at https://dashboard.stripe.com (UK business,
GBP). Stay in **Test mode** for §1–§8; full activation/KYC is only needed before live keys.

**2. Connect Monzo Business as the payout bank.** Stripe → **Settings → Business → Bank accounts
and currencies → Add bank account** → Monzo Business sort code + account number (holder name must
match the Monzo statement). Default automatic daily payout is fine. (Stripe takes
fees/refunds/disputes from this account.)

**3. Enable payment methods (no code).** Stripe → **Settings → Payment methods**, for GBP: **Cards**
+ **Link** (on by default); **Klarna** — "Turn on" (best on fixed-price flash; funds land upfront
minus fees, Klarna carries the credit risk); **PayPal** — "Turn on" (eligible UK accounts; then
appears in the Payment Element via `automatic_payment_methods`, no code); **Apple/Google Pay** —
enable, and for **Apple Pay register the web domain** (Settings → Payment methods → Apple Pay → Add
domain — the staging Pages domain now, the apex at cutover). These map 1:1 to what the Element
renders; the Worker already requests them all.

**4. Get the API keys** (Developers → API keys, Test mode): **Publishable** `pk_test_…` (**not
secret**, baked into the bundle as `VITE_STRIPE_PUBLISHABLE_KEY`); **Secret** `sk_test_…` (**Worker
secret only**, never in the repo).

**5. Register the webhook + copy the signing secret.** Developers → Webhooks → Add endpoint →
**URL** `https://beansprout-forms.<subdomain>.workers.dev/webhooks/stripe`; **Events**
`payment_intent.succeeded` **and** `payment_intent.canceled` (exactly the two the handler
processes — don't over-subscribe). Save → reveal the **Signing secret** `whsec_…` → it goes into
`STRIPE_WEBHOOK_SECRET`. This is what the Web-Crypto HMAC verify checks (`src/lib/stripe.js`).

**6. Set the Worker secrets + flags** (from `apps/functions/`, test keys first):
```bash
wrangler secret put STRIPE_SECRET_KEY        # paste sk_test_…
wrangler secret put STRIPE_WEBHOOK_SECRET    # paste whsec_… from §5
```
Set `PAYMENTS_ENABLED="true"` (uncomment in `wrangler.toml` `[vars]` + `wrangler deploy`, or set
it in the Cloudflare dashboard) so `/checkout` stops returning 503. (Resend secrets for the emails
are already set per `ENQUIRY-SETUP.md`.) **Web build vars** — on the build that serves `/flash/`
(Cloudflare Pages env for staging; GitHub Actions Variables for the Pages production build):
```
VITE_PAYMENTS_ENABLED=true
VITE_CHECKOUT_FN_URL=https://beansprout-forms.<subdomain>.workers.dev/checkout
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…
```
**Rebuild after changing these — Vite bakes them in.**

**7. Apply the migration + sync prices** (from `apps/functions/`):
```bash
npm run migrate           # applies 0002_payments.sql (additive; only needed with payments on)
npm run sync:prices       # regenerates src/data/flash-prices.json from apps/web/src/data/flash.js — commit it
```

**8. Verify in test mode (before live keys).** Build the web with the test `VITE_*` vars and serve
it. On `/flash/`, claim a piece and pay with a Stripe **test card** (`4242 4242 4242 4242`, any
future expiry/CVC) → confirm the in-modal confirmation. Run the **redirect** methods (Klarna test
flow, PayPal sandbox) → confirm the bounce to the provider and back to `/flash/payment-return/`.
Check the **webhook** delivered (Developers → Webhooks → recent deliveries: `succeeded` = 200),
the piece reads **claimed** on a `/flash/` reload, the **receipt + artist emails** arrived, and
the **`payments` row** is `paid`
(`wrangler d1 execute beansprout --command "SELECT id,status,amount_pence FROM payments ORDER BY created_at DESC LIMIT 5"`).
**Abandon** a checkout → the piece frees on the next grid load (lazy `expirePendingClaims`) and/or
a `payment_intent.canceled` marks it `expired`. Confirm the **CSP** doesn't block the Element
(load the **built** flash page — CSP is build/preview only — console clean for
`js.stripe.com`/`api.stripe.com`/`hooks.stripe.com`).

**9. Go live.** Only after §8 is clean **and** the apex guardrail allows it (`CLAUDE.md` — no
`apps/web/public/CNAME` until ROADMAP Phase 6; until then payments run on **staging only**): flip
Stripe to **Live mode** (complete KYC if prompted); re-do §3 (live), §4 (`pk_live_…`/`sk_live_…`),
§5 (a **live** webhook → new `whsec_…`); re-run §6 with live keys (and
`VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` + rebuild) and §7 `migrate` against the live D1; do **one
real low-value live transaction** end-to-end and confirm webhook + emails + payout-to-Monzo.

**Reconciliation, refunds, bank transfer** live in the artist [dashboard](./DASHBOARD.md) and the
Stripe Dashboard, not this flow. **To turn payments OFF again:** unset `PAYMENTS_ENABLED` (Worker)
→ `/checkout` 503s and the modal falls back to the enquiry flow; unset `VITE_PAYMENTS_ENABLED` +
rebuild → the Claim button reverts. No code change either way.

---

## 10. Fees — cost reference (UK, verified June 2026)

> Rates change — re-check the provider's own pricing page before relying on a figure. None of this
> is a code change.

**The finding that reframes the question.** "Monzo vs Stripe" is largely a false choice for cards:
Monzo Business's "Get Paid" card acceptance is **processed by Stripe under the hood**. So the real
cost axes are (1) **bank transfer (free) vs card (a Stripe-rate %)**, and (2) **manual
reconciliation (£0 software, costs your time) vs automated webhooks (a % skim, buys automation)**.
For small low-volume deposits the cheapest path is a **Monzo Business "Get Paid" easy bank
transfer**: £0 fee, pre-fills the reference — which is why the live Stripe plan **keeps** that free
route alongside card/Klarna rather than dropping it.

| Provider / method | Per-transaction fee | Monthly | Notes |
|---|---|---|---|
| **Monzo Business — easy bank transfer** | **£0.00** | Lite £0 / Pro £9 | Faster Payments; fee-free, pre-fills the reference. |
| **Monzo.me** (personal P2P) | **£0.00** | £0 | Free, **but personal accounts aren't for business use** — see note. |
| **Monzo Business — card (via Stripe)** | **1.4% + 20p** UK · 2.5% + 20p EEA · 2.9% + 20p other | as above | Stripe processes it; Monzo passes the fee through. |
| **Stripe** (direct) | **1.5% + 20p** UK · 2.5% + 20p EEA · 3.25% + 20p intl | £0 | +2% currency conversion. Chargeback **£20/dispute** (kept even if you win). |
| **PayPal** — Goods & Services | **2.9% + 30p** UK · +1.29% EEA · +1.99% non-EEA | £0 | +3–4% conversion. |
| **PayPal** — Friends & Family | £0 | £0 | **Against ToS for business + no buyer protection.** Not a real option. |
| **Klarna** | ~2.95% flat reported (instalments ~5–6%) | varies | Now delivered via Stripe (just enable). |

**Worked examples** (deposits are small, so the fixed fee dominates):

| £30 deposit | Fee | You keep | | £50 deposit | Fee | You keep |
|---|---|---|---|---|---|---|
| Monzo Business transfer | £0.00 | £30.00 (**0%**) | | Monzo Business transfer | £0.00 | £50.00 (**0%**) |
| Monzo/Stripe card (UK) | ~£0.65 | ~£29.35 (~2.2%) | | Monzo/Stripe card (UK) | ~£0.95 | ~£49.05 (~1.9%) |
| Klarna (~2.95%) | ~£0.89 | ~£29.11 (~3.0%) | | PayPal G&S (UK) | £1.75 | £48.25 (~3.5%) |
| PayPal G&S (UK) | £1.17 | £28.83 (**~3.9%**) | | | | |

**Costs that aren't the headline %:** reconciliation labour (the manual model's true cost, which a
gateway's % buys back via webhooks); chargebacks (~£20/dispute on Stripe; P2P transfers have none);
refunds (Stripe/PayPal don't return the original fee); PCI scope (Elements keeps card data off the
site, SAQ-A). **Monzo monthly:** taking free bank transfers only needs **Monzo Business Lite
(£0/mo)**.

**Note — Monzo.me vs "Get Paid".** Monzo.me is a *personal*-account P2P link, and Monzo's terms say
personal accounts aren't for business use. The business-correct equivalent is **Monzo Business "Get
Paid"** — same near-zero-cost path (free easy transfers, pre-filled reference) without the ToS
issue. Pin which the studio actually uses before going live.

**Bottom line:** low volume + small deposits → **bank transfer wins on cost**; Stripe's ~2% becomes
worth paying when volume makes manual reconciliation a chore worth automating away — and even then
Monzo Business already gives Stripe card rails + free transfers without a separate integration.

---

## 11. Phase 2 — custom deposits (outline)

Reuse everything above with `kind:'deposit'`: the artist quotes offline → issues a tokenised "pay
your deposit" link (a `/checkout` call seeded from `/studio` or a `wrangler` one-liner at first) →
success confirms the **booking date** (hands to [`SCHEDULING.md`](./SCHEDULING.md), optional `.ics`
invite); customer + artist emailed. **No full price is ever generated for a custom tattoo**; the
balance is paid in person. Card/bank transfer only (no Klarna on a small deposit). The token-
protected [`/studio`](./DASHBOARD.md) lists payments, marks a **manual Monzo bank-transfer** deposit
paid, and issues refunds.

## 12. Phase 3 — more methods & polish (outline)

Refund/cancellation flows matching the cancellation copy (issued from the dashboard / Stripe
Dashboard); reminders; a reconciliation view. *(PayPal is **not** a separate track — it ships with
step 4 as a native Stripe method. The embedded on-site Payment Element is the chosen flash model,
not a later swap.)*

## 13. Open decisions

1. **Stripe as the engine** — OK to open a Stripe account paying out to Monzo Business? *(the
   load-bearing decision — it's what shipped dark.)*
2. **Flash:** full-payment-only, or also offer deposit-to-hold + balance on the day?
3. **Deposit rule:** flat £ or % of price — and the figure?
4. **Klarna on flash from day one** (cheap via Stripe), or hold it back?

Resolved (no longer open): PayPal scope (ships with step 4 as a native Stripe method, no separate
integration — June 2026); reference format & stale window (`BSF-<piece>-<4char>` / 48h, as built).
None of the open items block step 4.

## 14. Superseded — the original manual-links plan

The first decision (2026-06) was **manual PayPal.Me + Monzo.me links, hand-reconciled, no gateway
to build** — kept here for the record. It was superseded when the studio asked for *"the safest
integration with the highest functionality and control"* plus **Klarna**, which manual links can't
give (Klarna is a real gateway; "control/automation" means webhooks). The manual route survives
only as the **zero-build fallback** and the free Monzo bank-transfer option (§9). The three gaps it
identified — `pending→claimed` promotion, a customer email, stale-pending release — are exactly
what the Stripe webhook model now closes automatically.

## Sources

- Stripe — [UK pricing](https://stripe.com/gb/pricing) ·
  [PayPal as a Stripe method](https://docs.stripe.com/payments/paypal) /
  [activate](https://docs.stripe.com/payments/paypal/activate) ·
  [dynamic/automatic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods) ·
  [Payment Element](https://docs.stripe.com/payments/payment-element) ·
  [recommended CSP](https://docs.stripe.com/security/guide) ·
  [add a payout bank account](https://support.stripe.com/questions/add-a-bank-account-for-payouts)
- Monzo — [Get Paid fees](https://monzo.com/help/business-accounts/business-getpaid-fees) ·
  [Stripe online card payments](https://monzo.com/help/business-getpaid/business-getpaid-stripe-online-card-payments) ·
  [Stripe payout to a Monzo Business account](https://monzo.com/help/business-getpaid/stripe-pay-out-web) ·
  [Business plans & pricing](https://monzo.com/business-banking/plans-pricing)
- PayPal — [business/merchant fees](https://www.paypal.com/uk/business/paypal-business-fees)
- Klarna — [merchant fees](https://www.klarna.com/uk/business/merchant-support/how-do-i-pay-klarnas-fees/) ·
  [Merchant Machine — Klarna UK fees](https://merchantmachine.co.uk/bnpl/klarna/)
