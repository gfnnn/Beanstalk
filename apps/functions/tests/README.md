# Tests: `@beansprout/functions`

Unit/integration tests for the **Cloudflare Worker logic**: input validation,
image-upload security, CORS, D1 storage, and rate limiting. (The frontend
renderer/data tests live in the other workspace, `apps/web/tests/`.)

```bash
npm run test:functions    # from the repo root
# or, inside this workspace:
npm test                  # run once
npm run test:watch        # watch mode
npm run test:coverage
```

Runner: [Vitest](https://vitest.dev) (`environment: node`, see `vitest.config.js`).

## What's covered

| File | Tests |
| --- | --- |
| `tests/index.test.js` | `src/index.js`: the Worker entry/router. Covers path dispatch to all five route handlers (incl. the raw body + `Stripe-Signature` header reaching `/webhooks/stripe`), trailing-slash normalisation, query-string-insensitive matching, the 404 (with the JSON security headers) for unknown and partial paths, that handlers receive the adapted event + `env`, the 204/empty-body → null Response body rule, and that the cron entry hands the digest to `ctx.waitUntil`. The handlers are mocked so only the router is under test. |
| `tests/http.test.js` | `src/lib/http.js`: the exact CORS allowlist, JSON replies, anti-spoof client-IP extraction, and the Request→event adapter. |
| `tests/db.test.js` | `src/lib/db.js`: persistence, flash inventory (atomic reserve / release), consent ledger, the rate limiter's window/daily-ceiling **and fail-open** behaviour, the digest query, and the fail-safes when D1 throws or rejects. |
| `tests/enquiry.test.js` | enquiry handler: validation, honeypot, magic-byte image sniffing (JPEG/PNG/GIF/WebP/HEIC/AVIF, near-miss containers refused), filename sanitisation, email rendering/escaping, Resend errors, rate limiting. |
| `tests/newsletter.test.js` | newsletter handler: validation, consent, honeypot, idempotent "already subscribed", Resend errors, rate limiting. |
| `tests/flash-status.test.js` | flash-status handler: protocol + the live claims map. |
| `tests/failed-digest.test.js` | the daily cron digest: what counts as unsent (failed, or pending past the 15-minute grace), report-once, retry when the digest itself fails or throws, escaping, and fail-safe on a DB outage. |
| `tests/checkout.test.js` · `tests/payments.test.js` | the dark `/checkout` route (the `PAYMENTS_ENABLED` gate, server-side price authority, rollback on a Stripe failure) and the payments ledger in `src/lib/db.js`. |
| `tests/stripe-webhook.test.js` · `tests/stripe-webhook-throw.test.js` | Stripe signature verification, idempotent redelivery, the server-side amount re-check, and the 500-not-200 reply on an unexpected throw. |
| `tests/rate-buckets.test.js` | enquiry and newsletter rate limits stay independent for one IP. |
| `tests/flash-prices.test.js` | drift guard: `src/data/flash-prices.json` matches the web workspace's `flash.js`. |

`fetch` (Resend) is mocked and the D1 binding is an in-memory fake
(`tests/helpers/fake-d1.js`) that runs the real storage logic, so the suite is
hermetic: no network, no real database.
