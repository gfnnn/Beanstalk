# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Beansprout — v2 (Beanstalk repo)

Static marketing site for the Beansprout tattoo studio, plus the serverless form/email
app that backs it. This is an **npm-workspaces monorepo** with two deployable parts:

- **`apps/web`** — the frontend. Plain HTML pages bundled by **Vite** (no framework):
  styling in modular CSS under `apps/web/src/styles/`, behaviour in ES modules under
  `apps/web/src/js/modules/` wired through `apps/web/src/js/main.js`. Design tokens live in
  `apps/web/src/styles/variables.css`. **Deploys to GitHub Pages.**
- **`apps/functions`** — the app. A single Cloudflare Worker (`src/index.js` → handlers in
  `src/handlers/`) that receives the forms, stores submissions in **D1 (SQLite)**, and sends
  mail via Resend. **Deploys to Cloudflare Workers only.**

Shared docs live in `docs/`; each workspace owns its own `package.json`, `vitest.config.js`
and `tests/`. The two parts deploy independently — see **Deploy targets** below.

## Working in a Claude Code web session (read this first)

When this repo is opened in **Claude Code on the web** (a remote, ephemeral container —
not your laptop), these are the ground rules so a session is productive from the first
command instead of rediscovering the environment each time:

- **Dependencies are installed for you.** A committed **SessionStart hook**
  (`.claude/hooks/session-start.sh`, registered in `.claude/settings.json`) runs
  `npm install` in the remote container before the session starts, so `npm test` and
  `npm run build` work immediately — there is no "install first" dance. It's a no-op on a
  developer's local machine (gated on `$CLAUDE_CODE_REMOTE`). It is **synchronous** (the
  session waits for install to finish, trading a little startup latency for no race where
  the agent runs a command before deps exist). These two files are the *only* tracked
  things under `.claude/`; everything else there (incl. `settings.local.json`) stays
  git-ignored.
- **`npm test` is the trustworthy signal here.** Both Vitest suites (340 web + 94
  functions) run fully in the sandbox.
- **The Playwright E2E tier is CI/local-only — and that's expected, not a failure.** The
  browser binary downloads from `cdn.playwright.dev`, which the web sandbox's network
  allowlist blocks (`403 Host not in allowlist`). `npm run test:e2e` therefore routes
  through `apps/web/scripts/run-e2e.mjs`, which **skips cleanly (exit 0) when no Chromium
  is installed**. Real browser coverage comes from CI (`.github/workflows/e2e.yml`, which
  installs the browser) and from local runs. Don't treat a skipped E2E run as broken, and
  don't burn time trying to install the browser in a web session.
  - **Where the E2E tier actually runs — so you don't "test" a feature against a no-op.**
    A skipped sandbox run **validates nothing**: it neither passed nor exercised your code.
    So when a change touches a **browser-only path the E2E tier owns** — the enquiry-form
    image preview/downscale + multi-step flow, the portfolio lightbox, the mobile nav
    drawer, the flash claim modal — the sandbox `test:e2e` skip does **not** cover it.
    That coverage runs in exactly two places: **(1) the PR's E2E workflow**, which fires
    automatically on every `pull_request` touching `apps/web/**` (any base branch — see
    `.github/workflows/e2e.yml`), and **(2) locally**, once you've installed Chromium
    (`cd apps/web && npx playwright install chromium`, then `npm run test:e2e`). From a web
    session the move is: rely on `npm test` for the unit signal, then **push the branch and
    let the PR's E2E job be the gate** — don't read the local skip as a green E2E.
- **The web git proxy only lets a session push its own branch.** It **rejects remote
  branch deletion** (`git push origin --delete …` → HTTP 403) and other cross-ref
  surgery, and the GitHub MCP server exposes no delete-ref tool. So **branch cleanup,
  rebasing other people's branches, and anything touching a ref other than the session's
  own must be done locally or in the GitHub UI** — not from a web session. Plan around
  this; don't keep retrying the 403.

## Commands

Run from the repo root; the root scripts delegate to the right workspace.

```bash
npm install           # install all workspaces (hoisted to the root node_modules)
npm run dev           # Vite dev server for apps/web at http://localhost:5173
npm run build         # production build of apps/web → apps/web/dist/
npm run preview       # serve the built apps/web/dist/ locally
npm run preview:branch -- <branch>  # LOCAL helper: fetch a branch, install, run its dev server (one command)
npm test              # run BOTH workspaces' Vitest suites
npm run test:web      # only apps/web (renderers, data integrity, build pipeline, jsdom modules)
npm run test:functions # only apps/functions (enquiry, newsletter, flash-status, http, db)
npm run test:e2e      # apps/web Playwright tier (browser-only paths + whole-site smoke);
                      #   skips cleanly if no Chromium is installed — see the web-session note above
```

You can also run a workspace directly, e.g. `npm run test --workspace @beansprout/functions`
or `cd apps/web && npm run build`.

**Reviewing a web session's work on your own machine** is one command:
`npm run preview:branch -- <branch>` (`scripts/preview-branch.mjs`) fetches the branch,
fast-forwards to its tip, installs, and starts the dev server at
`http://localhost:5173`. It's a *local* helper — it fails safe (`git switch` +
`pull --ff-only`, never discarding uncommitted work) and is cross-platform. Add
`--no-serve` to just prepare the checkout without booting the server.

Tests run on **Vitest** and in CI on every push/PR (`.github/workflows/test.yml`, a matrix
over both workspaces). `apps/web/tests/` covers the build-time renderers + data integrity;
`apps/functions/tests/` covers the Worker handlers with the network mocked and an in-memory
D1 fake (`tests/helpers/fake-d1.js`) running the real storage logic — no real Resend/DB
calls. There's also a **Playwright E2E/smoke tier** (`apps/web/e2e/`, `npm run test:e2e`, CI
in `.github/workflows/e2e.yml`) that drives the real production build in a browser for the
paths jsdom can't reach (lightbox, the enquiry image preview/downscale, the mobile nav
drawer) plus a whole-site load sweep; it stubs the Worker so it's hermetic, and needs a
browser binary (`npx playwright install chromium`, done automatically in CI). `test:e2e`
runs through `apps/web/scripts/run-e2e.mjs`, which **skips with exit 0 when that binary
isn't installed** (e.g. a web sandbox that can't reach `cdn.playwright.dev`) so the tier is
a clean no-op where it can't run rather than a false failure — it still executes normally
once the browser is present. So the tier **effectively runs in exactly two places**: the
**E2E GitHub workflow** (auto-triggered on every `pull_request` touching `apps/web/**`, and
on push to `main`) and a **local run with Chromium installed** — a skipped sandbox run is a
no-op, not a pass, so don't treat it as having covered a browser-only change. There is **no
linter or formatter** — don't invent `npm run lint`. To exercise the Worker for real locally
you need Wrangler (`wrangler dev`, serves on :8787, with a local D1) plus secrets in
`apps/functions/.dev.vars`; plain `npm run dev` serves only the static site, not the Worker.

## Architecture

### Monorepo layout
```
apps/web/         @beansprout/web        → GitHub Pages (the marketing site)
  index.html (home) + 404.html + page folders:
    portfolio/ flash/ services/ enquire/ about/ visit/ faq/ aftercare/
    newsletter/ enquiry-received/ privacy/ terms/
  src/data/      pieces, flash, homepage, testimonials, media, palette  (content = single sources of truth)
  src/build/     renderers that turn the data files into HTML strings at build time
  src/js/        main.js + modules/  (one orchestrated bundle, shared by every page)
  src/styles/    main.css → @imports reset/typography/a11y/motion/layout + components/ + pages/
  public/        favicons, manifest, images/ (copied to dist root; no CNAME yet — robots.txt + sitemap.xml are generated, see SEO)
  vite.config.js  vitest.config.js  tests/
apps/functions/   @beansprout/functions  → Cloudflare Worker (the form/email app)
  src/index.js                           # Worker entry — routes /enquiry /newsletter /flash-status
  src/handlers/{enquiry,newsletter,flash-status}.js
  src/lib/{http,db}.js                    # CORS/IP/adapter + D1 storage (persist, rate limit, flash)
  migrations/0001_init.sql                # D1 schema
  wrangler.toml   vitest.config.js  tests/ (tests/helpers/fake-d1.js)
docs/   BRANCHING.md  ENQUIRY-SETUP.md  NEWSLETTER-SETUP.md  EMAIL-DOMAIN-SETUP.md  DATA-COMPLIANCE.md  CMS.md  MEDIA.md  PAYMENTS-PLAN.md  SCHEDULING.md  ROADMAP.md
.github/workflows/{test.yml, e2e.yml, deploy-web.yml}   (the Worker deploys via Cloudflare Workers Builds, not GH Actions)
package.json      root workspace ("workspaces": ["apps/*"]) — scripts delegate to workspaces
```
The Vite root is `apps/web`, so page assets referenced as `/src/...` resolve inside that
workspace; nothing needs path edits when adding pages. `docs/ROADMAP.md` is the living
backlog — what's shipped, the phased **go-live plan** (staging → apex), and the
post-launch backlog that extends past it; `docs/CMS.md` is the (not-yet-built)
content-CMS plan; `docs/PAYMENTS-PLAN.md` is the (not-yet-built) **PayPal + Monzo** deposit /
flash-purchase spec — manual reconciliation, no payment gateway to build, supersedes the old
Stripe backlog item; `docs/SCHEDULING.md` is the (not-yet-built) **appointment-booking** spec
that co-ships with it (request/hold + manual confirm). Read `ROADMAP.md` for current
priorities before starting larger work.

### Multi-page Vite build
Every page is its own `index.html` in a folder under `apps/web/` (`portfolio/`, `about/`,
`flash/`, `enquire/`, `services/`, `visit/`, `newsletter/`, `privacy/`, `terms/`, …), plus
the homepage `index.html` and the branded `404.html`. Each is registered as a Rollup input
in `apps/web/vite.config.js`. **Add a new page → add the folder/`index.html` AND a matching
entry in the `input` map** (and a `ROUTES` entry in `src/build/seo.js` if it's indexable),
or it won't be built. All pages load the same bundle: `<link href="/src/styles/main.css">`
(which `@import`s every partial) and `<script type="module" src="/src/js/main.js">`.

The six Vite plugins (in `vite.config.js`, applied in this order) do all the build-time
work: `palette` (inject colour custom properties), `generatedGrids` (the content pipeline
below), `seoHead` (structural SEO tags), `securityHeaders` (CSP + Referrer-Policy
`<meta>` — see SEO/security below), `piecePages` (per-piece portfolio pages), and
`sitemap`. Most run in **both dev and build** so what you see on `npm run dev` is what
ships — **except `securityHeaders`, which is `apply: 'build'`** (a strict CSP would break
the dev server's HMR client), so it lands at build/preview only.

### Data → build-time HTML pipeline (the non-obvious part)
Lots of page content is **generated at build time from data files**, not hand-written
markup. `src/data/*.js` are the **single sources of truth**; `src/build/*.js` render them to
HTML strings (sharing escaping/image helpers from `src/build/html.js`); the `generatedGrids`
plugin replaces an HTML comment marker on the relevant page with that output. Each marker
lives on only one page, so other pages pass through untouched. The data files' header
comments document every field — **read them before editing**.

| Data file               | Renderer (`src/build/`)        | Marker → page                                         |
|-------------------------|--------------------------------|------------------------------------------------------|
| `pieces.js` (portfolio) | `portfolio-tiles.js`           | `<!-- pieces:masonry -->` → `portfolio/`             |
| `flash.js`              | `flash-cards.js`               | `<!-- flash:grid -->` → `flash/`                     |
| `homepage.js`           | `homepage.js`                  | `<!-- homepage:* -->` (status light, notices, hero, specialisms) |
| `homepage.js` + `pieces.js` | `specialisms.js`           | `<!-- homepage:specialisms -->` → home (previews pulled live from pieces) |
| `testimonials.js`       | `testimonials.js`              | `<!-- testimonials -->` → home                       |
| `media.js`              | `media.js` (one shared hero renderer) | `<!-- homepage:hero-media -->` → home / `<!-- about:hero-media -->` → about |
| (none)                  | `newsletter-inline.js`         | `<!-- newsletter:inline -->` → home / flash / post-enquiry |

The nav **status "light"** (`homepage.status`) is the one marker that appears on *every*
page's nav, not just the homepage. The homepage "Kind words" section is `hidden` while
`testimonials` is empty — add real quotes AND remove the `hidden` attribute to switch it on.

**Never hand-edit generated markup** (tiles, cards, hero copy, status pill, notices,
testimonials) — edit the data file and let the build regenerate it. Tokens in the data
(`styles`, `placement`, `status`, `tone`, `glyph`) must match the filter chips / `<select>`
options in the HTML and the label maps in the renderers; change them together.

### Per-piece portfolio pages
Each portfolio piece also gets its own shareable page at `/portfolio/<slug>/` (the masonry
tiles link there). These are generated from `pieces.js` by `src/build/piece-page.js` via the
`piecePages` plugin — **dev** serves them from a middleware, **build** emits one full HTML
file each (whole document, including SEO + nav status, pointing at the hashed main bundle).
The `slug` field on each piece is the URL segment and must be unique. They're added to the
sitemap automatically (the `sitemap` plugin appends `/portfolio/<slug>/` for every piece).

### SEO structure
Core SEO is centralised in `src/build/seo.js` and applied at build/dev via two
plugins in `vite.config.js`, so it stays consistent and new pages inherit it:

- **`injectSeoHead` plugin** completes each page's `<head>` with the *structural*
  tags — `<link rel="canonical">` (from the page's own `og:url`), `og:site_name`,
  `og:locale`, default `og:image`/`twitter:card`, and `twitter:title`/`description`
  mirrored from the OpenGraph tags. Only missing tags are added (per-page overrides
  win), and pages marked `noindex` (e.g. `/enquiry-received/`) are skipped. **Per-page
  content** (`<title>`, description, `og:title`/`og:description`/`og:url`) is still
  authored by hand in each page — only the derived/constant tags are injected.
- **`sitemap` plugin** emits `robots.txt` + `/sitemap.xml` at build (and serves both in
  dev). The sitemap is built from the `ROUTES` list in `seo.js` **plus** a
  `/portfolio/<slug>/` entry per piece — keep `ROUTES` in sync when adding an indexable
  page. **Both are staging-aware** (keyed off the same `isProductionBuild()` apex-CNAME
  switch as the noindex): on a production/apex build `robots.txt` allows crawling,
  disallows `/enquiry-received/` and advertises the sitemap, and `/sitemap.xml` is
  emitted; on a **staging build** (no apex CNAME — the GitHub Pages preview or the
  Cloudflare Pages dev environment from `develop`) `robots.txt` is a blanket
  `Disallow: /` and **no sitemap is emitted**, so the pre-launch copy carries no
  real-life SEO artifacts (no real-URL sitemap, no crawl invite) on top of the
  per-page noindex. `robots.txt` is **generated** (via `renderRobots()` in `seo.js`),
  not a static `public/` file, so this switch can take effect.
- The homepage carries a JSON-LD `@graph` (`WebSite` + `Person`, with Tiny Knives as
  `workLocation`) — Beansprout is the artist, not the studio.

### Security headers
Two layers, both centralised so new pages/responses inherit them:

- **Site (HTML) — CSP + Referrer-Policy `<meta>`.** `src/build/security.js` defines the
  policy; the `securityHeaders` plugin (`apply: 'build'`) injects both tags into every
  page's `<head>`, and `piece-page.js` takes the same string for the per-piece pages
  (which bypass the HTML transform). `connect-src` is pinned to the Worker origin the
  build points the forms at — derived from the `VITE_*_FN_URL` vars, falling back to the
  `config.js` default. The allowances map 1:1 to what the site loads (inline palette
  style + `style=""` attrs → `style-src 'unsafe-inline'`; Google Fonts; `blob:` image
  previews; the `/visit/` Google-Maps iframe). **Build/preview only** — a strict CSP
  breaks the dev server's HMR, so `npm run dev` runs without it. A `<meta>` CSP **can't**
  set `frame-ancestors`/`X-Frame-Options`/HSTS on Pages — that clickjacking gap waits for
  the Cloudflare-front consolidation (`ROADMAP.md` → infrastructure consolidation).
- **Worker (JSON) — response headers.** `SECURITY_HEADERS` in `src/lib/http.js`
  (`nosniff`, `default-src 'none'`, `no-referrer`) is spread into every `replyWith()`
  reply and the 404; CORS still wins where it overlaps. No clickjacking/HSTS headers —
  those belong on the HTML, not a JSON API.

### Front-end JS — single orchestrated init
`src/js/main.js` is the only entry point. On `DOMContentLoaded` it **first** flips the
`motion-ready` class on `<html>` (the FOUC guard — see below), then calls each module's
`initX()` in a deliberate order (Lenis smooth-scroll first so it drives the GSAP ticker,
then nav, hero/scroll animations, portfolio load-more + filter + lightbox, aftercare, faq,
enquire, flash, newsletter, hero media, analytics — and finally the mobile sticky CTA).
**Every module no-ops when its target element is absent**, so the one bundle runs safely
on every page. Modules under `src/js/modules/`: `lenis`, `nav`, `animations`, `loadmore`,
`filter`, `lightbox`, `sticky` (shared sticky-shadow helper for pinned bars — used by
filter, flash and the enquire progress bar), `chip-overflow` (shared responsive "More"
collapse for tight filter rows — used by filter and flash), `aftercare`, `faq`, `enquire`,
`flash`, `newsletter`, `media` (homepage + About hero video/GIF clips: reduced-motion-aware,
on-screen-only playback), `analytics` (vendor-agnostic `track()` scaffold that no-ops until
a provider is wired in — no cookie banner owed yet), and `config` (function URLs). Portfolio
load-more, filter/sort and lightbox cooperate via callbacks wired in `main.js` (load-more
owns the visible window; filter re-applies after a reveal/sort). New page behaviour = a new
`modules/<name>.js` exporting `initX()`, added to `main.js`.

**FOUC guard for entrance animations.** `styles/motion.css` holds animated elements hidden
until JS is live; `main.js` adds `motion-ready` to `<html>` **synchronously and first**, in
the same frame GSAP sets its `.from()` start-states, so the in-between is never painted (no
flash of unstyled/unanimated content). Under `prefers-reduced-motion` the guard's media
query is inert and GSAP bails, so elements are simply visible — the class flip is a harmless
no-op. `styles/a11y.css` carries the focus-visible / reduced-motion / screen-reader rules.

### Forms → Cloudflare Worker → Resend
The enquiry and flash-claim forms (and the newsletter signup) `fetch()`-POST JSON to one
Cloudflare Worker (`apps/functions`); there is no backend server. `src/index.js` routes
`/enquiry`, `/newsletter`, `/flash-status` to the handlers in `src/handlers/`.

- `src/handlers/enquiry.js` handles **both** the enquiry and flash-claim forms,
  distinguished by a `kind` field (`'enquiry'` | `'flash'`); a `FORMS` table defines the
  required fields, consent boxes, image support and email layout per kind. Images are
  downscaled in the browser, then **type-sniffed by magic bytes** server-side (the client's
  MIME isn't trusted, `Buffer` via the `nodejs_compat` flag), with request-body and
  per-image size caps. It **persists the submission before emailing**, and for flash claims
  **reserves the piece server-side** so it can't be double-claimed. Sends via **Resend**.
- `src/handlers/newsletter.js` adds a subscriber to a Resend Audience and files a consent row.
- `src/handlers/flash-status.js` is a **read-only** `GET` endpoint the flash grid calls on
  load to reflect *live* availability. The grid ships as static HTML (status baked in at
  build), so this overlays pieces claimed since the last build. Returns
  `{ claims: { "<piece-id>": "pending" | "claimed" } }`; no secrets, no writes, fails safe
  to an empty map.
- `src/lib/db.js` is the **D1 (SQLite) storage layer** (binding `DB`), and the system of
  record: `persistSubmission`/`persistConsent`, the **flash inventory** (`reserveFlashPiece`
  — atomic via `ON CONFLICT DO NOTHING`; `releaseFlashPiece` rolls back if the send fails;
  `getFlashClaims`), and the **rate limiter** (per-IP sliding window + global daily ceiling).
  Every function **fails safe / fails open** — a DB outage never blocks a real enquiry.
  Schema in `migrations/0001_init.sql`. GDPR retention/erasure is plain SQL — see
  `docs/DATA-COMPLIANCE.md`.
- `src/lib/http.js` is the HTTP plumbing: the **CORS origin allowlist** (the *site* origins,
  not the Worker's own URL), the JSON reply helper, `clientIp` (anti-spoof — trusts only
  `cf-connecting-ip`), and the Request→event adapter that keeps handlers `(event, env)`-shaped.
- `apps/web/src/js/modules/config.js` holds the Worker route URLs, overridable at build time
  via `VITE_ENQUIRY_FN_URL` / `VITE_NEWSLETTER_FN_URL` / `VITE_FLASH_STATUS_FN_URL` (see
  `.env.example`); the workers.dev subdomain is account-specific so these MUST be set. Rebuild
  after changing them — Vite bakes them in. Server-side secrets (`RESEND_API_KEY`,
  `ARTIST_EMAIL`, `FROM_EMAIL`, `RESEND_AUDIENCE_ID`) are **Cloudflare Worker secrets**
  (`wrangler secret put`), never in the repo. Full setup: `docs/ENQUIRY-SETUP.md`,
  `docs/NEWSLETTER-SETUP.md`, `docs/EMAIL-DOMAIN-SETUP.md` (Resend domain/DNS).

### Deploy targets — one repo, two independent deploys
The two workspaces deploy to **different places**, each gated so only relevant changes ship:

- **Frontend → GitHub Pages.** `.github/workflows/deploy-web.yml` builds `apps/web` (with
  the `VITE_*_FN_URL` Worker routes from repo Actions Variables — any left unset fall back
  to the `config.js` defaults) and publishes `apps/web/dist`. It is
  **path-gated** (`paths: apps/web/**`, lockfile, the workflow itself), so a functions-only
  change never triggers a Pages redeploy. `apps/web/public/` (favicons, `site.webmanifest`)
  is copied to the site root as-is. **No `public/CNAME`** until the apex cutover (see the
  guardrail below). This is the **production** web deploy — fed only by batched
  `develop → main` release PRs (see the Git workflow above).
- **Staging (the `develop` branch) → Cloudflare Pages.** A Git-connected **Cloudflare
  Pages** project builds `develop` (production branch = `develop`, build `npm run build`,
  output `apps/web/dist`) and serves it at a `*.pages.dev` staging URL — the always-on
  preview where batched features are tested together before a release PR. It's wired the
  **same way the Worker is** (Cloudflare-side Git integration, no GitHub-held Cloudflare
  token — see "CI / GitHub Actions security"), so the `VITE_*_FN_URL` build vars are set in
  the **Pages project's** env, not GitHub Actions. Setup steps in `docs/BRANCHING.md`.
- **Worker → Cloudflare.** `apps/functions/wrangler.toml` defines the Worker (`name`, the D1
  binding, vars). Deployment is via **Cloudflare Workers Builds** — the Worker is Git-connected
  to this repo, building from the **repo root** (Root directory `/`, so `npm ci` finds the
  single workspace lockfile) with wrangler pointed at the config: a push to `main` runs
  `npx wrangler deploy --config apps/functions/wrangler.toml` (non-`main` branches run
  `npx wrangler versions upload --config …` for a preview). You can also deploy by hand with
  `wrangler deploy` from `apps/functions`. Local dev is `wrangler dev` (with a local D1).
  Chosen over Netlify after Netlify's free tier began pausing the project on a monthly
  **credit limit**; Cloudflare's free Workers + D1 tiers have no credit-pause model. The
  canonical site is GitHub Pages.

This separation is the point of the monorepo split: **frontend changes deploy to Pages,
Worker changes deploy to Cloudflare, and neither drags the other along.**

## Git workflow — `develop` integrates, `main` releases

Two long-lived branches, so features can be **tested together** before a **batched,
deliberate** push to production. Full runbook (branch roles, release process, the GitHub
ruleset settings, and the Cloudflare Pages staging setup) lives in
[`docs/BRANCHING.md`](docs/BRANCHING.md) — read it before changing the flow.

- **`develop` is the integration branch.** Feature PRs target it, CI runs on every PR, and
  a push to `develop` deploys the **staging** site (Cloudflare Pages, branch-built) + a
  Worker preview version. Features accumulate here and get exercised side-by-side.
- **`main` is the release/production branch.** It is updated **only** by a release PR
  `develop → main` that batches everything that has landed on `develop`. A push under
  `apps/web/**` then triggers the GitHub Pages build and the Cloudflare Worker deploy
  (`wrangler deploy`). So `main` only ever receives reviewed, batched releases — never a
  single work-in-progress feature, never a direct commit.

1. **Branch before you build — off `develop`.** `git switch -c feat/<thing>` off an
   up-to-date `develop`. Never commit directly on `develop` or `main`.
2. **Stage only what the task touches.** Use explicit paths (`git add path/…`), never
   `git add -A`. If unrelated changes are already sitting in the tree, commit or stash
   them on their own branch first so they don't get swept into your commit.
3. **Visualise before you open a feature PR.** For any change that's observable in the
   browser (a new page, layout, component, animation, copy block), run the site and *look
   at it* before raising the PR — don't ship a feature you've only typechecked. See
   [Visual check before a feature PR](#visual-check-before-a-feature-pr) below.
4. **One PR per change → `develop`, squash-merge, delete the branch.**
   `gh pr create --base develop` → review the diff → `gh pr merge --squash --delete-branch`.
   This leaves `develop` with one tidy commit per feature and no stale branches.
5. **Release in batches: open a `develop → main` PR.** When the accumulated work on
   `develop` is verified on staging and ready to ship, open `gh pr create --base main
   --head develop` (title it `release: <date / summary>`), review the combined diff, and
   **merge-commit** it (not squash — preserve the per-feature history on `main`). That one
   merge is the production deploy. See `docs/BRANCHING.md` for the release checklist.
6. **Never rewrite published history on `develop` or `main`.** No force-pushes to either.
   (Rebasing your *own* feature branch and `--force-with-lease`-ing it is fine and
   encouraged — see below.)

Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.

### Visual check before a feature PR

CI runs Vitest, but green tests don't prove the page *looks* right. Before opening a PR
for any user-visible feature, verify it in the browser and attach the proof:

1. **Run the app.** Start the dev server for the feature's worktree (`npm run dev` in
   `apps/web`, or the preview tooling) — each worktree gets its own port.
2. **Drive it like a user.** Open the page(s) the change touches, exercise the new
   interaction (nav, form, animation), and confirm it renders with no console errors.
3. **Capture the proof.** Take a screenshot of the changed view(s) at desktop width, and
   at mobile width if layout/responsiveness was touched.
4. **Attach it to the PR.** Drop the screenshot(s) into the `gh pr create` body so the
   diff review has a visual reference. If nothing is visually observable (tooling, tests,
   functions-only), say so explicitly in the PR instead.
5. **Leave the server up (≥ 15 min).** The dev server is a detached background process, so
   it keeps serving until explicitly stopped — don't tear it down the moment the screenshot
   is taken. Keep it running for at least 15 minutes after spin-up so the change can be
   browsed by hand, and surface its local URL. Only then stop it (or just leave it for the
   session). Don't block on a timer — carry on with other work while it stays up.

Skip this only when the change genuinely can't be seen in the browser.

**Browser-only interactions also need the E2E gate, not just a screenshot.** If the
feature touches a path the Playwright tier owns (enquiry form, lightbox, mobile nav
drawer, flash modal), remember the unit suite under jsdom can't exercise it and a web
sandbox's `npm run test:e2e` only **skips** (no-op, not a pass). Real verification is the
PR's **E2E workflow** — which auto-runs on every `pull_request` under `apps/web/**` — or a
**local** `npm run test:e2e` with Chromium installed (`npx playwright install chromium`).
From a web session, push and let the PR's E2E job be the gate; see the web-session note up
top. When you add browser-only behaviour, add/extend a spec under `apps/web/e2e/` so that
gate actually covers it.

### Working on several features at once (avoid the branch tangle)

Solo work still means multiple features in flight. The failure mode is branches cut from
`develop` that then sit and rot: when one squash-merges, the others fall behind and the
eventual merge fights conflicts. These rules keep parallel work cheap:

1. **One feature = one worktree = one branch = one PR.** Don't switch branches in the main
   checkout (stash/checkout churn loses context). Give each in-flight feature its own
   working copy that shares the one `.git`:
   ```bash
   git worktree add ../trees/<feature> -b feat/<feature> origin/develop
   #   → its own folder, own node_modules (npm install once), own dev-server port.
   git worktree remove ../trees/<feature>   # once the PR is merged
   ```
   Worktrees live under `../trees/` (sibling of the repo), never committed.
2. **Cap in-flight branches at ~2–3.** Don't open a fourth until one merges or is parked.
3. **Rebase onto `develop` daily, and immediately after *any* PR merges.** The moment one
   PR lands on `develop`, rebase every other live branch (`git fetch && git rebase
   origin/develop`) so it never drifts. Stale branches are the whole problem; this is the
   fix.
4. **Structural refactors run solo.** A change that *moves or renames files* (directory
   restructures, monorepo splits, mass renames) conflicts with everything. Merge it
   first, fast, with nothing else open — then branch the rest off the new layout. Never
   let a structural branch sit for days while content PRs pile up behind it.
5. **Keep branches small and short-lived** (a day or two). Small diffs rebase clean; long
   ones don't. CI (`.github/workflows/test.yml`) runs Vitest on every PR — merge on green.

**Resolving a stale branch** (the standard recovery): from its worktree,
`git fetch && git rebase origin/develop`, fix conflicts, `npm test && npm run build`, then
`git push --force-with-lease`, then `gh pr merge --squash --delete-branch`.

**Stop the tangle at the source — delete merged branches automatically.** This repo
squash-merges, which discards a branch's individual commits, so a merged branch never
becomes an ancestor of `main` and therefore looks "unmerged" forever — that's how dozens
of dead `claude/*`, `feat/*`, `docs/*` heads accumulate. Two defences:
- **Turn on GitHub → Settings → General → Pull Requests → "Automatically delete head
  branches".** Then every squash-merge removes its own head and the pile never forms. This
  is the single highest-leverage fix for the recurring branch-head pain.
- **Prune what's already merged from a *local* clone** (a web session can't — the proxy
  403s on remote-ref deletion, see the web-session note up top). The authoritative test for
  "merged" under squash-merge is the PR state, not `git branch --merged`, so drive it off
  the merged PR list:
  ```bash
  # from a local clone, with the gh CLI authenticated:
  gh pr list --state merged --limit 200 --json headRefName -q '.[].headRefName' \
    | sort -u > /tmp/merged-heads
  git ls-remote --heads origin | sed 's#.*refs/heads/##' \
    | grep -vxE 'main|develop' \
    | grep -xF -f /tmp/merged-heads \
    | xargs -r -n1 git push origin --delete   # deletes only confirmed-merged heads
  ```

## Deploy guardrail — do NOT switch the apex domain

`beansprout.ink` (apex) is intentionally still served by the **v1** repo
(`gfnnn/beansprout`). This v2 repo publishes only to GitHub Pages (the staging Pages
URL) and the Cloudflare Worker. **Do not point the apex at v2** — keep there being
**no `apps/web/public/CNAME`**, and don't add apex A-records for Pages — until the
copy and real images are finalised (see `docs/ROADMAP.md` → Go-live plan, Phase 6).
Cloudflare hosts
the enquiry/flash/newsletter Worker (Resend for sending, D1 for storage).

## CI / GitHub Actions security

The repo ships two workflows (`.github/workflows/`) and **no AI/agent action** — keep it
that way unless there's a clear reason, and follow these rules if that changes. (The Worker
deploys via **Cloudflare Workers Builds** — Git-connected on Cloudflare's side, holding its
own scoped API token there — so there is intentionally no Cloudflare token in GitHub.)

- **Least-privilege tokens.** `test.yml` runs with `permissions: contents: read` — don't
  widen it. `deploy-web.yml` declares `id-token: write` **on purpose**: it's GitHub's own
  OIDC, required by `actions/deploy-pages@v5` to verify the Pages artifact. It is *not* an
  Anthropic/Claude token exchange, and the workflow only triggers on `push` to `main` and
  manual `workflow_dispatch` — never on attacker-controllable input — so there's no
  injection path. Leave it as-is.
- **Never run a workflow's privileged half on untrusted input.** Don't trigger build/deploy
  or any token-bearing job from `pull_request_target`, `issue_comment`, `issues`, or
  `workflow_run`. Untrusted-PR CI stays read-only (as `test.yml` is).
- **If you ever adopt `anthropics/claude-code-action`** (or any AI-in-CI action): pin it to a
  commit SHA (not a floating tag) at **v1.0.94 or later**, never set
  `allowed_non_write_users: "*"`, keep it off issue/PR/comment triggers (or require a
  human-actor check), and scope its secrets to only the Anthropic API key + `GITHUB_TOKEN`.
  A 2025 disclosure (CVE-class supply-chain bug, fixed in v1.0.94) let an external attacker
  bypass the write-access gate via a `[bot]` GitHub App, prompt-inject through a crafted
  issue, and exfiltrate OIDC/secret tokens — the above settings are the guardrails against it.
- **The human PR-review gate on `main` is part of the security model**, not just hygiene —
  every deploy flows through a reviewed squash-merge. Preserve it.

## Design system — don't drift

Warm earthy palette (cream `#F7F1E3`, moss `#4A5D3F`, clay `#C45A3E`, ink `#2C2A24`)
with Fraunces (serif display) / Karla (sans body) / JetBrains Mono (labels). Reuse the
shared nav, footer, button, and JS-module patterns across pages. Placeholder copy is
marked `<!-- COPY: -->`; image placeholders carry shoot briefs in HTML comments.

**Colour lives in one place — `apps/web/src/data/palette.js`.** No CSS hard-codes a
colour; every rule reads a CSS custom property (`var(--moss)`, `rgba(var(--ink-rgb),
…)`, the `--tone-*` swatch trios). `src/build/palette.js` generates those properties
from the **active** palette in that data file and the `palette` plugin in
`vite.config.js` injects them into every page's `<head>` (dev + build) and points the
`theme-color` meta at the palette background. To recolour the whole site, switch
`active` (or edit a palette's hexes) and rebuild — it's content, like `homepage.js`.
Add a palette by copying a block; keep its `colors`/`tones` keys in step with the
others so a switch can't leave a token undefined. The decorative tile/flash/hero
gradient swatches are defined once in `styles/components/tones.css` from the `tones`
group — never reintroduce the per-surface `.t-*`/`.ci-*`/`.gradient-*` copies.
</content>
