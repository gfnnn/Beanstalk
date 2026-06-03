# Tests — `@beansprout/functions`

Unit/integration tests for the **Netlify function logic**: input validation,
image-upload security, CORS, and rate limiting. (The frontend renderer/data
tests live in the other workspace, `apps/web/tests/`.)

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
| `tests/shared.test.js` | `_shared.js` — CORS allowlist, client-IP extraction, and the rate limiter's window/daily-ceiling **and fail-open** behaviour. |
| `tests/enquiry.test.js` | `enquiry.js` handler — validation, honeypot, magic-byte image sniffing (JPEG/PNG/GIF/WebP/HEIC/AVIF), filename sanitisation, email rendering/escaping, Resend errors, rate limiting. |
| `tests/newsletter.test.js` | `newsletter.js` handler — validation, consent, honeypot, idempotent "already subscribed", Resend errors, rate limiting. |

`fetch` (Resend) and `@netlify/blobs` (rate-limiter store) are mocked, so the
suite is hermetic — no network, no real Blobs store.
