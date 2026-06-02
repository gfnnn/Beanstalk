# Tests

A first test tier for the parts of the codebase where a silent regression
actually causes harm: the **build-time HTML renderers** and the **Netlify
function logic** (input validation, image-upload security, rate limiting).

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run test:coverage
```

Runner: [Vitest](https://vitest.dev) (`environment: node`, see `vitest.config.js`,
kept separate from `vite.config.js` so the build-only grid plugin isn't pulled in).

## What's covered

| File | Tests |
| --- | --- |
| `tests/renderers.test.js` | `renderPortfolioTiles` / `renderFlashCards` — responsive `<picture>` vs. placeholder, eager/lazy LCP loading, status-gated claim buttons, HTML escaping, sort order. |
| `tests/data-integrity.test.js` | `pieces.js` / `flash.js` contract: unique slugs/ids, required fields, and every `style`/`placement`/`glyph`/`status` token matches the documented set the renderers and filter chips expect (CLAUDE.md: "change them together"). |
| `tests/shared.test.js` | `_shared.js` — CORS allowlist, client-IP extraction, and the rate limiter's window/daily-ceiling **and fail-open** behaviour. |
| `tests/enquiry.test.js` | `enquiry.js` handler — validation, honeypot, magic-byte image sniffing (JPEG/PNG/GIF/WebP/HEIC/AVIF), filename sanitisation, email rendering/escaping, Resend errors, rate limiting. |
| `tests/newsletter.test.js` | `newsletter.js` handler — validation, consent, honeypot, idempotent "already subscribed", Resend errors, rate limiting. |

`fetch` (Resend) and `@netlify/blobs` (rate-limiter store) are mocked, so the
suite is hermetic — no network, no real Blobs store.

## Not yet covered

The client modules under `src/js/modules/` are DOM/scroll/event-coupled and
belong in a future browser/E2E tier (e.g. Playwright) rather than these Node
unit tests — deferred until the copy and real images are finalised.
