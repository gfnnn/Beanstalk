# Tests — `@beansprout/functions`

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
| `tests/http.test.js` | `src/lib/http.js` — CORS allowlist, JSON replies, anti-spoof client-IP extraction, and the Request→event adapter. |
| `tests/db.test.js` | `src/lib/db.js` — persistence, flash inventory (atomic reserve / release), consent ledger, and the rate limiter's window/daily-ceiling **and fail-open** behaviour. |
| `tests/enquiry.test.js` | enquiry handler — validation, honeypot, magic-byte image sniffing (JPEG/PNG/GIF/WebP/HEIC/AVIF), filename sanitisation, email rendering/escaping, Resend errors, rate limiting. |
| `tests/newsletter.test.js` | newsletter handler — validation, consent, honeypot, idempotent "already subscribed", Resend errors, rate limiting. |
| `tests/flash-status.test.js` | flash-status handler — protocol + the live claims map. |

`fetch` (Resend) is mocked and the D1 binding is an in-memory fake
(`tests/helpers/fake-d1.js`) that runs the real storage logic, so the suite is
hermetic — no network, no real database.
