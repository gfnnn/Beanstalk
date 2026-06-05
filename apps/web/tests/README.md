# Tests — `@beansprout/web`

Unit tests for the **build-time HTML renderers**, the **data contract** that feeds
them, the **build wiring** (vite.config plugins), and the **synchronous, correctness-
critical client modules** (driven under jsdom) — the parts of the frontend where a
silent regression actually causes harm. (The Worker tests live in the other
workspace, `apps/functions/tests/`.)

```bash
npm run test:web          # from the repo root
# or, inside this workspace:
npm test                  # run once
npm run test:watch        # watch mode
npm run test:coverage
```

Runner: [Vitest](https://vitest.dev) (default `environment: node`, see
`vitest.config.js`, kept separate from `vite.config.js` so the build-only grid
plugin isn't pulled in). The client-module suites opt into jsdom per-file with a
`// @vitest-environment jsdom` pragma, so the Node default stays for the pure
renderer/data tests.

## What's covered

| File | Tests |
| --- | --- |
| `tests/renderers.test.js` | `renderPortfolioTiles` / `renderFlashCards` and the homepage/piece-page/testimonials/specialisms/newsletter renderers — responsive `<picture>` vs. placeholder, eager/lazy LCP loading, status-gated claim buttons, HTML escaping, sort order. |
| `tests/data-integrity.test.js` | `pieces.js` / `flash.js` / `homepage.js` contract: unique slugs/ids, required fields, and every `style`/`placement`/`glyph`/`status`/`tone` token matches the documented set the renderers and filter chips expect (CLAUDE.md: "change them together"). |
| `tests/seo.test.js` | `src/build/seo.js` — `injectSeoHead` (only-missing-tags-added, per-page overrides win, noindex skipped, twitter mirrored from OG) and the sitemap. |
| `tests/palette.test.js` | `src/build/palette.js` — hex→channels maths and the per-palette token contract. |
| `tests/html.test.js` | `src/build/html.js` — the shared `esc()` escaper and the `HAS_EXT` image-path predicate. |
| `tests/build-pipeline.test.js` | `vite.config.js` integration — the markers are plumbed in, plugin order (palette+grids `pre`, SEO `post`), and the sitemap / per-piece `generateBundle` emitters. |
| `tests/enquire.test.js` · `tests/filter.test.js` · `tests/loadmore.test.js` | the synchronous, correctness-critical logic of the matching `src/js/modules/` modules, driven under **jsdom** (step-gating validation, conditional-field disabling, filter/sort/window cooperation). |
| `tests/flash.test.js` | `src/js/modules/flash.js` under **jsdom** — the drop/archive model (current drop vs. the self-hiding "Past" archive), drop-scoped count badges, filter + sort, the live-availability reconcile (claims map → status/badge/button, never downgrading claimed→pending), empty-state + footer-CTA visibility, the claim modal open/close, and the submit path incl. the **409 "claimed first"** branch. `lenis` is mocked; `fetch` is mocked. |
| `tests/newsletter.test.js` | `src/js/modules/newsletter.js` under **jsdom** — email/consent validation (no network on failure), the `{ fields }` POST shape, and the success / "already subscribed" / inline-fallback / error branches with the submit button restored. |
| `tests/faq.test.js` | `src/js/modules/faq.js` under **jsdom** — the single-open accordion (+ keyboard + `aria-expanded`), the exclusive category filter, the live search (resets chips to "All"), and the shared empty-state. |
| `tests/nav.test.js` | `src/js/modules/nav.js` under **jsdom** — current-page active-link marking (incl. the More-dropdown trigger), the dropdown open/close (toggle, outside-click, Escape), the mobile drawer (open/close, close-on-link, Escape, body scroll-lock), and the `.scrolled` state. |

## Not covered here (lives in the E2E tier instead)

The **browser-only** modules and paths lean on APIs jsdom doesn't implement, so
they're covered by the Playwright tier in [`../e2e/`](../e2e), not these unit
tests:

- **image preview + downscale** in `enquire.js` (`URL.createObjectURL`,
  `createImageBitmap`, canvas, `toBlob`) — the rest of `enquire.js` (step-gating,
  conditional fields) *is* covered here;
- **the lightbox** (`lightbox.js`) — open-on-tile, paging, image-viewer transitions;
- **the mobile nav drawer** at a real viewport (`nav.js`) — the synchronous logic
  is unit-tested here, the real-CSS-driven drawer in E2E;
- a whole-site **smoke sweep** (every page loads without throwing).

Genuinely untestable-without-a-browser-AND-low-value paths remain uncovered by
design: **smooth-scroll / GSAP** (`lenis.js`, `animations.js`) and the
scroll-reveal hooks. `src/js/**` is excluded from the headline coverage *report*
(see `vitest.config.js`) so those don't skew it — but the synchronous,
correctness-critical modules (`flash`, `newsletter`, `faq`, `nav`, `enquire`,
`filter`, `loadmore`) are exercised under jsdom regardless.
