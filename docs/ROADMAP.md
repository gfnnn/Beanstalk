# Beansprout — roadmap & open decisions

Outstanding work and the decisions needed to unblock it, derived from a
platform evaluation (senior-dev / artist / marketer / customer lenses). This is
the living backlog — update it as items land. Architecture lives in
[`CLAUDE.md`](../CLAUDE.md); function/secret setup in
[`ENQUIRY-SETUP.md`](./ENQUIRY-SETUP.md) and [`NEWSLETTER-SETUP.md`](./NEWSLETTER-SETUP.md).

## Status snapshot

Shipped (audience-capture + early management layer):

- **P0 hardening** — portfolio scroll-reveal fix, enquiry-upload XSS fix,
  dead-guard removal; vendor-agnostic analytics scaffold; persist-before-email
  for enquiries/flash; `clientIp` anti-spoof + request body/per-image size caps;
  skip-to-content links; branded 404.
- **Inline newsletter capture** on the homepage, flash, and post-enquiry pages.
- **Per-piece portfolio pages** at `/portfolio/<slug>/` (per-piece SEO + sitemap).
- **Data-driven testimonials** (`src/data/testimonials.js`).
- **Flash inventory state** — claims reserve the one-of-a-kind piece server-side
  (reject double-claims with 409); the grid reflects live availability.
- **Centralised colour palette** — every colour now lives in one content file
  (`src/data/palette.js`); `src/build/palette.js` turns the **active** palette into
  CSS custom properties that a build plugin injects into each page's `<head>` (dev
  + build), so no CSS hard-codes a colour. Switch `active` (or edit a palette's
  hexes) to recolour the whole site; ships with `woodland` (the original look) and
  a `dusk` example. The decorative tile/flash/hero swatch gradients — previously
  duplicated across four files — are defined once in `styles/components/tones.css`
  from the palette `tones`. See the design-system section of `CLAUDE.md`.
- **Redundancy/health cleanup** — shared HTML helpers `esc`/`HAS_EXT`
  (`src/build/html.js`), `EMAIL_RE` in `_shared.js`, and a sticky-shadow helper
  (`src/js/modules/sticky.js`) replace 2–3 copies each; the enquiry image-preview
  object-URL leak is fixed.

Deploys to **staging only** (GitHub Pages + the Cloudflare Worker). The apex
`beansprout.ink` stays on **v1** until the go-live blockers below are cleared — see
the deploy guardrail in `CLAUDE.md`.

> **Backend migrated off Netlify → Cloudflare (Workers + D1).** Netlify's free tier
> now pauses the whole project on a monthly **credit limit** (it took the staging
> functions down), so the three functions were ported to one Cloudflare Worker and
> personal data moved to **D1 (SQLite)** — which also delivers the "proper,
> compliance-manageable store" we wanted (erasure/retention are now plain SQL).

## Go-live blockers (clear before pointing the apex at v2)

- **Submissions retention/erasure (GDPR).** ✅ **Cleared (MVP).** The `submissions`
  / `newsletter_consent` **D1 tables** hold personal / special-category data. A
  concrete **retention period** (12 months) and a working **erasure path**
  (delete-by-email) now exist as plain SQL via `wrangler d1 execute`, documented in
  `docs/DATA-COMPLIANCE.md`; the privacy page already states the retention period
  and one-month response. The remaining strategic step is the **management UI +
  automation** (per-subject view, one-click erasure, auto-retention), folded into
  the P2 artist-facing admin view below.
  - 👤 Remaining: once the Worker + D1 are live, dry-run the runbook once (an access
    `SELECT` + the prune preview) and set a quarterly prune reminder.
- Real copy + images (content track — out of scope for engineering).

## Open decisions (needed before the blocked work)

1. **Analytics vendor** — Plausible / Fathom (cookieless, no consent banner) vs
   GA4 (needs a consent banner). Turns the `track()` scaffold
   (`src/js/modules/analytics.js`) live and unblocks the retargeting pixel.
2. **Instagram-feed mechanism** — static periodic snapshot / third-party widget /
   Graph API. Each trades freshness against weight and maintenance.
3. **Artist-facing view — where it lives** (see P2 below).

## Backlog

### P2 — toward booking/enquiry *management*

- **Artist-facing view + status lifecycle** _(parked — to be researched)._
  - **Goal:** make the captured data manageable — a list of submissions/claims
    with a status lifecycle (new → replied → booked → completed) and a
    flash-claimed view, so enquiries don't live only in an inbox.
  - **The data already exists:** every enquiry/flash claim is persisted to the
    `submissions` D1 table (with `email_status`), and flash reservations to
    `flash_claims` — both written in `apps/functions/src/lib/db.js`. What's missing
    is a **read/manage surface** and a **status write-path**. D1 being a real SQL DB
    makes this a normal query layer, not a scan.
  - **Open decision — where it lives:**
    - **(a) Gated admin route on the Worker** (e.g. `/admin`) that reads/writes the
      D1 tables, behind a shared secret / Cloudflare Access. _Smallest step; reuses
      the existing Worker + D1; no new infra._
    - **(b) Separate lightweight admin app.** More isolation, more infra.
    - **(c) No UI** — structured email labelling / a Resend-side workflow, with
      D1 as the system of record. Cheapest; least "management".
  - **Recommendation (for when you pick this up):** **(a)** — a gated route querying
    the D1 tables, plus a write-path to flip a record's status. It
    delivers a real lifecycle view with the least new surface area. Pairs with a
    `status` write-path so replies/bookings update the record.
  - **Dependency:** the GDPR erasure path (go-live blocker) naturally lives in
    the same admin surface (delete-by-key).

- **Stripe deposit capture.** The no-show defence the copy already promises
  (Stripe is named in the enquire page). A Payment Link / Checkout wired into the
  enquiry-confirmation flow, with the deposit recorded against the submission.

- **GDPR retention/erasure** — also a go-live blocker (above); the erasure UI
  belongs with the artist-facing view.

### P2 — content dashboard (CMS for Roxy) _(planned — decided, deferred until after go-live)_

Let Roxy manage **site content** herself (distinct from the artist-facing view
above, which manages *enquiries/claims*). Full plan, decisions, architecture and
security: [`CMS.md`](./CMS.md).

- **Scope:** portfolio (image + data, hide), flash (upload + data), homepage alert
  system + hero, testimonials, then the hand-authored pages (FAQ, services, about,
  aftercare). **Out:** editable filters, flash status, Visit home/guest.
- **Tool decided — TinaCMS** (git-backed: content + images stay in the repo, build
  stays self-contained) with email login via Tina Cloud (free tier, 1 editor).
  **Publish = direct to live** (commits to `main` → existing Pages build). Chosen
  over Sanity (which would move content/images off git to a SaaS + CDN) and Sveltia
  (GitHub-account friction). Hardening + CVE controls in `CMS.md` §7.
- **Sequencing:** a post-launch track — ship the site first (GDPR + images), add the
  CMS once content churns. First step is a POC to validate Tina end-to-end.
- **Palette tie-in:** colour/swatch pickers generate from `src/data/palette.js` and
  honour the *never hard-code colour* rule, so the dashboard can't drift off-brand.

### P1 leftovers (decision-blocked)

- **Retargeting pixel** (Meta/TikTok) — blocked on the analytics-vendor decision.
- **Instagram feed embed** — blocked on the feed-mechanism decision.

### P3 — polish

- **Self-host + subset the fonts** (LCP + EU-privacy) — currently the Google
  Fonts CDN, render-blocking, with wide variable-font ranges.
- **Add `/images/og-image.jpg`** (1200×630) — referenced site-wide for social
  cards (and the default piece-page OG image), still missing.
- **Firm up `src/build/seo.js`** — the `<head>` injection is regex-on-HTML and
  attribute-order-sensitive; pin it with tests or move to a parser.
- **Palette visual QA (follow-up to the colour centralisation).** The migration is
  behaviour-preserving for the default `woodland` palette — every token resolves to
  the original value — and tests + build are green, but it was **not** browser-
  verified in-session (no screenshot tooling). One intentional non-identical change:
  the masonry placeholder-tile gradient angle was normalised 160°→155° to match the
  flash/about/hero surfaces. Before relying on a palette swap, eyeball the
  image-less portfolio/flash/about placeholders and the homepage hero, and try
  `active: 'dusk'` to confirm a full recolour reads well.
- **Dev-tooling audit advisories.** `npm audit` flags moderate/critical issues in
  **Vite/Vitest only** — the dev server and test UI, which never ship to the static
  site — so they don't affect production. Clear them with a Vite 8 / Vitest 4 bump
  when convenient (a breaking major).
