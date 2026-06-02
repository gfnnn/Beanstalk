# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Beansprout — v2 (Beanstalk repo)

Static marketing site for the Beansprout tattoo studio. Plain HTML pages bundled by
**Vite** (no framework): styling in modular CSS under `src/styles/`, behaviour in ES
modules under `src/js/modules/` wired through `src/js/main.js`. Design tokens live in
`src/styles/variables.css`.

## Commands

```bash
npm install        # install deps (vite, gsap, lenis, @netlify/blobs)
npm run dev        # Vite dev server at http://localhost:5173 (live grid injection)
npm run build      # production build → dist/
npm run preview    # serve the built dist/ locally
```

There is **no test suite, linter, or formatter** in this repo — don't invent
`npm test`/`npm run lint`. To exercise the Netlify functions locally you need the
Netlify CLI (`netlify dev`, serves on :8888) plus a `.env` (`cp .env.example .env`);
plain `npm run dev` serves only the static site, not the functions.

## Architecture

### Multi-page Vite build
Every page is its own `index.html` in a top-level folder (`portfolio/`, `about/`,
`flash/`, `enquire/`, …) and is registered as a Rollup input in `vite.config.js`. Add a
new page → add the folder/`index.html` **and** a matching entry in the `input` map, or it
won't be built. All pages load the same bundle: `<link href="/src/styles/main.css">`
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
- The `generatedGrids` plugin in `vite.config.js` (`transformIndexHtml`, runs in **both**
  dev and build) replaces the `<!-- pieces:masonry -->` marker in `portfolio/index.html`
  and the `<!-- flash:grid -->` marker in `flash/index.html` with that output. Grids ship
  as static HTML (good for SEO/no-JS/LCP).

**Never hand-edit the generated tile/card markup** — edit the data file and let the build
regenerate it. Tokens in the data (`styles`, `placement`, `status`, `tone`, `glyph`) must
match the filter chips / `<select>` options in the HTML and the label maps in the
renderers; change them together.

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

- `netlify/functions/enquiry.js` handles **both** the enquiry and flash-claim forms,
  distinguished by a `kind` field (`'enquiry'` | `'flash'`); a `FORMS` table defines the
  required fields, consent boxes, image support and email layout per kind. Images are
  downscaled in the browser before upload. Sends via **Resend**.
- `netlify/functions/newsletter.js` adds a subscriber to a Resend Audience.
- `netlify/functions/_shared.js` is shared support code (the leading `_` keeps Netlify from
  deploying it as a function): the **CORS origin allowlist** and the **rate limiter**
  (per-IP sliding window + global daily ceiling, backed by Netlify Blobs, **fails open** so
  an outage never blocks real enquiries). CORS lives here, **not** in `netlify.toml`.
- `src/js/modules/config.js` holds the function URLs, overridable at build time via
  `VITE_ENQUIRY_FN_URL` / `VITE_NEWSLETTER_FN_URL` (see `.env.example`). Rebuild after
  changing them — Vite bakes them into the bundle. Server-side secrets
  (`RESEND_API_KEY`, `ARTIST_EMAIL`, `FROM_EMAIL`, `RESEND_AUDIENCE_ID`) live in the
  Netlify dashboard, never in the repo. Full setup: `ENQUIRY-SETUP.md`,
  `NEWSLETTER-SETUP.md`.

### Deploy targets
`main` deploys to **two** places on every push: GitHub Pages (`.github/workflows/deploy.yml`,
builds with `VITE_ENQUIRY_FN_URL` from repo Actions Variables) and Netlify (`netlify.toml`,
which also publishes the function bundle). `public/` is copied to the site root as-is
(favicons, `site.webmanifest`, `CNAME`).

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
4. **Never rewrite published history.** No force-pushes to `main`.

Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.

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
