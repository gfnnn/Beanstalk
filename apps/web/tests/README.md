# Tests: `@beansprout/web`

Unit tests for the **build-time HTML renderers**, the **data contract** that feeds
them, the **build wiring** (vite.config plugins), and the **synchronous, correctness-
critical client modules** (driven under jsdom): the parts of the frontend where a
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

Not every suite has a row here. Each `tests/*.test.js` opens with a comment saying
what it pins; the table is the map for the larger ones.

| File | Tests |
| --- | --- |
| `tests/renderers.test.js` | `renderPortfolioTiles` / `renderFlashCards` and the homepage/piece-page/testimonials/specialisms/newsletter renderers: responsive `<picture>` vs. placeholder, eager/lazy LCP loading, status-gated claim buttons, HTML escaping, sort order. |
| `tests/data-integrity.test.js` | `pieces.js` / `flash.js` / `homepage.js` contract: unique slugs/ids, required fields, and every `style`/`placement`/`glyph`/`status`/`tone` token matches the documented set the renderers and filter chips expect (`.claude/rules/web-build.md`: "change them together"). |
| `tests/seo.test.js` | `src/build/seo.js`: `injectSeoHead` (only-missing-tags-added, per-page overrides win, noindex skipped, twitter mirrored from OG) and the sitemap. |
| `tests/palette.test.js` | `src/build/palette.js`: hex→channels maths and the per-palette token contract. |
| `tests/html.test.js` | `src/build/html.js`: the shared `esc()` escaper and the `HAS_EXT` image-path predicate. |
| `tests/fonts.test.js` | the self-hosted fonts: every `@font-face` in `src/styles/fonts.css` points at a same-origin woff2 that exists in `public/fonts/`, the head preloads and the preloader's `KEY_FONTS` only name fonts declared there, and no page (hand-written or per-piece) references Google Fonts. |
| `tests/build-pipeline.test.js` | `vite.config.js` integration: the markers are plumbed in, plugin order (palette+grids `pre`, SEO `post`), the sitemap / per-piece `generateBundle` emitters, every authored page run through the real pipeline (no marker survives; `ARTIST-COPY` and noindex per build mode), and the repo contracts: page folders ↔ the `input` map ↔ `ROUTES` ↔ the E2E `PAGES` list, and no literal colour in `src/styles`. |
| `tests/security.test.js` | `src/build/security.js`: the CSP/Referrer meta, and that `connect-src` allows the Worker origin `src/js/modules/config.js` actually fetches. |
| `tests/form-contract.test.js` | the **real** `enquire/index.html` and newsletter markup, driven by the real client modules, posted into the **real Worker handlers** (`apps/functions`): every field the page submits is required or rendered by the Worker, hidden conditional answers stay out of the payload, and the stored consent statement matches the words beside the checkbox. The one place page, bundle and Worker meet outside production. |
| `tests/run-e2e.test.js` | `scripts/run-e2e.mjs`, run as a child process with no browser installed: skips with exit 0 locally, fails with exit 1 in CI. |
| `tests/enquire.test.js` · `tests/filter.test.js` · `tests/loadmore.test.js` | the synchronous, correctness-critical logic of the matching `src/js/modules/` modules, driven under **jsdom** (step-gating validation, conditional-field disabling, filter/sort/window cooperation). |
| `tests/flash.test.js` | `src/js/modules/flash.js` under **jsdom**: the drop/archive model (current drop vs. the self-hiding "Past" archive), drop-scoped count badges, filter + sort, the live-availability reconcile (claims map → status/badge/button, never downgrading claimed→pending), empty-state + footer-CTA visibility, the claim modal open/close, and the submit path incl. the **409 "claimed first"** branch. `lenis` is mocked; `fetch` is mocked. |
| `tests/newsletter.test.js` | `src/js/modules/newsletter.js` under **jsdom**: email/consent validation (no network on failure), the `{ fields }` POST shape, and the success / "already subscribed" / inline-fallback / error branches with the submit button restored. |
| `tests/faq.test.js` | `src/js/modules/faq.js` under **jsdom**: the single-open accordion (+ keyboard + `aria-expanded`), the exclusive category filter, the live search (resets chips to "All"), and the shared empty-state. |
| `tests/nav.test.js` | `src/js/modules/nav.js` under **jsdom**: current-page active-link marking (incl. the More-dropdown trigger), the dropdown open/close (toggle, outside-click, Escape), the mobile drawer (open/close, staying open while a followed link navigates, Escape, body scroll-lock, `inert` while closed), and the `.scrolled` state. |

## Not covered here (lives in the E2E tier instead)

The **browser-only** modules and paths lean on APIs jsdom doesn't implement, so
they're covered by the Playwright tier in [`../e2e/`](../e2e), not these unit
tests:

- **image preview + downscale** in `enquire.js` (`URL.createObjectURL`,
  `createImageBitmap`, canvas, `toBlob`); the rest of `enquire.js` (step-gating,
  conditional fields) *is* covered here;
- **the lightbox** (`lightbox.js`): open-on-tile, paging, image-viewer transitions;
- **the mobile nav drawer** at a real viewport (`nav.js`): the synchronous logic
  is unit-tested here, the real-CSS-driven drawer in E2E;
- whole-site sweeps of every page: a **smoke sweep** (loads without throwing),
  the **reduced-motion contract**, and an **axe** pass (WCAG 2.1 A + AA).

The motion itself, **smooth-scroll / GSAP** (`lenis.js`, `animations.js`) and the
scroll-reveal hooks, has no test of how it plays; E2E only checks that none of
it runs under reduced motion. `src/js/**` is in the coverage report except the four
browser-only files `vitest.config.js` excludes (`main.js`, `animations.js`,
`lenis.js`, `lightbox.js`).
