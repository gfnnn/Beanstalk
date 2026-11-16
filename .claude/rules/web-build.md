---
description: "How apps/web pages are built - the Vite plugins, the data-to-HTML pipeline, SEO and the site CSP"
paths:
  - "apps/web/vite.config.js"
  - "apps/web/src/build/**"
  - "apps/web/src/data/**"
  - "apps/web/*.html"
  - "apps/web/*/index.html"
---

# Web build pipeline (`apps/web`)

## Multi-page Vite build
Every page is its own `index.html` in a folder under `apps/web/` (`portfolio/`, `about/`,
`flash/`, `enquire/`, `services/`, `visit/`, `newsletter/`, `privacy/`, `terms/`, …), plus
the homepage `index.html` and the branded `404.html`. Each is registered as a Rollup input
in `apps/web/vite.config.js`. **Add a new page → add the folder/`index.html` AND a matching
entry in the `input` map** (and a `ROUTES` entry in `src/build/seo.js` if it's indexable),
or it won't be built. All pages load the same bundle: `<link href="/src/styles/main.css">`
(which `@import`s every partial) and `<script type="module" src="/src/js/main.js">`.

The eight Vite plugins (in `vite.config.js`, applied in this order) do all the build-time
work: `palette` (inject colour custom properties + emit the palette-coloured `favicon.svg`
from the traced brand mark in `src/build/favicon.js`), `generatedGrids` (the content pipeline
below), `seoHead` (structural SEO tags), `securityHeaders` (CSP + Referrer-Policy
`<meta>` — see SEO/security below), `pageLoader` (the full-page preloader — see
`docs/MOTION.md`),
`viewTransition` (inline the cross-document View-Transition opt-in into `<head>` so it's
armed before the `main.css` `@import` waterfall — a late opt-in lets a slow inbound render
skip the cross-fade; `src/build/transition.js`), `piecePages` (per-piece portfolio pages),
and `sitemap`. Most run in **both dev and build**
so what you see on `npm run dev` is what ships — **except `securityHeaders`, which is
`apply: 'build'`** (a strict CSP would break the dev server's HMR client), so it lands at
build/preview only.

## Data → build-time HTML pipeline (the non-obvious part)
Lots of page content is **generated at build time from data files**, not hand-written
markup. `src/data/*.js` are the **single sources of truth**; `src/build/*.js` render them to
HTML strings (sharing escaping/image helpers from `src/build/html.js`); the `generatedGrids`
plugin replaces an HTML comment marker on the relevant page with that output. Each marker
lives on only one page, so other pages pass through untouched. The data files' header
comments document every field — **read them before editing**.

| Data file               | Renderer (`src/build/`)        | Marker → page                                         |
|-------------------------|--------------------------------|------------------------------------------------------|
| `pieces.js` (portfolio) | `portfolio-tiles.js`           | `<!-- pieces:masonry -->` → `portfolio/`             |
| `flash.js`              | `flash-cards.js`               | `<!-- flash:grid -->` → `flash/` (+ `<!-- flash:drop -->` / `<!-- flash:season -->` eyebrow) |
| `homepage.js`           | `homepage.js`                  | `<!-- homepage:* -->` (status light, notices, hero, specialisms) |
| `homepage.js` + `pieces.js` | `specialisms.js`           | `<!-- homepage:specialisms -->` → home (previews pulled live from pieces) |
| `testimonials.js`       | `testimonials.js`              | `<!-- testimonials -->` → home                       |
| `media.js`              | `media.js` (one shared hero renderer) | `<!-- homepage:hero-media -->` → home / `<!-- about:hero-media -->` → about |
| (none)                  | `newsletter-inline.js`         | `<!-- newsletter:inline -->` → home / flash / post-enquiry |
| `business.js`           | `business.js`                  | `<!-- reply-time -->` → enquire + enquiry-received (shared so the promised turnaround can't drift) |
| (none)                  | `favicon.js` (`renderMarkSvg`) | `<!-- brand:mark -->` → every page's nav lockup + the `/enquiry-received/` confirmation mark |

Two markers appear on *every* page's nav, not just the homepage: the **brand mark**
(`<!-- brand:mark -->`, the traced sprig from `src/build/favicon.js`, filled with
currentColor inside the `.nav-logo` lockup) and the nav **status "light"**
(`homepage.status`), which renders in two spots per page (the inline pill via
`<!-- homepage:status -->` and the mobile-drawer variant via `<!-- homepage:status-drawer -->`).
The `/flash/` page eyebrow is **fully data-driven from `flash.js`**: the drop *number*
(`<!-- flash:drop -->`) is the highest `drop` value in the data (lower-numbered records fall
into the auto-built "Past drops" archive), and the *season* label (`<!-- flash:season -->`)
comes from the exported `season` string — so "Drop 12 · Summer 2026" never drifts from the
cards. The homepage "Kind words" section is `hidden` while `testimonials` is empty — add real
quotes AND remove the `hidden` attribute to switch it on.

**Never hand-edit generated markup** (tiles, cards, hero copy, status pill, notices,
testimonials) — edit the data file and let the build regenerate it. The portfolio **style +
placement vocabulary lives once in `src/data/taxonomy.js`** (the `STYLE_LABELS` /
`PLACEMENT_LABELS` maps): `pieces.js`, the renderers (`portfolio-tiles.js` re-exports the
label maps), the data-integrity test, and the Dropbox master-filename parser
(`scripts/master-metadata.mjs`) all read it — so **add a new style/placement token there**,
not in scattered label maps. A new token is valid in data + filenames immediately, but the
first piece that *uses* it still needs a matching filter chip / `<select>` option in
`portfolio/index.html` (the data-integrity test fails with instructions until it exists, so
the filter UI only offers tokens with real work behind them). The other per-data-file tokens
(`status`, `tone`, `glyph` in `flash.js` / `homepage.js`) must likewise match the HTML and the
renderer label maps — change them together.

**The flash page is held back by a gate.** While `live` in `src/data/flash.js` is `false`,
`src/build/flash-gate.js` strips the Flash link from every nav, drawer and footer, turns
`/flash/` into a redirect to the portfolio and drops it from the sitemap. The link regexes
match the markup **exactly** (`<li><a href="/flash/">Flash</a></li>` and the drawer's bare
`<a href="/flash/">Flash</a>`), so keep that shape when adding or editing a page's nav.

## Per-piece portfolio pages
Each portfolio piece also gets its own shareable page at `/portfolio/<slug>/` (the masonry
tiles link there). These are generated from `pieces.js` by `src/build/piece-page.js` via the
`piecePages` plugin — **dev** serves them from a middleware, **build** emits one full HTML
file each (whole document, including SEO + nav status, pointing at the hashed main bundle).
The `slug` field on each piece is the URL segment and must be unique. They're added to the
sitemap automatically (the `sitemap` plugin appends `/portfolio/<slug>/` for every piece).

## SEO structure
Core SEO is centralised in `src/build/seo.js` and applied at build/dev via two
plugins in `vite.config.js`, so it stays consistent and new pages inherit it:

- **`injectSeoHead` plugin** completes each page's `<head>` with the *structural*
  tags — `<link rel="canonical">` (from the page's own `og:url`), `og:site_name`,
  `og:locale`, default `og:image`/`twitter:card`, and `twitter:title`/`description`
  mirrored from the OpenGraph tags. Only missing tags are added (per-page overrides
  win), and pages marked `noindex` (e.g. `/enquiry-received/`) are skipped. **Per-page
  content** (`<title>`, description, `og:title`/`og:description`/`og:url`) is still
  authored by hand in each page — only the derived/constant tags are injected. The same
  plugin also wraps `injectStagingNoindex`, which adds a **site-wide** `noindex, nofollow`
  robots `<meta>` to every page on a **staging build** so a preview can't be indexed.
  **The build mode is `isProductionBuild()`:** the apex `CNAME` is committed, so a plain build
  (GitHub Pages from `main`) is production; a **Cloudflare Pages** build (it sets `CF_PAGES=1`)
  or `SITE_ENV=staging` is staging; `SITE_ENV=production` forces production. It's a no-op on the apex build
  and on any page that already declares its own robots tag (so it never doubles up).
- **`sitemap` plugin** emits `robots.txt` + `/sitemap.xml` at build (and serves both in
  dev). The sitemap is built from the `ROUTES` list in `seo.js` **plus** a
  `/portfolio/<slug>/` entry per piece — keep `ROUTES` in sync when adding an indexable
  page. **Both are staging-aware** (keyed off the same `isProductionBuild()` apex-CNAME
  switch as the noindex): on a production/apex build `robots.txt` allows crawling,
  disallows `/enquiry-received/` and advertises the sitemap, and `/sitemap.xml` is
  emitted; on a **staging build** (the Cloudflare Pages staging site from `develop` and its
  branch previews) `robots.txt` is a blanket
  `Disallow: /` and **no sitemap is emitted**, so the staging copy carries no
  real-life SEO artifacts (no real-URL sitemap, no crawl invite) on top of the
  per-page noindex. `robots.txt` is **generated** (via `renderRobots()` in `seo.js`),
  not a static `public/` file, so this switch can take effect.
- The homepage carries a JSON-LD `@graph` (`WebSite` + `Person`, with Tiny Knives as
  `workLocation`) — Beansprout is the artist, not the studio.

## Security headers (site HTML)
**CSP + Referrer-Policy `<meta>`**, centralised so new pages inherit them (the Worker's
response headers are in `.claude/rules/worker.md`). `src/build/security.js` defines the
policy; the `securityHeaders` plugin (`apply: 'build'`) injects both tags into every
page's `<head>`, and `piece-page.js` takes the same string for the per-piece pages
(which bypass the HTML transform). `connect-src` is pinned to the Worker origin the
build points the forms at — derived from the `VITE_*_FN_URL` vars, falling back to the
`config.js` default. The allowances map 1:1 to what the site loads (inline palette
style + `style=""` attrs → `style-src 'unsafe-inline'`; Google Fonts; `blob:` image
previews; the `/visit/` Google-Maps iframe; GA4's documented host set for gtag.js and
its collect hits, nothing wider). **Build/preview only** — a strict CSP
breaks the dev server's HMR, so `npm run dev` runs without it. A `<meta>` CSP **can't**
set `frame-ancestors`/`X-Frame-Options`/HSTS on Pages — that clickjacking gap waits for
a Cloudflare front.
