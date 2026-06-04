# Beansprout — CMS plan

How the artist gets a **management layer** over the site, covering both halves
of "CMS" as one plan:

- **Track A — Content CMS.** Edit what the site *shows* (portfolio, flash, copy,
  palette) without touching code. Today these are hand-edited `src/data/*.js`
  modules.
- **Track B — Submissions admin.** Manage what the site *captures* (enquiries,
  flash claims) — the parked ROADMAP P2 "artist-facing view + status lifecycle",
  plus the GDPR erasure go-live blocker.

They are two different data planes with different trust levels (public Git content
vs. personal data in Netlify Blobs), so they stay **separate systems** behind one
artist entry point. This doc is the plan; nothing here is built yet. Architecture
context lives in [`CLAUDE.md`](../CLAUDE.md); backlog framing in
[`ROADMAP.md`](./ROADMAP.md).

---

## 1. Current state (what we're building on)

**Content** is data-driven and build-time rendered (see CLAUDE.md → "Data →
build-time HTML pipeline"):

| File | Drives | Notes |
|------|--------|-------|
| `apps/web/src/data/pieces.js` | `/portfolio/` masonry + per-piece pages | tokens: `styles`, `placement`, `tone`, `glyph`; `date` orders the grid |
| `apps/web/src/data/flash.js` | `/flash/` grid | tokens: `status`, `tone`, `glyph`; `drop` splits current vs. archive |
| `apps/web/src/data/homepage.js` | hero, status light, notices, specialism picks | |
| `apps/web/src/data/testimonials.js` | homepage testimonials | |
| `apps/web/src/data/palette.js` | every colour (active palette) | switch `active` to recolour |

Each is an ESM `export const …`; `vite.config.js` imports them and the renderers
(`src/build/*.js`) replace `<!-- … -->` markers with static HTML, in **dev and
build**. Field tokens must stay in step with the HTML filter chips / `<select>`
options and the renderer label maps (CLAUDE.md: "change them together"). Frontend
deploys to **GitHub Pages** via `.github/workflows/deploy-web.yml` (path-gated to
`apps/web/**`).

**Submissions** are server-side:

- `apps/functions/netlify/functions/enquiry.js` persists every enquiry/flash claim
  to the Netlify Blobs **`submissions`** store via `persistSubmission()` (record:
  `{ id, kind, receivedAt, ip, fields, imageCount, imageNames, skipped, emailStatus }`).
  Image bytes are **not** stored.
- Flash reservations live in the **`flash-claims`** store as one `claims` key →
  `{ <piece-id>: 'pending' | 'claimed' }`; `flash-status.js` reads it (GET, no
  auth, no writes) and the live grid reflects it.
- `_shared.js` owns the CORS allowlist (`ALLOWED_ORIGINS`, `CANONICAL_ORIGIN =
  https://beansprout.netlify.app`), the rate limiter, `persistSubmission`,
  `reserveFlashPiece`, `getFlashClaims`.
- Functions deploy to **Netlify only** (`netlify.toml`, `base = apps/functions`),
  with a placeholder `public/index.html`. Netlify serves `X-Robots-Tag: noindex`
  on everything.

**Gaps today:** no read/manage surface for submissions, no `status` write-path, no
erasure/retention (go-live blocker), and no way for the artist to edit content
without a code change + PR.

---

## 2. Track A — Content CMS

**Goal:** the artist edits pieces/flash/copy/palette in a browser UI; changes land
as a reviewed PR that triggers the existing Pages deploy. No new always-on infra.

### Recommended approach: a Git-based CMS (Decap) → PR → Pages

[Decap CMS](https://decapcms.org) (the maintained Netlify CMS successor) is a
single static `/admin/` page + a `config.yml`. It reads/writes content files in the
repo via the **GitHub backend** and, with **editorial workflow** on, opens a PR per
change — which slots straight into our "main only gets reviewed squash-merges"
rule. The deploy is unchanged: merge → `deploy-web.yml` rebuilds Pages.

Why Decap over a hosted CMS (Sanity/Contentful/Tina): no external content store, no
runtime dependency, content stays in-repo and diff-reviewable, zero monthly cost,
and it reuses the deploy/review gate we already trust.

#### A.1 Content format: pair each `*.js` with a data file

Decap edits structured data (YAML/JSON/Markdown), not hand-written JS. Rather than
rewrite the pipeline, **split data from code**: move each array/object into a
sibling data file and have the `.js` re-export it, so `vite.config.js` and the
renderers are untouched.

```
src/data/pieces.js      →  export { default as pieces } from './pieces.json'  (or a thin wrapper)
src/data/pieces.json    →  the array Decap edits
```

- Keep the rich header comments (field docs) in the `.js`; JSON can't hold them, so
  the `.js` stays the documented entry point.
- `palette.js` has computed/`active`-switch logic — keep that as code; expose only
  the palette **hexes/tones** as data if we want them CMS-editable (lower priority;
  recolouring is rare and risky, so palette can stay code-only in phase 1).

> Decision point D1 (below): JSON vs YAML vs keep-as-JS with a custom widget. JSON
> is the lowest-friction (native to Decap, trivially imported by Vite).

#### A.2 Constrain tokens in the CMS so they can't drift

The drift risk CLAUDE.md warns about is solved *better* by a CMS than by hand-edit:
model each token field as a `select`/`relation` widget whose options are the exact
allowed values, so the artist literally can't enter an off-list `style`,
`placement`, `tone`, `glyph`, or `status`. Source those option lists from one place
(a shared `tokens` data file) consumed by **both** the CMS config and the renderer
label maps, so they can't fall out of step.

#### A.3 Images

`pieces.js` already supports a **single-file** `img` (e.g. `/images/tattoos/Koi.webp`)
served as-is — which is the artist's current workflow (approved 700×930 webp
exports). Decap's media library uploads one file to `apps/web/public/images/…`, sets
`img`, and we keep the single-file form (no responsive-derivative generation
needed). The no-image placeholder path (`tone` + `glyph`) stays as the default for
not-yet-shot pieces. Responsive `-400/-800/-1200` srcset stays a manual/advanced
path, documented but not required in the CMS.

#### A.4 Auth (Pages can't run an OAuth token exchange)

Decap's GitHub backend needs an OAuth provider to swap the code for a token. We
**already run serverless functions on Netlify** — add a tiny OAuth proxy there
(`apps/functions/netlify/functions/auth.js` + callback) implementing Decap's
external-OAuth contract, gated to the studio's GitHub login. No new infra, reuses
the Netlify deploy. (Alternative: GitHub backend with a public OAuth app via a
hosted proxy — avoid; self-hosting the proxy keeps secrets ours.)

#### A.5 Track A work breakdown (PR-sized)

1. **Data/code split** for `pieces` + `flash` (JSON + re-export); update imports;
   `npm test && npm run build` stay green (tests already cover the renderers — they
   become the safety net for the refactor). *Structural-ish — land it solo per
   CLAUDE.md's refactor rule.*
2. **Shared `tokens` data file** feeding the renderer label maps (replace the
   inline maps) — proves the single-source-of-truth before the CMS consumes it.
3. **Decap OAuth proxy** function on Netlify (+ test with network mocked, matching
   `apps/functions/tests/` style).
4. **`apps/web/admin/` Decap app** (`index.html` + `config.yml`) with collections
   for pieces, flash, homepage, testimonials; editorial workflow → PR. Register
   `/admin/` appropriately (it must **not** be indexed or sitemapped — add to
   `robots.txt` disallow, keep out of `ROUTES`).
5. **Homepage + testimonials** collections (copy-only, low risk) — can ship with 4.
6. *(Deferred)* palette-as-content collection, once colour QA tooling exists (see
   ROADMAP P3 palette QA).

---

## 3. Track B — Submissions admin (ROADMAP P2)

**Goal:** a gated view of `submissions` + `flash-claims` with a status lifecycle
(`new → replied → booked → completed`; flash `pending → claimed`), plus delete (GDPR
erasure). This is the read/manage surface + status write-path the ROADMAP says is
missing.

### Refinement to ROADMAP option (a): host the admin on **Netlify**, not Pages

The ROADMAP recommended a gated `/admin/` on the marketing site. Recommend a small
refinement: serve the **submissions** admin from the **Netlify functions site**
(the `apps/functions/public/` publish dir that's currently a placeholder), because:

- The data and the functions are already on Netlify → the admin is **same-origin**
  with its API, so it can use a session **cookie** instead of a CORS-exposed bearer
  token, and we don't have to widen the CORS allowlist for a credentialed endpoint.
- It keeps personal-data tooling **off** the public marketing site entirely
  (defence in depth; the marketing site stays a pure static brochure).
- Netlify already sends `X-Robots-Tag: noindex` site-wide, so the admin is
  unindexed for free.

So: Track A's content CMS lives at `beansprout.ink/admin/` (Pages, Git content);
Track B's submissions admin lives at `beansprout.netlify.app/admin/` (Netlify,
Blobs data). One artist bookmark page can link to both. (If you'd rather keep both
on one origin, see decision D2.)

### B.1 New functions

| Function | Method | Does |
|----------|--------|------|
| `admin-auth.js` | POST | exchange password (env `ADMIN_PASSWORD`) → signed, httpOnly session cookie; or verify GitHub OAuth (reuse Track A proxy) |
| `admin-list.js` | GET | auth-gated; list/paginate `submissions` (filter by `kind`, `status`, `emailStatus`) and the `flash-claims` map |
| `admin-update.js` | POST | auth-gated; set a submission's `status`/notes (update in place via `persistSubmission(record, id)`), and flip a flash piece `pending↔claimed` in the `flash-claims` map |
| `admin-delete.js` | POST/DELETE | auth-gated; **erasure** — `store.delete(key)` on `submissions` + drop the id from `flash-claims` |

All gated behind a shared `requireAdmin(event)` helper in `_shared.js` (cookie/token
check), and **none** fail open (unlike the rate limiter — auth must fail *closed*).

### B.2 Status lifecycle

- Add an optional `status` field to the submission record (default `new`). The
  enquiry function already writes `emailStatus`; `status` is the **human** workflow
  state, distinct from delivery state. `admin-update` advances it.
- Flash live status already exists in `flash-claims` (`pending`/`claimed`);
  `admin-update` lets the artist mark a claim `claimed` (deposit paid) or release it
  back to available. The grid already reflects this via `flash-status.js`.

### B.3 GDPR — clears the go-live blocker

- **Erasure path:** `admin-delete` (delete-by-key) — the manual erasure the privacy
  page must promise.
- **Retention:** a Netlify **scheduled function** (`retention-sweep.js`) that deletes
  `submissions` older than the agreed window (decision D4). Document the window +
  erasure in `docs/ENQUIRY-SETUP.md` and on the privacy page ("How long we keep
  it"). This is exactly what `_shared.js` `persistSubmission` and the ROADMAP flag.

### B.4 Track B work breakdown (PR-sized)

1. **`requireAdmin` + `admin-auth`** (session cookie or token), with tests (network
   mocked). Fails closed.
2. **`admin-list`** read endpoint + a minimal admin HTML page in
   `apps/functions/public/admin/` (table, filters). No writes yet — proves the read
   surface.
3. **`admin-update`** (status write-path + flash flip) wired into the page.
4. **`admin-delete`** (erasure) + the retention scheduled function; update privacy
   page + `ENQUIRY-SETUP.md`. **This pair clears the go-live blocker.**

---

## 4. How the two tracks fit together

```
Artist
  │
  ├─ Content  →  beansprout.ink/admin/        (Decap, Pages)   → edits src/data/*.json → PR → Pages deploy
  │                                                              what the site SHOWS (public, Git, reviewable)
  └─ Enquiries → beansprout.netlify.app/admin/ (custom, Netlify) → reads/writes Blobs stores
                                                                 what the site CAPTURES (personal data)
```

- **Shared auth (optional, nice-to-have):** both can sit behind the same GitHub
  OAuth (the Track A proxy), so the artist logs in once with GitHub. Phase 1 can
  ship Track B on a simpler password to avoid coupling.
- **Deploy isolation is preserved:** content edits only touch `apps/web/**` (Pages);
  admin functions only touch `apps/functions/**` (Netlify). Neither drags the other,
  exactly as the monorepo split intends.
- **They never share a data store:** Git content and Blobs personal data stay
  separate; the only link is one artist landing page that links out to both.

---

## 5. Cross-cutting concerns

- **Security.** Admin endpoints fail **closed**; secrets (`ADMIN_PASSWORD`, OAuth
  client secret) live only in the Netlify dashboard. Keep admin surfaces off the
  indexed site (robots disallow + noindex). Don't widen `ALLOWED_ORIGINS` for
  credentialed admin calls — prefer same-origin + cookie. No AI/CI action is added
  (CLAUDE.md CI security rules unchanged). The human PR-review gate on `main` is the
  content CMS's safety net — keep editorial workflow on.
- **Testing.** Every new function gets a Vitest with network/Blobs mocked
  (`apps/functions/tests/` pattern: `shared.test.js`, `enquiry.test.js`). The
  data/code split is guarded by the existing `apps/web/tests/` renderer + data-
  integrity tests — extend them to assert tokens come from the shared list.
- **Visual check.** The Decap `/admin/` and the submissions table are user-visible →
  run + screenshot before each PR (CLAUDE.md "Visual check before a feature PR").
- **No new build tooling** for content (Decap is static); the only runtime additions
  are Netlify functions, which the platform already hosts.

---

## 6. Open decisions (need a call before/at build time)

- **D1 — Content file format:** JSON (recommended, native to Decap + Vite) vs YAML
  vs keep `.js` with a custom Decap widget. Affects the data/code split.
- **D2 — Where the submissions admin lives:** Netlify same-origin (recommended,
  cookie auth, off the public site) vs a gated `/admin/` on Pages (ROADMAP's
  original (a), needs CORS widening for credentialed calls).
- **D3 — Admin auth mechanism:** shared password (simplest) vs GitHub OAuth (unifies
  with Track A) vs Netlify Identity (heaviest). Recommend password for phase 1,
  GitHub OAuth once the Track A proxy exists.
- **D4 — Retention window** for `submissions` (e.g. 12 / 24 months) — drives the
  scheduled sweep and the privacy-page copy. A real policy call (artist/legal).
- **D5 — Palette in the CMS?** Defer (recolouring is rare + risky, and ROADMAP P3
  flags palette visual QA is still outstanding). Keep palette code-only in phase 1.

---

## 7. Phased delivery (suggested order)

Smallest-surface, blocker-clearing work first; each step is one PR, merged on green.

1. **A.1 data/code split** (pieces + flash → JSON) — structural, land solo.
2. **A.2 shared tokens file** + renderer/test wiring.
3. **B.1–B.2 read surface:** `requireAdmin` + `admin-auth` + `admin-list` + read-only
   admin page. *(First visible artist value: see enquiries outside the inbox.)*
4. **B.3 write-path:** `admin-update` (status + flash flip).
5. **B.4 GDPR:** `admin-delete` + `retention-sweep` + privacy/docs. **← clears a
   go-live blocker.**
6. **A.3–A.5 content CMS:** OAuth proxy + Decap `/admin/` with pieces/flash/copy
   collections (editorial workflow → PR).
7. **Deferred:** palette collection, homepage/testimonials polish, GitHub-OAuth
   unification of the two admins.

Steps 1–5 are independently valuable and unblock the apex go-live (combined with
real copy/images, the other blocker); step 6 is the bigger "edit-without-code" win.

## 8. Risks & mitigations

- **Token drift between CMS, renderers, HTML chips** → single shared `tokens` list
  consumed by all three; test asserts it.
- **Refactor regressions** in the data/code split → existing renderer tests + a
  build are the gate; split is behaviour-preserving (same arrays, new location).
- **Admin auth mistakes** (fail-open, leaked secret, indexed page) → fail closed,
  secrets in Netlify only, robots disallow + existing noindex, same-origin cookie.
- **Decap editorial-workflow PRs bypassing review** → keep the `main` review gate;
  CMS PRs are reviewed like any other (they *are* ordinary PRs).
- **Scope creep into Stripe/booking** (ROADMAP P2 also lists deposits) → explicitly
  out of scope here; the status lifecycle is the foundation a later deposit step can
  hang off, but it's not in this plan.

## 9. ROADMAP touch-ups when this lands

- Move P2 "Artist-facing view + status lifecycle" from *parked* to *in progress*,
  pointing at this doc and recording decision D2 (Netlify-hosted admin).
- Mark the GDPR retention/erasure go-live blocker as addressed once B.4 ships.
- Note the content CMS as the mechanism that turns "real copy + images" from a
  code task into an artist task.
</content>
</invoke>
