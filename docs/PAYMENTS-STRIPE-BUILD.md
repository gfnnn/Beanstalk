# Stripe payments — build spec (Phase 1 in detail)

The executable plan for wiring **Stripe** into the site, per
[`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md). Phase 1 (flash full payments) is specced
file-by-file here; Phases 2–3 are outlined at the foot and flesh out once Phase 1 ships and
the open decisions are confirmed.

Stripe is the engine: one integration carries **card + Klarna**, funds land in the Stripe
balance and pay out to the **Monzo Business** account. Card data is entered in Stripe's own
**iframe fields** (the embedded **Payment Element**), so it never touches our origin (PCI
**SAQ-A**); the Worker does all the secret-bearing API talking.

## Decisions locked (2026-06)

These supersede the earlier "redirect" assumption — confirmed with the studio:

- **In-flow, embedded, on-site.** The payment is a **step the customer never visibly leaves
  the site for**: a Stripe **Payment Element** (card + Klarna), **PayPal smart buttons**, and a
  **Monzo Business bank-transfer panel**, chosen via a **method toggle**. Trade-off vs a
  redirect: a little more JS + a few provider hosts added to the CSP (§7).
- **Flash only (for now).** The inline step appears **only for flash pieces** (a known, fixed
  price). The **custom enquiry flow is untouched** — it still POSTs and lands on
  `/enquiry-received/`; its deposit keeps the documented *"after the artist quotes, via a
  tokenised link"* model (Phase 2). The site never auto-prices a custom tattoo.
- **Flash = full payment** at claim (deposit-to-hold option still parked for later).
- **Stripe (card + Klarna) is the day-one engine** — that's what the backbone ships. **PayPal**
  and the **Monzo bank-transfer panel** are parallel methods added on top; whether they land
  *with* the step-4 frontend or as a fast-follow is an **open decision** (see the foot of this
  file). The code today is Stripe-only (`payments.provider` is always `'stripe'`).
- **Amount authority is server-side** — the client never sends the price (see §3). ✅ built.
- **Reference format** `BSF-<piece-id>-<4char>`; **stale-pending window 48h**, with the
  Stripe PaymentIntent/session expiring at ~30 min.
- Ships to **staging only** until the apex cutover — no `apps/web/public/CNAME` (guardrail in
  `CLAUDE.md`), test-mode keys first, behind a `PAYMENTS_ENABLED` flag.

## Isolation — zero impact on the non-payment go-live (a hard requirement)

The whole feature is built to **develop in the background and toggle on when ready**,
with **no effect on the launch journey** (marketing site, enquiry form, claim-by-enquiry,
newsletter) until that switch is flipped. The guarantees, enforced in code + tests:

- **Front end is unchanged until a build flag flips it.** The backbone PR touches **no
  `apps/web` files at all** (the built bundle hash is identical). Slice 4 will gate the
  embedded payment UI behind a build-time `VITE_PAYMENTS_ENABLED`; **off → the flash
  "Claim" button behaves exactly as today** (POST `/enquiry` → `/enquiry-received/`). So the
  frontend can merge and ship dark too.
- **Worker routes are additive + flagged.** `/checkout` returns **503 unless
  `PAYMENTS_ENABLED === 'true'`**; `/webhooks/stripe` is a new path nobody calls until Stripe
  is configured. The existing `/enquiry`, `/newsletter`, `/flash-status` are untouched.
- **No dependency on migration `0002` for the non-payment path.** `reserveFlashPiece`
  *without* an expiry (the claim-by-enquiry path) uses the **original 3-column insert** — it
  never references `expires_at`. The lazy stale-sweep in `getFlashClaims` is **gated on
  `PAYMENTS_ENABLED`**, so with payments off that read is byte-for-byte as before. ⇒ `0002`
  only needs applying **when you turn payments on**, and is purely additive when you do.
- **Everything is fail-safe**, so even a half-configured state (code deployed, flag off, or
  migration not yet applied) degrades to "no payments offered", never to a broken enquiry/claim.

**To turn it on, later:** apply `0002` → set Worker secrets (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`) + `PAYMENTS_ENABLED="true"` → set `VITE_PAYMENTS_ENABLED` on the
web build → rebuild. **To turn it off:** unset `PAYMENTS_ENABLED` (and the build flag). No
code change either way.

## End-to-end flow (Phase 1)

```
Claim modal (name, email, placement)
  → POST /checkout { kind:'flash', piece_id, fields }
      Worker: rate-limit → validate → look up price (server authority)
            → reserveFlashPiece(pending, +48h hold)    [409 if already taken]
            → record payment row (status 'awaiting')
            → create Stripe PaymentIntent (REST via fetch)  → { client_secret }
  → browser mounts the Payment Element (card / Klarna) in the modal, confirms on-site
  → customer pays
      Stripe → POST /webhooks/stripe  (payment_intent.succeeded)
            Worker: verify signature (Web-Crypto HMAC) → dedupe by event id
                  → promote piece pending→claimed
                  → mark payment 'paid'
                  → email customer receipt + artist notification
  → in-modal confirmation state (no page redirect; Klarna & co. bounce back via return_url)
Abandoned/unpaid → payment_intent.canceled + 48h stale-release frees the piece
```

## 1. Dependencies & secrets

- **`apps/functions`**: **no SDK** — the Worker calls the Stripe REST API directly with
  `fetch` and verifies webhooks with a hand-rolled **Web-Crypto HMAC-SHA256**
  (`src/lib/stripe.js`). Keeps the bundle tiny and the Node shims unneeded. *(As built — there
  is intentionally no `stripe` dependency in `package.json`.)*
- **Worker secrets** (`wrangler secret put …`, test-mode keys first):
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Add them to the `wrangler.toml` header
  checklist and `docs/ENQUIRY-SETUP.md` (or a new `docs/PAYMENTS-SETUP.md`).
- **Stripe dashboard**: connect the **Monzo Business** account as the payout bank; enable
  **Klarna** under Payment methods (it surfaces via `automatic_payment_methods`); add the
  webhook endpoint (`…workers.dev/webhooks/stripe`, events **`payment_intent.succeeded`** +
  **`payment_intent.canceled`**, copy its signing secret into `STRIPE_WEBHOOK_SECRET`).

## 2. Data model — migration `0002_payments.sql`

New file in `apps/functions/migrations/` (same numbered-SQL pattern as `0001_init.sql`):

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

Apply with `wrangler d1 migrations apply beansprout`. `flash_claims` keeps its existing
`pending`/`claimed` semantics — payment detail lives in `payments`, joined on
`piece_id`/`submission_id`.

## 3. Server-side price authority (the must-not-skip bit)

**The browser must never set the amount.** `flash.js` (in `apps/web`) is the single source of
truth for prices, but the Worker can't import across workspaces without coupling the two
deploys (which the monorepo avoids). Resolution:

- Add `apps/functions/scripts/sync-flash-prices.mjs` — reads `apps/web/src/data/flash.js`
  (pure data, no imports) and writes a committed `apps/functions/src/data/flash-prices.json`
  (`{ "flash-01": 18000, … }`, **pence**). Run it when a drop changes (wire into a predeploy
  later).
- The Worker imports that JSON and looks the price up by `piece_id`; an unknown id → `400`.
  This keeps `flash.js` authoritative, keeps the Worker self-contained, and makes the amount
  un-tamperable. (Alternative if you'd rather not have a manifest: a `flash_pieces` D1 table
  seeded by the same script — same effect, one more table.)

## 4. Worker — routes & handlers

**`src/index.js`** — add to `ROUTES`:
```js
'/checkout':        checkout,        // POST  create a PaymentIntent (returns client_secret)
'/webhooks/stripe': stripeWebhook,   // POST  Stripe → us (no CORS, raw body)
```

**`src/handlers/checkout.js`** (mirrors `enquiry.js` structure):
- `OPTIONS`/`POST` + `corsFor`/`replyWith` as today; method-guard.
- Env-guard `STRIPE_SECRET_KEY`; else `500` with the same friendly copy.
- Parse `{ kind:'flash', piece_id, fields:{ name, email, placement } }`; `clampFields`;
  honeypot; validate required + `EMAIL_RE`.
- **Rate-limit** (`storeName: 'checkout-rate'`) before any Stripe call.
- Price lookup from the manifest (§3); reject unknown/zero.
- `reserveFlashPiece(env, piece_id)` → `409` if taken (reuse the enquiry copy). Set
  `expires_at = now + 48h`.
- `persistSubmission` (kind `flash`) + insert a `payments` row (`status:'awaiting'`, our
  `BSF-…` ref as id, `submission_id`).
- Create the **PaymentIntent** (REST, **no SDK** — `fetch` to `…/v1/payment_intents`,
  bearer-auth with the secret key, **idempotency-keyed on our reference**):
  ```js
  const body = new URLSearchParams()
  body.set('amount', String(pricePence))                  // server-side authority (§3)
  body.set('currency', 'gbp')
  body.set('automatic_payment_methods[enabled]', 'true')  // card + Klarna (per dashboard)
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
  const intent = await res.json()
  ```
  Store `intent.id` (the `pi_…`) on the payment row (`provider_ref`); reply
  `{ clientSecret: intent.client_secret, reference: paymentRef, amount: pricePence, currency: 'gbp' }`.
- **Failure rollback** mirrors `enquiry.js`: if the call fails (`!res.ok` or no
  `client_secret`), `releaseFlashPiece` + mark the payment `failed`, return `502`.

**`src/handlers/stripe-webhook.js`**:
- POST only; **use the raw `event.body`** (the `toEvent` adapter already hands us the
  untouched string — do **not** re-`JSON.stringify`) and the `stripe-signature` header.
- **Verify the signature with Web Crypto** (`src/lib/stripe.js`, **no SDK**): split the
  `t=`/`v1=` parts, recompute `HMAC-SHA256(secret, "${t}.${rawBody}")`, compare, and reject a
  stale timestamp. Bad signature → `400`.
- **Idempotency:** `INSERT … ON CONFLICT DO NOTHING` into `webhook_events`; if no row
  changed, it's a replay → `200` and stop.
- On **`payment_intent.succeeded`**: read `metadata.piece_id`/`payment_ref`, **re-check the
  amount**, **promote** pending→claimed (idempotent UPDATE), mark the `payments` row `paid` +
  `paid_at` + the `pi_…` id, then send the two emails (§6). On **`payment_intent.canceled`**:
  mark the payment `expired` + `releaseFlashPiece`. Other event types → `200` ignore.
- Return `200` quickly; never throw to Stripe (log + `200`/`500` deliberately). No CORS
  headers (server-to-server) — just `SECURITY_HEADERS`.

**`src/lib/db.js`** — add: `recordPayment`, `markPaymentPaid`, `promoteFlashClaim(piece_id)`
(`UPDATE flash_claims SET status='claimed' WHERE piece_id=? AND status='pending'`),
`expirePendingClaims(now)` (`DELETE … WHERE status='pending' AND expires_at < now`),
`seenWebhookEvent(id)`. All fail-safe like the existing helpers.

## 5. Stale-pending release

Two cheap layers (no new infra needed for the first):
- **Lazy:** call `expirePendingClaims(now)` at the top of `getFlashClaims` (the
  `flash-status` read already runs on every grid load) — so an abandoned reserve frees itself
  the next time anyone views `/flash/`.
- **Belt-and-braces:** a Cloudflare **Cron Trigger** (`[triggers] crons = ["*/30 * * * *"]`
  in `wrangler.toml`, handled in a `scheduled()` export) calling the same function. Add when
  convenient; the lazy path covers the common case.

## 6. Emails (Resend) — reuse the enquiry pattern

Same `fetch('https://api.resend.com/emails', …)` call as `enquiry.js`:
- **Customer receipt** — "Your flash piece is booked", piece + amount + reference + what
  happens next (the in-person session). `to: customer`, `from: FROM_EMAIL`.
- **Artist notification** — "Flash <piece> PAID by <name>", contact + placement + reference.
Factor the tiny HTML/text builders alongside the existing ones (or a shared `lib/email.js`).

## 7. Frontend (apps/web)

> **Step 4 — not yet built.** This is the remaining slice; the spec below is the **embedded
> Payment Element** design the backbone already commits to (the earlier redirect version is gone).

- **`src/js/modules/flash.js`** — change the modal submit: instead of POSTing the claim to
  `ENQUIRY_FN_URL` and marking `pending` locally, POST to **`CHECKOUT_FN_URL`**, then on
  `{ clientSecret }` **mount Stripe.js + the Payment Element in the modal** and call
  `stripe.confirmPayment({ elements, confirmParams: { return_url } })`. The **webhook is the
  source of truth** — on success show an **in-modal confirmation state** (drop the optimistic
  `markCard('pending')`; the `flash-status` reconcile + webhook drive state). Keep the `409`
  handling (piece taken) and the spinner.
- **`src/js/modules/config.js`** — add `CHECKOUT_FN_URL` (+ `VITE_CHECKOUT_FN_URL`,
  documented in `.env.example`), and gate the whole embedded step behind a build-time
  **`VITE_PAYMENTS_ENABLED`** (off → the Claim button behaves exactly as today, so the
  frontend can merge and ship dark too).
- **`return_url`** — redirect-based methods (Klarna, some wallets) *do* bounce off-site and
  back even with the Payment Element, so a small return landing (a `/flash/` query state or a
  noindex page) is still needed to resolve the post-return status.
- **CSP (`src/build/security.js`)** — the embedded Element **requires new sources**:
  `script-src https://js.stripe.com`, `frame-src https://js.stripe.com https://*.klarna.com`,
  `connect-src https://api.stripe.com` — plus `VITE_CHECKOUT_FN_URL` in `workerConnectOrigins()`
  (there are **no** Stripe hosts in `security.js` today).

## 8. Security checklist (the "safest" part)

- Embedded **Payment Element** — card fields are Stripe-hosted iframes, so **no raw card data
  touches our origin** (still PCI **SAQ-A**); secrets only in the Worker.
- **Webhook signature verified** + **idempotent** by event id.
- **Amount authority server-side** (§3) — client can't set the price.
- Reuse the **rate limiter** on `/checkout`; CORS allowlist unchanged; DB writes fail-safe.
- Financial-data retention added to `docs/DATA-COMPLIANCE.md` (a **paid** row follows
  long-retention, not the 12-month prune).

## 9. Tests

- **`apps/functions/tests`** (Vitest + `fake-d1`, mock `fetch` to Stripe/Resend like the
  existing Resend mock):
  - `checkout`: validation, unknown-piece `400`, reserve `409`, happy path returns a URL +
    writes an `awaiting` payment, rollback on Stripe failure.
  - `stripe-webhook`: valid vs **bad signature** (`400`), **replay** dedupe, promotion
    pending→claimed + payment `paid` + emails fired, unknown event ignored, fail-safe on DB
    error.
- **`apps/web/tests`** (jsdom): flash submit calls `/checkout`, mounts the Payment Element on
  `{ clientSecret }` (stub Stripe.js), and shows the in-modal confirmation; `409` keeps the
  modal open.
- **`apps/web/e2e`** (Playwright — browser-only, the real gate): extend the flash spec to
  drive the modal, **stubbing both the Worker `/checkout` and Stripe.js** (never hit real
  Stripe) and asserting the confirmation state. This is the path the unit tier can't cover.

## 10. Build sequence (one PR per step, all → `develop`)

1. ✅ **Groundwork (landed)** — migration `0002_payments.sql` (`payments` +
   `webhook_events` + `flash_claims.expires_at`), `scripts/sync-flash-prices.mjs` + the
   committed `src/data/flash-prices.json` manifest (+ `npm run sync:prices` and a CI drift
   guard), and the `db.js` helpers (`recordPayment`, `getPayment`, `markPaymentStatus`,
   `promoteFlashClaim`, `expirePendingClaims`, `recordWebhookEvent`, `reserveFlashPiece`
   hold-expiry) with fail-safe unit tests. No customer-facing change. *(Account/secrets/
   dashboard set-up is the studio's to do — see §1.)*
2. ✅ **`/checkout` handler (landed)** — validate + rate-limit + server-side price (from the
   manifest, never the request) → `reserveFlashPiece` (48h hold) → `recordPayment('awaiting')`
   → create a Stripe **PaymentIntent** (REST via `fetch`, no SDK; idempotency-keyed on our
   reference) and return its `client_secret` (embedded Payment Element). Rolls the reserve +
   payment back on a Stripe failure; **shipped dark behind `PAYMENTS_ENABLED`** (503 until
   set). 18 unit tests (`checkout.test.js`).
3. ✅ **`/webhooks/stripe` handler (landed)** — verify the signature (Web Crypto HMAC, no
   SDK — `src/lib/stripe.js`, with a timestamp tolerance) → dedupe by event id
   (`recordWebhookEvent`) → on `payment_intent.succeeded`: re-check the amount, then
   `promoteFlashClaim` + `markPaymentStatus('paid')` + Resend customer receipt & artist notice
   (best-effort); on `payment_intent.canceled`: `markPaymentStatus('expired')` + release the
   hold. Idempotent + fail-safe end to end. 12 unit tests (`stripe-webhook.test.js`).
4. **Frontend** — the flash modal's **embedded payment step** (method toggle: Payment Element,
   PayPal buttons, bank-transfer panel) + a flash confirmation state, `config`/CSP, web + E2E tests.
5. ✅ **Stale release (landed)** — `getFlashClaims` lazily sweeps lapsed pending holds
   (`expirePendingClaims`) before reporting, so an abandoned checkout frees its piece on the
   next grid load with no cron. `DATA-COMPLIANCE.md` updated (payments = 6-yr financial
   record, erasure-exempt while paid; `webhook_events` prunable).
6. **Verify on staging** end-to-end with Stripe **test mode** (test cards + Klarna test flow),
   then go live by swapping to live keys.

## Phase 2 — custom deposits (outline)

Reuse everything above with `kind:'deposit'`: the artist quotes offline → issues a tokenised
"pay your deposit" link (a `/checkout` call seeded from `/studio` or a `wrangler` one-liner at
first) → `success` confirms the **booking date** (hands to `SCHEDULING.md`). **No full price
is ever generated for a custom tattoo**; the balance is paid in person on the day. Card/bank
transfer only (no Klarna on a deposit). Add a token-protected `/studio` to list payments,
mark a **manual Monzo bank-transfer** deposit paid, and issue refunds.

## Phase 3 — more methods & polish (outline)

PayPal as a parallel method (its Orders API + its own webhook); refunds/cancellation flows
matching the cancellation copy; reminders. *(The on-site embedded Payment Element is already
the chosen flash model — see "Decisions locked" — not a later swap.)*

## Open decisions (carried from the roadmap)

Flash full-only vs deposit-option · deposit flat-£ vs % · Klarna on flash day-one (assumed
yes, via Stripe) · **PayPal + bank-transfer panel: in the step-4 frontend, or a fast-follow?**
(the one method-scope decision step 4 needs) · reference format & stale window (settled as
built: `BSF-<piece>-<4char>` / 48h). None block the remaining step 4.
</content>
