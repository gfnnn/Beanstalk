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

## Not yet covered

The browser-only paths of the client modules — image downscale (FileReader,
`createImageBitmap`, canvas), smooth-scroll/GSAP animation, navigation — lean on
APIs jsdom doesn't implement, so they belong in a future browser/E2E tier (e.g.
Playwright) rather than these unit tests. `src/js/**` is excluded from the coverage
report for the same reason (see `vitest.config.js`).
