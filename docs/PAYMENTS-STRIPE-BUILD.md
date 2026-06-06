# Stripe payments — build spec (Phase 1 in detail)

The executable plan for wiring **Stripe** into the site, per
[`PAYMENTS-ROADMAP.md`](./PAYMENTS-ROADMAP.md). Phase 1 (flash full payments) is specced
file-by-file here; Phases 2–3 are outlined at the foot and flesh out once Phase 1 ships and
the open decisions are confirmed.

Stripe is the engine: one integration carries **card + Klarna**, funds land in the Stripe
balance and pay out to the **Monzo Business** account. We use **hosted Stripe Checkout via a
server-created session + a top-level redirect** — so **no card fields and no Stripe.js on our
pages** (PCI **SAQ-A**, and almost nothing added to the CSP). The Worker does all the Stripe
API talking; the browser only ever `fetch()`es our own Worker and then navigates to
`checkout.stripe.com`.

## Working assumptions (confirm; sensible defaults baked in)

- **Flash = full payment** at claim (deposit-to-hold option deferred to Phase 2 if wanted).
- **Methods:** card **+ Klarna** from day one (Klarna is free to enable via Stripe). Best on
  flash full payments; not offered on deposits.
- **Amount authority is server-side** — the client never sends the price (see §3).
- **Reference format** `BSF-<piece-id>-<4char>`; **stale-pending window 48h**, with the
  Stripe Checkout session itself expiring at 30 min.
- Ships to **staging only** until the apex cutover — no `apps/web/public/CNAME` (guardrail in
  `CLAUDE.md`).

## End-to-end flow (Phase 1)

```
Claim modal (name, email, placement)
  → POST /checkout { kind:'flash', piece_id, fields }
      Worker: rate-limit → validate → look up price (server authority)
            → reserveFlashPiece(pending)         [409 if already taken]
            → record payment row (status 'awaiting')
            → stripe.checkout.sessions.create(...)  → { url }
  → browser window.location = url  → Stripe hosted Checkout (card / Klarna)
  → customer pays
      Stripe → POST /webhooks/stripe  (checkout.session.completed)
            Worker: verify signature → dedupe by event id
                  → promote piece pending→claimed
                  → mark payment 'paid'
                  → email customer receipt + artist notification
  → success_url  → /payment-received/   (cancel_url → /flash/?cancelled)
Abandoned/unpaid → session expires (30m) + 48h stale-release frees the piece
```

## 1. Dependencies & secrets

- **`apps/functions`**: add the official SDK — `npm i stripe --workspace @beansprout/functions`.
  Use the Workers-native crypto/http: `Stripe.createFetchHttpClient()` and
  `Stripe.createSubtleCryptoProvider()` (no Node `crypto` needed; `nodejs_compat` already on).
- **Worker secrets** (`wrangler secret put …`, test-mode keys first):
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Add them to the `wrangler.toml` header
  checklist and `docs/ENQUIRY-SETUP.md` (or a new `docs/PAYMENTS-SETUP.md`).
- **Stripe dashboard**: connect the **Monzo Business** account as the payout bank; enable
  **Klarna** under Payment methods; add the webhook endpoint
  (`…workers.dev/webhooks/stripe`, event `checkout.session.completed`, copy its signing
  secret into `STRIPE_WEBHOOK_SECRET`).

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
'/checkout':        checkout,        // POST  create a Checkout Session
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
- Create the session:
  ```js
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() })
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    currency: 'gbp',
    automatic_payment_methods: { enabled: true },   // card + Klarna (per dashboard)
    line_items: [{ quantity: 1, price_data: {
      currency: 'gbp', unit_amount: pricePence,
      product_data: { name: `Flash — ${pieceTitle}` },
    }}],
    customer_email: email,
    client_reference_id: paymentRef,
    metadata: { kind: 'flash', piece_id, submission_id, payment_ref: paymentRef },
    expires_at: Math.floor(Date.now()/1000) + 30*60,
    success_url: `${SITE}/payment-received/?ref=${paymentRef}`,
    cancel_url:  `${SITE}/flash/?cancelled=1`,
  })
  ```
  Store `session.id` on the payment row (`provider_ref`); reply `{ url: session.url }`.
- **Failure rollback** mirrors `enquiry.js`: if session creation throws, `releaseFlashPiece`
  + mark the payment `failed`, return `502`.

**`src/handlers/stripe-webhook.js`**:
- POST only; **use the raw `event.body`** (the `toEvent` adapter already hands us the
  untouched string — do **not** re-`JSON.stringify`) and the `stripe-signature` header.
- `await stripe.webhooks.constructEventAsync(event.body, sig, env.STRIPE_WEBHOOK_SECRET,
  undefined, Stripe.createSubtleCryptoProvider())` — bad signature → `400`.
- **Idempotency:** `INSERT … ON CONFLICT DO NOTHING` into `webhook_events`; if no row
  changed, it's a replay → `200` and stop.
- On `checkout.session.completed`: read `metadata.piece_id`/`payment_ref`; **promote**
  pending→claimed (only if not already claimed — idempotent UPDATE), mark the `payments` row
  `paid` + `paid_at` + the `payment_intent` id, then send the two emails (§6). Other event
  types → `200` ignore.
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

- **`src/js/modules/flash.js`** — change the modal submit: instead of POSTing the claim to
  `ENQUIRY_FN_URL` and marking `pending` locally, POST to **`CHECKOUT_FN_URL`** and, on
  `{ url }`, `window.location.href = url`. Keep the `409` handling (piece taken) and the
  spinner. The optimistic `markCard('pending')` is no longer needed — the webhook + the
  `flash-status` reconcile drive state.
- **`src/js/modules/config.js`** — add `CHECKOUT_FN_URL` (+ `VITE_CHECKOUT_FN_URL`,
  documented in `.env.example`).
- **New page `apps/web/payment-received/index.html`** — branded "payment received" thank-you
  (noindex, like `/enquiry-received/`). Register it in `vite.config.js`'s `input` map.
- **CSP (`src/build/security.js`)** — the redirect approach needs **no new script/frame
  sources** (Checkout is a navigation to Stripe's own domain). Add `VITE_CHECKOUT_FN_URL` to
  `workerConnectOrigins()` so the `/checkout` fetch is covered even if its origin is ever
  split out. *(Only if we later switch to embedded Payment Element do we add
  `script-src https://js.stripe.com`, `frame-src https://js.stripe.com
  https://checkout.stripe.com https://*.klarna.com`, `connect-src https://api.stripe.com`.)*

## 8. Security checklist (the "safest" part)

- Hosted Checkout, **no card data on site** (SAQ-A); secrets only in the Worker.
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
- **`apps/web/tests`** (jsdom): flash submit calls `/checkout` and redirects on `{ url }`
  (stub `window.location`); `409` keeps the modal open.
- **`apps/web/e2e`** (Playwright — browser-only, the real gate): extend the flash spec to
  drive the modal and assert the redirect, **stubbing the Worker** to return a fake session
  URL (never hit real Stripe). This is the path the unit tier can't cover.

## 10. Build sequence (one PR per step, all → `develop`)

1. **Groundwork** — migration `0002`, `sync-flash-prices.mjs` + manifest, `db.js` helpers,
   secrets/dashboard set up. (No customer-facing change.)
2. **`/checkout` handler** + the price authority + unit tests.
3. **`/webhooks/stripe` handler** (signature + idempotency + promotion + emails) + unit tests.
4. **Frontend** — flash modal redirect, `payment-received` page, config/CSP, web + E2E tests.
5. **Stale release** (lazy first, cron optional) + `DATA-COMPLIANCE.md` update.
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
matching the cancellation copy; reminders; optionally swap flash to an **embedded** Payment
Element (adds the Stripe/Klarna CSP sources noted in §7) if an on-site checkout is wanted.

## Open decisions (carried from the roadmap)

Flash full-only vs deposit-option · deposit flat-£ vs % · Klarna on flash day-one (assumed
yes) · PayPal now vs Phase 3 (assumed Phase 3) · reference format & stale window (assumed
`BSF-<piece>-<4char>` / 48h). None block starting step 1.
</content>
