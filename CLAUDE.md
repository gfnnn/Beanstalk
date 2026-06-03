# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Beansprout — v2 (Beanstalk repo)

Static marketing site for the Beansprout tattoo studio, plus the serverless form/email
app that backs it. This is an **npm-workspaces monorepo** with two deployable parts:

- **`apps/web`** — the frontend. Plain HTML pages bundled by **Vite** (no framework):
  styling in modular CSS under `apps/web/src/styles/`, behaviour in ES modules under
  `apps/web/src/js/modules/` wired through `apps/web/src/js/main.js`. Design tokens live in
  `apps/web/src/styles/variables.css`. **Deploys to GitHub Pages.**
- **`apps/functions`** — the app. The Netlify serverless functions that receive the forms
  and send mail (`apps/functions/netlify/functions/`). **Deploys to Netlify only.**

Shared docs live in `docs/`; each workspace owns its own `package.json`, `vitest.config.js`
and `tests/`. The two parts deploy independently — see **Deploy targets** below.

## Commands

Run from the repo root; the root scripts delegate to the right workspace.

```bash
npm install           # install all workspaces (hoisted to the root node_modules)
npm run dev           # Vite dev server for apps/web at http://localhost:5173
npm run build         # production build of apps/web → apps/web/dist/
npm run preview       # serve the built apps/web/dist/ locally
npm test              # run BOTH workspaces' Vitest suites
npm run test:web      # only apps/web (renderers + data integrity)
npm run test:functions # only apps/functions (enquiry, newsletter, _shared)
```

You can also run a workspace directly, e.g. `npm run test --workspace @beansprout/functions`
or `cd apps/web && npm run build`.

Tests run on **Vitest** and in CI on every push/PR (`.github/workflows/test.yml`, a matrix
over both workspaces). `apps/web/tests/` covers the build-time renderers + data integrity;
`apps/functions/tests/` covers the Netlify functions with the network mocked (no real
Resend/Blobs calls). There is **no linter or formatter** — don't invent `npm run lint`. To
exercise the Netlify functions for real locally you need the Netlify CLI (`netlify dev`,
serves on :8888) plus a `.env` (`cp .env.example .env`); plain `npm run dev` serves only the
static site, not the functions.

## Architecture

### Monorepo layout
```
apps/web/         @beansprout/web        → GitHub Pages (the marketing site)
  index.html + page folders (about/, portfolio/, flash/, …)
  src/{build,data,js,styles}             # all frontend source
  public/                                # CNAME, favicons, manifest (copied to dist root)
  vite.config.js  vitest.config.js  tests/
apps/functions/   @beansprout/functions  → Netlify (the form/email app)
  netlify/functions/{enquiry,newsletter,_shared}.js
  public/index.html                      # placeholder publish dir for the functions-only site
  vitest.config.js  tests/
docs/             ENQUIRY-SETUP.md, NEWSLETTER-SETUP.md
netlify.toml      base = apps/functions  (Netlify deploys functions only)
.github/workflows/{test.yml, deploy-web.yml}
package.json      root workspace ("workspaces": ["apps/*"]) — scripts delegate to workspaces
```
The Vite root is `apps/web`, so page assets referenced as `/src/...` resolve inside that
workspace; nothing needs path edits when adding pages.

### Multi-page Vite build
Every page is its own `index.html` in a folder under `apps/web/` (`portfolio/`, `about/`,
`flash/`, `enquire/`, …) and is registered as a Rollup input in `apps/web/vite.config.js`.
Add a new page → add the folder/`index.html` **and** a matching entry in the `input` map, or
it won't be built. All pages load the same bundle: `<link href="/src/styles/main.css">`
(which `@import`s every partial) and `<script type="module" src="/src/js/main.js">`.

### Data → build-time HTML pipeline (the non-obvious part)
The portfolio masonry and the flash grid are **generated at build time from data files**,
not hand-written markup:

- `src/data/pieces.js` (portfolio) and `src/data/flash.js` (flash) are the **single
  sources of truth**. Each file's header comment documents every field — read it before
  editing.
- `src/build/portfolio-tiles.js` and `src/build/flash-cards.js` render those arrays to
  HTML strings (responsive `<picture>` with avif/webp/jpg, or an SVG line-art placeholder
  when no `img` is set yet).
- The `generatedGrids` plugin in `apps/web/vite.config.js` (`transformIndexHtml`, runs in **both**
  dev and build) replaces the `<!-- pieces:masonry -->` marker in `portfolio/index.html`
  and the `<!-- flash:grid -->` marker in `flash/index.html` with that output. Grids ship
  as static HTML (good for SEO/no-JS/LCP).

**Never hand-edit the generated tile/card markup** — edit the data file and let the build
regenerate it. Tokens in the data (`styles`, `placement`, `status`, `tone`, `glyph`) must
match the filter chips / `<select>` options in the HTML and the label maps in the
renderers; change them together.

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
- **`sitemap` plugin** emits `/sitemap.xml` at build (and serves it in dev) from the
  `ROUTES` list in `seo.js` — keep that list in sync when adding indexable pages.
- `public/robots.txt` is static (allows all, disallows `/enquiry-received/`, points
  at the sitemap). The homepage carries a JSON-LD `@graph` (`WebSite` + `Person`,
  with Tiny Knives as `workLocation`) — Beansprout is the artist, not the studio.

### Front-end JS — single orchestrated init
`src/js/main.js` is the only entry point. On `DOMContentLoaded` it calls each module's
`initX()` in a deliberate order (Lenis smooth-scroll first so it drives the GSAP ticker,
then nav, animations, portfolio load-more/filter/lightbox, aftercare, faq, enquire, flash,
newsletter). **Every module no-ops when its target element is absent**, so the one bundle
runs safely on every page. Portfolio load-more, filter/sort and lightbox cooperate via
callbacks wired in `main.js` (load-more owns the visible window; filter re-applies after a
reveal/sort). New page behaviour = a new `modules/<name>.js` exporting `initX()`, added to
`main.js`.

### Forms → Netlify functions → Resend
The enquiry and flash-claim forms (and the newsletter signup) `fetch()`-POST JSON to
serverless functions; there is no backend server.

- `apps/functions/netlify/functions/enquiry.js` handles **both** the enquiry and flash-claim
  forms, distinguished by a `kind` field (`'enquiry'` | `'flash'`); a `FORMS` table defines
  the required fields, consent boxes, image support and email layout per kind. Images are
  downscaled in the browser before upload. Sends via **Resend**.
- `apps/functions/netlify/functions/newsletter.js` adds a subscriber to a Resend Audience.
- `apps/functions/netlify/functions/_shared.js` is shared support code (the leading `_` keeps
  Netlify from deploying it as a function): the **CORS origin allowlist** and the **rate
  limiter** (per-IP sliding window + global daily ceiling, backed by Netlify Blobs, **fails
  open** so an outage never blocks real enquiries). CORS lives here, **not** in `netlify.toml`.
- `apps/web/src/js/modules/config.js` holds the function URLs, overridable at build time via
  `VITE_ENQUIRY_FN_URL` / `VITE_NEWSLETTER_FN_URL` (see `.env.example`). Rebuild after
  changing them — Vite bakes them into the bundle. Server-side secrets
  (`RESEND_API_KEY`, `ARTIST_EMAIL`, `FROM_EMAIL`, `RESEND_AUDIENCE_ID`) live in the
  Netlify dashboard, never in the repo. Full setup: `docs/ENQUIRY-SETUP.md`,
  `docs/NEWSLETTER-SETUP.md`.

### Deploy targets — one repo, two independent deploys
The two workspaces deploy to **different places**, each gated so only relevant changes ship:

- **Frontend → GitHub Pages.** `.github/workflows/deploy-web.yml` builds `apps/web` (with
  `VITE_ENQUIRY_FN_URL` from repo Actions Variables) and publishes `apps/web/dist`. It is
  **path-gated** (`paths: apps/web/**`, lockfile, the workflow itself), so a functions-only
  change never triggers a Pages redeploy. `apps/web/public/` (favicons, `site.webmanifest`,
  `CNAME`) is copied to the site root as-is.
- **Functions → Netlify.** `netlify.toml` sets `base = "apps/functions"`, so Netlify's build
  is scoped to the functions workspace and only redeploys when `apps/functions/**` changes
  (set the **Base directory = `apps/functions`** once in the Netlify dashboard to match).
  Netlify no longer mirrors the whole site — it publishes a tiny placeholder page plus the
  function bundle. The canonical site is GitHub Pages.

This separation is the point of the monorepo split: **frontend changes deploy to Pages,
function changes deploy to Netlify, and neither drags the other along.**

## Git workflow — keep `main` clean

`main` is the **deploy branch**: every push triggers a GitHub Pages build *and* a
Netlify build. So `main` must only ever receive reviewed, self-contained commits —
never work-in-progress.

1. **Branch before you build.** `git switch -c feat/<thing>` off an up-to-date `main`.
   Never commit directly on `main`.
2. **Stage only what the task touches.** Use explicit paths (`git add path/…`), never
   `git add -A`. If unrelated changes are already sitting in the tree, commit or stash
   them on their own branch first so they don't get swept into your commit.
3. **One PR per change, squash-merge, delete the branch.**
   `gh pr create` → review the diff → `gh pr merge --squash --delete-branch`. This
   leaves `main` with one tidy commit per feature and no stale branches.
4. **Never rewrite published history on `main`.** No force-pushes to `main`. (Rebasing
   your *own* feature branch and `--force-with-lease`-ing it is fine and encouraged — see
   below.)

Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.

### Working on several features at once (avoid the branch tangle)

Solo work still means multiple features in flight. The failure mode is branches cut from
`main` that then sit and rot: when one squash-merges, the others fall behind and the
eventual merge fights conflicts. These rules keep parallel work cheap:

1. **One feature = one worktree = one branch = one PR.** Don't switch branches in the main
   checkout (stash/checkout churn loses context). Give each in-flight feature its own
   working copy that shares the one `.git`:
   ```bash
   git worktree add ../trees/<feature> -b feat/<feature> origin/main
   #   → its own folder, own node_modules (npm install once), own dev-server port.
   git worktree remove ../trees/<feature>   # once the PR is merged
   ```
   Worktrees live under `../trees/` (sibling of the repo), never committed.
2. **Cap in-flight branches at ~2–3.** Don't open a fourth until one merges or is parked.
3. **Rebase onto `main` daily, and immediately after *any* PR merges.** The moment one PR
   lands, rebase every other live branch (`git fetch && git rebase origin/main`) so it
   never drifts. Stale branches are the whole problem; this is the fix.
4. **Structural refactors run solo.** A change that *moves or renames files* (directory
   restructures, monorepo splits, mass renames) conflicts with everything. Merge it
   first, fast, with nothing else open — then branch the rest off the new layout. Never
   let a structural branch sit for days while content PRs pile up behind it.
5. **Keep branches small and short-lived** (a day or two). Small diffs rebase clean; long
   ones don't. CI (`.github/workflows/test.yml`) runs Vitest on every PR — merge on green.

**Resolving a stale branch** (the standard recovery): from its worktree,
`git fetch && git rebase origin/main`, fix conflicts, `npm test && npm run build`, then
`git push --force-with-lease`, then `gh pr merge --squash --delete-branch`.

## Deploy guardrail — do NOT switch the apex domain

`beansprout.ink` (apex) is intentionally still served by the **v1** repo
(`gfnnn/beansprout`). This v2 repo publishes only to the staging mirror
**beansprout.netlify.app** (Netlify) and GitHub Pages. **Do not point the apex at v2**
— and don't add apex A-records for Pages — until the copy and real images are
finalised. Netlify also hosts the enquiry/flash email function (Resend).

## Design system — don't drift

Warm earthy palette (cream `#F7F1E3`, moss `#4A5D3F`, clay `#C45A3E`, ink `#2C2A24`)
with Fraunces (serif display) / Karla (sans body) / JetBrains Mono (labels). Reuse the
shared nav, footer, button, and JS-module patterns across pages. Placeholder copy is
marked `<!-- COPY: -->`; image placeholders carry shoot briefs in HTML comments.
</content>
