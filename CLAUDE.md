# CLAUDE.md

Guidance for Claude Code in this repository: what changes how an agent acts on **every** task.
Detail for one area lives in a path-scoped rule (`.claude/rules/`, loaded when you touch that
area) or in its `docs/` topic file — see [Where the detail lives](#where-the-detail-lives).

# Beansprout — v2 (Beanstalk repo)

The live site for the Beansprout tattoo studio (`beansprout.ink`), plus the serverless
form/email app that backs it. An **npm-workspaces monorepo** with two deployable parts:

- **`apps/web`** — the frontend. Plain HTML pages bundled by **Vite** (no framework), modular
  CSS under `src/styles/`, ES modules under `src/js/modules/` wired through `src/js/main.js`.
  **Deploys to GitHub Pages.**
- **`apps/functions`** — a single Cloudflare Worker (`src/index.js` → `src/handlers/`) that
  receives the forms, stores submissions in **D1 (SQLite)** and sends mail via Resend.
  **Deploys to Cloudflare Workers.**

Each workspace owns its own `package.json`, `vitest.config.js` and `tests/`.

## Scope discipline — keep it lean (read this before adding anything)

This is a **marketing site + a small form/email Worker for one tattoo artist**, not an
enterprise platform. The codebase earns its quality by staying small (a 2-dependency frontend,
a 0-dependency Worker, no framework, no formatter); the standing risk is *meta*-bloat — building
ahead of need and accumulating docs that cost more to keep consistent than they're worth.
Follow these rules, and flag it when a request would cross one. **Priorities, plans and the
backlog are not kept in this repo** — what to build next arrives in the brief; if a brief is
silent on something that matters, ask rather than guess.

1. **Ship before you build ahead.** Don't write a feature's *code* — even gated/"dark" — before
   the thing it serves is live and the dependency is real. Appointment booking, an artist
   dashboard and a content CMS are **not built**; don't build towards them without a brief.
2. **One doc per concern; consolidate on sight.** If two docs cross-reference each other to stay
   in step, they should be one doc. **Merge them, don't reconcile them again.**
3. **A doc must earn its maintenance cost.** Prefer editing an existing doc to adding one. Docs
   describe what is **built or being operated**; a plan for an unbuilt feature gets no repo doc.
4. **State each rule once.** Say it in one place and link, don't repeat.
5. **Guard the lean baseline.** No new runtime dependency, build tool, framework, or process step
   without a named reason that outweighs its standing cost.
6. **Match effort to a one-artist business.** Reach for the smallest thing that genuinely helps
   day-to-day. "AAA polish" is for the **visitor-facing site**, not speculative internal tiers.

## Where you are

Delivery runs in one of two Claude Code modes. `$CLAUDE_CODE_REMOTE` is `true` only in the
second.

### Local session (the default)

A real machine: a shell, full git and `gh`, a browser. Everything is exercisable, so do it all:

- **Visual check before a feature PR.** For any change observable in the browser, start the dev
  server from `.claude/launch.json` (`web-dev`) in the Desktop **Browser pane**, open the
  page(s) the change touches, exercise the interaction, and confirm there are no console errors.
  Screenshot the changed view at desktop width (and mobile width if layout was touched) and
  attach it to the PR. Leave the server up afterwards so the change can be browsed by hand. If
  nothing is visually observable (tooling, docs, functions-only), say so in the PR instead.
- **E2E.** `npm run test:e2e` drives the production build in Chromium for the paths jsdom can't
  reach: the enquiry form (image preview/downscale, multi-step flow), the portfolio lightbox,
  the mobile nav drawer, the flash claim modal, plus a whole-site load sweep. It **skips
  cleanly (exit 0) when Chromium isn't installed, and a skip validates nothing** — install it
  once (`cd apps/web && npx playwright install chromium`). When you add browser-only behaviour,
  add or extend a spec under `apps/web/e2e/`. The E2E workflow also runs on every PR that
  touches `apps/web/**`.
- **The real Worker** is `wrangler dev` (serves on :8787 with a local D1; secrets in
  `apps/functions/.dev.vars`). Plain `npm run dev` serves only the static site.
- **`CLAUDE.local.md`** (gitignored) may hold private per-machine notes. Never commit it or
  copy its content into the repo, a PR or a commit message.

### Cloud session (Claude Code on the web)

A remote, ephemeral container. A SessionStart hook (`.claude/hooks/session-start.sh`) has
already run `npm ci`, so `npm test`, `npm run build` and `npm run lint` work at once and are
the signal to trust. What it **can't** do — expected limits, not failures to work around:

- **No browser.** Chromium can't be installed, so `test:e2e` skips and there is no visual
  check. Verify the served or built markup instead (`curl` the dev server, or grep
  `apps/web/dist/**`), say plainly in the PR that the visual check wasn't possible, and leave
  it to the PR's E2E job and a local review (`npm run preview:branch -- <branch>`).
- **Only its own branch.** The git proxy rejects remote-branch deletion and any other ref
  surgery (HTTP 403). Branch cleanup happens in a local session or the GitHub UI.
- **No `wrangler dev`, no media/Dropbox scripts, no `npm run smoke`** (network-gated).

## Commands

Run from the repo root; the root scripts delegate to the right workspace.

```bash
npm install            # install all workspaces (hoisted to the root node_modules)
npm run dev            # Vite dev server for apps/web at http://localhost:5173
npm run build          # production build of apps/web → apps/web/dist/
npm run preview        # serve the built apps/web/dist/ (this is where the CSP applies)
npm test               # both workspaces' Vitest suites (test:web / test:functions for one)
npm run test:e2e       # apps/web Playwright tier (see "Where you are")
npm run lint           # Biome lint over apps/**/{src,tests,e2e,scripts} + root scripts
npm run lint:fix       # the same, applying Biome's safe autofixes
npm run preview:branch -- <branch>   # local: fetch a branch, install, run its dev server
```

Vitest runs the Worker handlers against a mocked network and an in-memory D1 fake
(`apps/functions/tests/helpers/fake-d1.js`) — no real Resend or DB calls. **Biome is lint-only:
the formatter is deliberately off**, so don't run a formatter or invent `npm run format`.

## Architecture

```
apps/web/         @beansprout/web        → GitHub Pages
  index.html (home) + 404.html + one folder per page (portfolio/ flash/ services/ enquire/ …)
  src/data/      content + config: the single sources of truth
  src/build/     renderers that turn the data files into HTML strings at build time
  src/js/        main.js + modules/  (one orchestrated bundle, shared by every page)
  src/styles/    main.css → @imports every partial; tokens in variables.css
  public/        copied to the site root as-is, incl. the apex CNAME
  vite.config.js  tests/  e2e/
apps/functions/   @beansprout/functions  → Cloudflare Worker
  src/index.js   routes /enquiry /newsletter /flash-status /checkout /webhooks/stripe
  src/handlers/  src/lib/{http,db,stripe}.js  migrations/  wrangler.toml  tests/
docs/             topic runbooks (listed below)
.github/workflows/{test,e2e,deploy-web,media-sync,smoke}.yml
```

Rules that hold whatever you're touching:

- **Never hand-edit generated markup.** Tiles, cards, hero copy, the nav status pill, notices
  and testimonials are rendered at build time from `apps/web/src/data/*.js`. Edit the data file
  (its header comment documents every field) and let the build regenerate.
- **A new page** needs its folder + `index.html` **and** an entry in the `input` map in
  `apps/web/vite.config.js` (plus a `ROUTES` entry in `src/build/seo.js` if it's indexable), or
  it won't be built.
- **One JS bundle runs on every page**, so every module no-ops when its target element is
  absent. New behaviour = a new `modules/<name>.js` exporting `initX()`, added to `main.js`.
- **No CSS hard-codes a colour.** Colour comes from `apps/web/src/data/palette.js` as custom
  properties; spacing, shadows and easing use the tokens in `styles/variables.css`.
- **The Worker trusts nothing from the client** (MIME types are sniffed, amounts are read
  server-side) and **its storage fails safe**: a DB outage never blocks a real enquiry.
- **Secrets are Cloudflare Worker secrets** (`wrangler secret put`), never in the repo.
- **Payments are shipped dark.** `/checkout` returns 503 until `PAYMENTS_ENABLED === "true"`;
  don't switch it on or build the frontend without a brief.

### Where the detail lives

| Area | Read |
|---|---|
| Vite plugins, the data → HTML pipeline, per-piece pages, SEO, the site CSP | `.claude/rules/web-build.md` |
| JS modules, design system (palette, contrast floors, motion language) | `.claude/rules/web-frontend.md` |
| Worker handlers, D1 storage, CORS, secrets, response headers | `.claude/rules/worker.md` |
| GitHub Actions security | `.claude/rules/ci.md` |
| Branch roles, releases, rulesets, staging setup, backlog hygiene | [`docs/BRANCHING.md`](docs/BRANCHING.md) |
| Loader, entrance, page transitions — read before changing any motion | [`docs/MOTION.md`](docs/MOTION.md) |
| Image/video pipeline, Dropbox sync | [`docs/MEDIA.md`](docs/MEDIA.md) |
| Forms, newsletter and email setup; day-to-day operation | [`docs/ENQUIRY-SETUP.md`](docs/ENQUIRY-SETUP.md), [`docs/EMAIL-DOMAIN-SETUP.md`](docs/EMAIL-DOMAIN-SETUP.md) |
| GDPR retention, erasure, backup | [`docs/DATA-COMPLIANCE.md`](docs/DATA-COMPLIANCE.md) |
| Stripe checkout (model, build spec, operator runbook) | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) |
| GA4 analytics | [`docs/ANALYTICS.md`](docs/ANALYTICS.md) |
| The 2026-11-15 cutover record, its follow-ups, the rollback | [`docs/CUTOVER.md`](docs/CUTOVER.md) |

## Deploy targets — `main` is production

One repo, three independent deploys; none drags another along.

- **`main` → GitHub Pages → `beansprout.ink`.** `.github/workflows/deploy-web.yml` builds
  `apps/web` and is path-gated to `apps/web/**`. **A merge to `main` is a deploy to the live
  site.** `apps/web/public/CNAME` is what makes a build a production build; don't remove it or
  the Pages custom domain except as the rollback in `docs/CUTOVER.md` → Phase 4. The old v1
  repo (`gfnnn/beansprout`) is kept idle as that rollback target.
- **`develop` → Cloudflare Pages staging** (`*.pages.dev`), built in staging mode (noindex, no
  sitemap).
- **Worker → Cloudflare Workers Builds.** Git-connected on Cloudflare's side: a push to `main`
  runs `wrangler deploy`, other branches upload a preview version. No Cloudflare token lives in
  GitHub.

The Worker route URLs are baked into the web build from `VITE_*_FN_URL` (see `.env.example`):
GitHub Actions Variables for production, the Pages project's env for staging. Rebuild after
changing them.

## Git workflow — `develop` integrates, `main` releases

Features are designed outside this repo and arrive as a **brief**; delivery runs through the
`/deliver` command and the `design-reviewer` subagent. The full runbook is
[`docs/BRANCHING.md`](docs/BRANCHING.md) — read it before changing the flow.

1. **Branch before you build — off `develop`.** Never commit directly on `develop` or `main`.
2. **Stage only what the task touches.** Explicit paths (`git add path/…`), never `git add -A`.
3. **Supersession gate.** Skim the open PRs before starting, and before opening yours check the
   change isn't already on `develop` (`git diff origin/develop -- <your files>`).
4. **Check it before the PR**: `npm test`, `npm run build`, `npm run lint`, plus the visual and
   E2E checks your session can run (see [Where you are](#where-you-are)).
5. **One PR per change → `develop`, squash-merge.** `gh pr create --base develop`. Merging is
   the owner's call. Rebase your other live branches onto `develop` after any merge.
6. **Release in batches.** A `develop → main` PR titled `release: <date / summary>`,
   **merge-committed** (not squashed). `main` receives nothing else: no feature PRs, no direct
   commits.
7. **Never rewrite published history on `develop` or `main`.** Rebasing your *own* feature
   branch and `--force-with-lease`-ing it is fine.
8. **Verify repo settings before documenting them** — don't assert a setting's state from
   memory.

Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`. The repo is
public: never put a brief's private planning detail in a commit, PR body or repo file.

### Worktrees

One feature = one worktree = one branch = one PR, so parallel work never churns the main
checkout. Worktrees live under **`.claude/worktrees/`** (gitignored):

```bash
claude --worktree <feature>     # creates .claude/worktrees/<feature> on its own branch
git worktree remove .claude/worktrees/<feature>   # once the PR is merged
```

A worktree Claude Code creates gets the gitignored local files listed in `.worktreeinclude`
(`.env`, `apps/functions/.dev.vars`, `CLAUDE.local.md`) copied in; run `npm install` once in
it. Base the branch on `origin/develop`.

## Artist-copy markers

Wording that reads as **the artist speaking to a visitor** carries an inline marker until she
has approved it. The ref ID (`HOME-03`, `ENQ-07`, `FLASH-D1`, …) ties the block to the owner's
copy tracker, which is kept outside this repo — keep the ref intact.

```html
<!-- ARTIST-COPY · HOME-03 · pending approval -->
```

(`// ARTIST-COPY · HOME-10 · pending approval` in a data file; a short parenthetical note may
follow the status.)

- **Don't reword marked copy on your own initiative.** When a brief supplies the approved
  words, apply them and change `pending approval` → `approved` on that marker.
- **Grep the gate.** `grep -rn "pending approval" apps/web/ --exclude-dir=dist
  --exclude-dir=node_modules` lists what is still unapproved.
- **Don't hand-strip markers.** The production build removes every `<!-- ARTIST-COPY … -->`
  comment from the HTML (`stripArtistCopyMarkers` in `src/build/seo.js`); staging keeps them as
  a review aid.
- **Generated copy is marked in its data file** (`apps/web/src/data/*.js`), not in markup.
