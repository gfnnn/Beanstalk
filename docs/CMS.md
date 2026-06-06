# Content management (CMS) — backlog stub

Letting **Roxy manage site content herself** (portfolio, flash, homepage alerts, copy)
without touching code. **Post-launch backlog — not built, not blocking the apex
cutover.** This is a deliberately short stub: the locked decisions and the security
baseline below are the durable part; the detailed content model, phased delivery, and
architecture diagram were trimmed to avoid going stale before the work starts (see git
history for the earlier long-form spec). First step when picked up is a POC.

> Distinct from the ROADMAP "artist-facing view" (which manages *enquiries/claims* in
> D1) — this manages *site content* in the repo.

## Decisions (locked)

- **Tool = TinaCMS** — git-backed (content + images stay in the repo, build stays
  self-contained) with **email login** via Tina Cloud (free tier, 1 editor). Chosen over
  **Sanity** (moves content/images off git to a SaaS + CDN, makes the build depend on it)
  and **Sveltia** (needs a GitHub account). Validate with a POC before building out.
- **Publish = direct to live** — Tina commits to `main` → the existing Pages build
  redeploys. A deliberate, scoped exception to the `main` review gate (content-only,
  single trusted editor; git revert is the safety net).
- **Editor = Roxy only**, named/constrained fields (not freeform) so an edit can't break
  layout. Colour/swatch options bind to `src/data/palette.js` so the dashboard can't
  drift off-brand.

## Why Tina fits

The site's identity is a self-contained static build with content in git, minimal deps,
no runtime CDN. Tina keeps all of that *and* gives a non-technical editor an email-login
dashboard. The **live site has no Tina runtime** (content is pre-built to static HTML), so
a Tina outage means "can't edit right now", never "site down", and a direct git edit is
always the fallback. The personal-data plane (enquiries in D1) never touches Tina.

## Scope

**In** (data-driven, nearly free to expose): portfolio (`pieces.js`), flash (`flash.js`),
homepage alerts + hero (`homepage.js`), testimonials. **Needs a prereq refactor**
(hand-authored HTML → data file + renderer, the `homepage.js` pattern): FAQ, Services,
About, Aftercare. **Out:** editable filters (Roxy only assigns existing tokens), flash
status (stays on the live claim flow), Visit home/guest mode, the enquiries/claims admin.

## Image management (crop / re-centre)

A real need for a non-technical editor: upload a photo and **re-frame it** (centre,
crop, zoom) without code — not just edit metadata. This is the only image-specific
work beyond exposing the data fields, and it's lighter than a bespoke crop app:

- **Today:** `apps/web/scripts/process-media.mjs` auto-crops to the tattoo, with an
  optional manual `crop: { cx, cy, h }` override per image (see [`MEDIA.md`](./MEDIA.md)).
  Those override values currently live in the processing driver, not the repo.
- **The prereq refactor (small, do first):** lift `crop` into `pieces.js` as optional
  per-piece fields. Re-centring then becomes a *data* edit — hand-editable **and**
  Tina-exposable — and the auto-crop stays the on-upload default.
- **In Tina:** expose `crop` either as plain `cx`/`cy`/`h` number fields or as a small
  **custom field component** (Tina supports custom React field UIs) — a drag-the-dot
  focal picker over the image. That custom picker *is* the "crop dashboard"; it's a
  contained component, not a separate app.
- **The one piece of glue — regeneration.** Because the responsive tiers are committed
  binaries (git-backed model), changing `crop` must **re-run the processor**. Options:
  a GitHub Action that regenerates a slug's tiers when its `crop`/`img` changes on
  commit, or a Tina post-save hook. This is the only non-trivial build item; the rest
  is field config.
- **Why not a hosted hotspot UI (e.g. Sanity's built-in crop):** rejected with Sanity
  itself — it moves images to a SaaS/CDN and makes the build depend on it. We keep the
  git-backed model; the focal picker is a small custom Tina field instead.

Net: **no big bespoke dashboard** — pick up the data-driven `crop` refactor as a tiny
standalone PR whenever, then the focal picker + regenerate Action ride along with the
Tina build.

## Security baseline (required when built)

Early-2026 CVEs were all in Tina's **CLI dev server / self-hosted backend**, not the
hosted editing path or the static production site. Controls: **pin Tina ≥ 2.2.2**; treat
`tinacms dev` as **local-only** (never in CI/exposed; it's a browser drive-by risk that
can read local creds); **least-privilege the Tina Cloud GitHub App** — this repo only,
Contents-write only, no workflows/secrets, 2FA on; **avoid raw-HTML fields** (structured
text + optional link, so no stored-XSS); Dependabot + `npm audit` on the Tina packages.

## Open

Admin hosting (self-hosted `/admin` SPA in the Pages build, recommended, vs Tina's hosted
admin); header-light tie-break when notices share priority; content format (JSON vs
MD/MDX for prose pages). Sequencing: ship the site first, add the CMS once content churns
— a POC to validate Tina end-to-end before building out.
