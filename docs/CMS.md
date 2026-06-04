# Content management (CMS) — plan & decisions

Single source of truth for letting **Roxy manage site content herself** (portfolio,
flash, homepage alerts, copy) without touching code. Consolidates the earlier
findings/requirements/plan trio. Architecture context: [`CLAUDE.md`](../CLAUDE.md);
backlog/sequencing: [`ROADMAP.md`](./ROADMAP.md).

> **Status:** planned, **deferred until after go-live**. A post-launch track — the
> site ships first (clear the GDPR + real-images go-live blockers); the CMS pays off
> once content churns. Not started; first step is a POC (§6).

## 1. Decisions (locked)

- **Tool = TinaCMS** — git-backed (content + images stay in the repo, build stays
  self-contained) **with** email login via Tina Cloud (free tier, 1 editor). Chosen
  over Sanity (which would move content to a hosted lake, make the build depend on a
  SaaS, and serve images from a CDN) and over Sveltia (which needs a GitHub account).
  **Validate with the POC before building out.**
- **Publish = direct to live.** Tina commits to the deploy branch (`main`) → the
  existing Pages build redeploys (~1–2 min). A deliberate, scoped exception to the
  `main` review gate (content-only, single trusted editor; git revert + named fields
  are the safety net).
- **Editor = Roxy only.** Named/constrained fields, not freeform — an edit can't
  break layout.
- **Images = single upload now, responsive derivatives later** (a build step over the
  committed original; §5).

## 2. Why Tina fits *this* project

The site's identity (`CLAUDE.md`) is a self-contained static build with content in
git, minimal deps, and no runtime CDN. Tina is the only option that keeps all of that
*and* gives the non-technical editor an email-login dashboard:

| | Sveltia | Sanity | **TinaCMS** |
|---|---|---|---|
| Roxy's login | GitHub account ⚠️ | email ✅ | **email ✅** |
| Content source-of-truth | repo ✅ | hosted lake ⚠️ | **repo ✅** |
| Images | repo ✅ | CDN ⚠️ | **repo ✅** |
| Build / runtime 3rd-party dep | none ✅ | build-fetch + image CDN ⚠️ | **none ✅** |
| SaaS blast radius | none | content+build+images | **editing session only** |
| Cost (1 editor, ~200 views) | £0 | £0 free tier | **£0 free tier** |

Tina Cloud's only job is the editing session (auth + git commit). The live site has
**no Tina runtime** — content is pre-built to static HTML — so an outage means "can't
edit right now", never "site down", and a direct git edit is always the fallback.

## 3. What Roxy manages

How easily each lands depends on whether the content is **already structured data** or
**hand-authored HTML**. The data-driven ones are nearly free; the rest need a
prerequisite refactor (lift HTML → data file + renderer, the `homepage.js` pattern).

| Content | Source today | Ready? | Work |
|---|---|---|---|
| Portfolio (`pieces.js`) | structured array | ✅ | expose; add `hidden` flag |
| Flash (`flash.js`) | structured array | ✅ | expose; `status` stays code-driven |
| Homepage alerts + hero (`homepage.js`) | structured object | ✅ | expose; + auto-light (§5) |
| Testimonials (`testimonials.js`) | structured array | ✅ | expose (text only) |
| FAQ | `.faq-item` markup | ❌ | refactor → `faq` data + renderer |
| Services + pricing | hand-authored HTML | ❌ | refactor → repeatable items |
| About | hand-authored HTML | ❌ | refactor → named fields |
| Aftercare | hand-authored HTML | ❌ | refactor → named sections (lowest churn) |

**Out of scope:** editable **filters** (Roxy only *assigns* existing style/placement
tokens), **flash status** (stays on the live claim flow / inventory state), **Visit
home/guest** mode (stays hand-authored), and the **enquiries/claims admin** (a
separate initiative — ROADMAP **P2 submissions view**, a different data plane).

## 4. Architecture (git-backed — no new infra)

```
 Roxy ──edit──▶ Tina admin (email login, Tina Cloud)
                   │ save = commit content JSON + images to the repo
                   ▼
            push to main  ──▶  existing deploy-web.yml (push to apps/web/**)
                   │
                   ▼
   existing src/build/* renderers read src/data/*.json ──▶ static HTML ──▶ Pages
```

- **No build-time fetch, no webhook, no API token, no image CDN, no workflow change.**
  `npm run build` works exactly as today; the deploy trigger already exists.
- **Repo shape:** add `apps/web/tina/config.*` (schema + media), `apps/web/public/admin/`
  (built admin SPA — noindex + robots-disallow). Images keep landing in
  `public/images/…` where they already live.
- **One prerequisite migration:** move each `src/data/*.js` array/object into a sibling
  `*.json` and have the `.js` re-export it (`export { default as pieces } from
  './pieces.json'`). `vite.config.js` and every renderer stay **untouched**; the
  field-doc comments stay in the `.js`. The committed JSON keeps dev/CI offline.

## 5. Content model & cross-cutting

- **Tokens** (`styles`, `placement`, swatch `tone`) are constrained dropdowns sourced
  from a **shared tokens module** that also feeds the renderer label maps + tests, so
  Studio and site can't drift.
- **Palette binding:** colour/swatch options are generated from
  `src/data/palette.js` (the *never hard-code colour* single source) — alert tones
  `moss`/`clay`/`faint` only; portfolio `t-*`, flash `ci-*`. **Auto-suggest** the
  nearest brand swatch from the image's dominant colour; Roxy confirms/overrides.
- **Visibility:** standardise a `hidden` flag (portfolio, flash, testimonials, FAQ,
  notices); renderers filter it; tests assert it.
- **Ordering:** portfolio by `date`, flash by `drop` (unchanged); testimonials/FAQ
  manual `order`; notices an explicit **priority** rank.
- **Header auto-light** (the one in-scope design call): the single highest-priority
  active notice auto-derives the nav status pill (`label`+`tone`) on every page; small
  change in `src/build/homepage.js`. Define the tie-break before coding.
- **Images:** phase 1 single committed file (= today's single-file `img`); phase 2 a
  **sharp build step** generates the `-400/-800/-1200` avif/webp/jpg tiers from the
  committed original — no CDN. `w`/`h` auto-read at upload (no layout shift).

## 6. Phased delivery (after go-live)

0. **Tina POC** — Tina Cloud project + a `pieces` collection; confirm Roxy can
   email-login, add one real piece, commit → rebuild → live. Validates the tool.
1. **Tokens module + content-format migration** (`pieces` + `flash` → JSON
   re-exports); data-contract tests + `npm run build` stay green.
2. **Tina config + `/admin`** (schema for portfolio/flash/homepage/testimonials;
   palette-bound swatches; noindex).
3. **First slice live:** homepage alerts + hero (incl. auto-light) + portfolio + flash
   + testimonials, with the `hidden` flag. *(Highest value, all already data-driven.)*
4. **Refactor tier:** FAQ, then Services.
5. **Low-churn tier:** About, Aftercare.
6. **Phase 2 images:** sharp build step for responsive derivatives.

## 7. Security & hardening

Tina's *production* posture is strong — the live site is static HTML on Pages with **no
Tina runtime**, so a visitor's attack surface is unchanged, and the personal-data plane
(enquiries in Cloudflare D1) is entirely separate and never touches Tina. The risk sits
in the **authoring/build tooling** and the **Tina Cloud ↔ GitHub** link. Early-2026 CVEs
(incl. a 9.7) were all in the **CLI dev server** / **self-hosted backend**, not the
hosted editing path or the production site. Required controls:

- **Pin a patched baseline — Tina ≥ 2.2.2.** Covers the dev-server CORS + path-traversal
  fixes (2.1.8: CVE-2026-28792/28793) *and* the `@tinacms/graphql` symlink fix (2.2.2:
  CVE-2026-34604/34603). The POC starts on this baseline.
- **Treat `tinacms dev` as local-only.** Never run it in CI or expose it on a network;
  don't browse untrusted sites while it's running (the 9.7 is a browser drive-by against
  the dev machine — it can read `.env`/SSH/git creds). Same hygiene as any dev server.
- **Least-privilege the Tina Cloud GitHub App:** scope it to **this repo only**,
  **Contents-write only** — *not* workflows, *not* secrets. Worst-case compromise is
  "commit content to one repo" (triggers a deploy), not secret/workflow access. Enable
  **2FA** on Roxy's Tina account.
- **Avoid raw-HTML fields.** Replace the homepage `notices[].html` raw field with a
  structured one (text + optional link) so a stored-XSS value can't be authored; keep
  named/constrained fields everywhere.
- **Dependency monitoring:** Dependabot + `npm audit` on the Tina packages so a future
  CVE is caught fast; CI already runs on PRs.
- **Direct-publish is an accepted, documented exception** to the review gate — scoped to
  content-only commits by a single trusted editor; revert via git history.

## 8. Open questions

1. **Tina admin hosting** — self-hosted `/admin` SPA in the Pages build (recommended,
   no extra infra) vs. Tina's hosted admin.
2. **Header-light tie-break** when notices share a priority.
3. **Auto-suggest swatch** — dominant-colour → nearest-swatch algorithm + where it runs.
4. **Content format** — JSON throughout vs. MD/MDX for the prose pages (About/Aftercare).
