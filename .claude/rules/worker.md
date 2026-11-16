---
description: The Cloudflare Worker: form handlers, D1 storage, HTTP plumbing, secrets and response headers
paths:
  - "apps/functions/**"
---

# Worker (`apps/functions`)

## Forms → Cloudflare Worker → Resend
The enquiry and flash-claim forms (and the newsletter signup) `fetch()`-POST JSON to one
Cloudflare Worker (`apps/functions`); there is no backend server. `src/index.js` routes
`/enquiry`, `/newsletter`, `/flash-status` — plus the **shipped-dark** `/checkout` and
`/webhooks/stripe` payment routes (see `docs/PAYMENTS.md`) — to the handlers in `src/handlers/`.

- `src/handlers/enquiry.js` handles **both** the enquiry and flash-claim forms,
  distinguished by a `kind` field (`'enquiry'` | `'flash'`); a `FORMS` table defines the
  required fields, consent boxes, image support and email layout per kind. Images are
  downscaled in the browser, then **type-sniffed by magic bytes** server-side (the client's
  MIME isn't trusted, `Buffer` via the `nodejs_compat` flag), with request-body and
  per-image size caps. It **persists the submission before emailing**, and for flash claims
  **reserves the piece server-side** so it can't be double-claimed. Sends via **Resend**.
  After the artist's notification it sends the **sender a fixed-copy receipt** (best-effort,
  no user text echoed, never exposing `ARTIST_EMAIL`). Flash claims require the same 18+ and
  deposit consents as enquiries, and a manual claim **never expires by itself** — the artist
  releases or marks it sold (`docs/ENQUIRY-SETUP.md` → *Running it day to day*).
- `src/handlers/failed-digest.js` is the Worker's **daily cron** (`[triggers]` in
  `wrangler.toml`): it emails the artist any submission whose notification failed, once each.
- `src/handlers/newsletter.js` adds a subscriber to a Resend Audience and files a consent row.
- `src/handlers/flash-status.js` is a **read-only** `GET` endpoint the flash grid calls on
  load to reflect *live* availability. The grid ships as static HTML (status baked in at
  build), so this overlays pieces claimed since the last build. Returns
  `{ claims: { "<piece-id>": "pending" | "claimed" } }`; no secrets, no writes, fails safe
  to an empty map.
- `src/handlers/checkout.js` + `src/handlers/stripe-webhook.js` are the **payments backbone,
  shipped dark** (see `docs/PAYMENTS.md`): `/checkout` opens a Stripe PaymentIntent for a
  flash piece (amount read server-side from `src/data/flash-prices.json`, never the client)
  and reserves it with a ~48h hold; `/webhooks/stripe` is the verified server-to-server
  confirmation that promotes the claim and flips the ledger. Both are inert until
  `PAYMENTS_ENABLED === "true"` — `/checkout` returns 503 otherwise. Signing/HTTP for Stripe
  lives in `src/lib/stripe.js`.
- `src/lib/db.js` is the **D1 (SQLite) storage layer** (binding `DB`), and the system of
  record: `persistSubmission`/`persistConsent`, the **flash inventory** (`reserveFlashPiece`
  — atomic via `ON CONFLICT DO NOTHING`; `releaseFlashPiece` rolls back if the send fails;
  `getFlashClaims`; `promoteFlashClaim`/`expirePendingClaims` for the paid/abandoned paths),
  the **payments ledger** (`recordPayment`/`getPayment`/`markPaymentStatus` +
  `recordWebhookEvent` for webhook idempotency), and the **rate limiter** (per-IP sliding
  window + global daily ceiling). Every function **fails safe / fails open** — a DB outage
  never blocks a real enquiry. Schema in `migrations/0001_init.sql` (+ `0002_payments.sql`
  for the payments ledger, `0003_claim_refs.sql` tying a flash hold to the payment that
  created it). GDPR retention/erasure is plain SQL — see `docs/DATA-COMPLIANCE.md`.
- `src/lib/http.js` is the HTTP plumbing: the **CORS origin allowlist** (the *site* origins,
  not the Worker's own URL), the JSON reply helper, `clientIp` (anti-spoof — trusts only
  `cf-connecting-ip`), and the Request→event adapter that keeps handlers `(event, env)`-shaped.
- `apps/web/src/js/modules/config.js` holds the Worker route URLs, overridable at build time
  via `VITE_ENQUIRY_FN_URL` / `VITE_NEWSLETTER_FN_URL` / `VITE_FLASH_STATUS_FN_URL` (see
  `.env.example`); the workers.dev subdomain is account-specific so these MUST be set. Rebuild
  after changing them — Vite bakes them in. Server-side secrets (`RESEND_API_KEY`,
  `ARTIST_EMAIL`, `FROM_EMAIL`, `RESEND_AUDIENCE_ID`) are **Cloudflare Worker secrets**
  (`wrangler secret put`), never in the repo. Full setup: `docs/ENQUIRY-SETUP.md`
  (forms + newsletter), `docs/EMAIL-DOMAIN-SETUP.md` (Resend domain/DNS).

## Security headers (Worker JSON)
`SECURITY_HEADERS` in `src/lib/http.js` (`nosniff`, `default-src 'none'`, `no-referrer`) is
spread into every `replyWith()` reply and the 404; CORS still wins where it overlaps. No
clickjacking/HSTS headers — those belong on the HTML (`.claude/rules/web-build.md`), not a
JSON API.
