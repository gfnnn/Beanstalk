# E2E / smoke tier — `@beansprout/web` (Playwright)

The **browser tier**, complementary to the Vitest unit suites in [`../tests/`](../tests).
Vitest covers the pure build renderers/data and the *synchronous* client-module
logic under jsdom; this tier covers what jsdom **can't** — the genuinely
browser-only paths — and sweeps every page for load-time health.

It runs against the **real production build** (`vite build` → `vite preview`), so it
guards exactly the artifact that deploys to GitHub Pages. The forms' Cloudflare
Worker is **stubbed in-test** (`helpers.js` → `stubWorker`), so the suite is
hermetic and offline — no Resend/D1, no CORS, no dependence on the Worker being up.

```bash
# from the repo root
npm run test:e2e                       # build + preview + run (chromium)
# or, inside this workspace:
npm run test:e2e
npm run test:e2e:ui                    # Playwright's interactive UI mode
npm run test:e2e:report                # open the last HTML report
```

### Where this tier actually runs (don't mistake a skip for a pass)

`npm run test:e2e` routes through [`../scripts/run-e2e.mjs`](../scripts/run-e2e.mjs): if no
Chromium binary is installed it prints a note and **exits 0 (skips)** rather than failing.
That skip **validates nothing** — it neither ran nor passed your specs. So the tier is only
real coverage in **two** places:

1. **CI — the `E2E` GitHub workflow** (`.github/workflows/e2e.yml`). It installs Chromium and
   runs the full suite **automatically on every `pull_request` that touches `apps/web/**`**
   (any base branch), on push to `main`, and on manual dispatch. This is the gate for a PR.
2. **Locally — with the browser installed** (see setup below), where `npm run test:e2e`
   executes normally.

A **web sandbox** (e.g. Claude Code on the web) is neither: its network allowlist blocks the
Playwright CDN, so the binary can't be fetched and the run skips. When you change a
browser-only path here, don't read that skip as green — push the branch and let the PR's E2E
job cover it, or run it on a local machine.

### First-time setup — install the browser

Playwright drives a managed Chromium that is **not** installed by `npm install`.
Once per machine (and in CI — the `E2E` workflow does this automatically):

```bash
cd apps/web && npx playwright install chromium     # add --with-deps on Linux/CI
```

> **Network note:** the browser binary downloads from the Playwright CDN
> (`cdn.playwright.dev`). Some sandboxed environments block that host — there the
> suite can be *listed* (`npx playwright test --list`) and authored, but not run.
> GitHub's CI runners and normal dev machines can fetch it fine.

## What's covered

| File | Covers |
| --- | --- |
| `smoke.spec.js` | Every page (the `seo.js` routes + the noindex confirmation page) serves 2xx, mounts the shared JS bundle (`#main-nav`), has a `<title>` + `<h1>`, and throws **no** uncaught error / console error on load. Plus the staging-aware `robots.txt`/sitemap (staging: blanket `Disallow:` + no sitemap; apex: crawlable + served sitemap) and the home canonical/JSON-LD. The net for a broken build, a page missing from the Vite input map, or a renderer that blew up. |
| `lightbox.spec.js` | `src/js/modules/lightbox.js` — opens on a tile click (intercepting the tile link), populates title/counter, pages prev/next with the ends disabled, and closes on ✕ / Escape, restoring body scroll. |
| `enquire.spec.js` | The enquiry form's **browser-only image pipeline** — the live thumbnail preview (`URL.createObjectURL`) and the submit-time downscale (`createImageBitmap` → canvas → `toBlob` → base64), asserted on the exact JSON the browser POSTs. Plus the error-banner path. |
| `nav.spec.js` | The mobile drawer (open/close, scroll-lock, close-on-link, Escape) at a real mobile viewport, and the desktop "More" dropdown. |
| `flash.spec.js` | The claim modal's real open/close (the rAF `.open` transition + scroll-lock) and the **live-availability reconcile** (`/flash-status` → the static grid reflects a piece claimed since the build). The claim submit branches (success/409/error) are unit-tested under jsdom, so they're not repeated here. |

## Conventions

- **One Worker, stubbed.** Always `await stubWorker(page)` (or a per-test
  `page.route('**/enquiry', …)`) before navigating — never let a spec hit
  `*.workers.dev`.
- **Tolerate not-yet-shot images.** `watchForErrors` fails on uncaught exceptions
  and console errors but ignores `Failed to load resource` — real photography is
  still being added (see CLAUDE.md), so some `/images/...` files 404 until then.
- **Keep `PAGES` in step with `src/build/seo.js`** when adding an indexable page.
- Specs are `*.spec.js` under `e2e/`; the unit suites are `*.test.js` under
  `tests/`. The two runners never see each other's files.
