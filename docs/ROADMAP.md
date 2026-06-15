# Beansprout — roadmap, go-live plan & backlog

**The single living document for Beansprout v2**: what's shipped, the **remaining
launch actions** (the working tick-list), the durable launch narrative (acceptance
test, cutover steps, rollback), and the **post-launch backlog** — including the
engineering-quality thread from the June 2026 benchmarking review. Update it as
items land; the tick-list below is the only place launch state is tracked.

Architecture lives in [`CLAUDE.md`](../CLAUDE.md); function/secret setup in
[`ENQUIRY-SETUP.md`](./ENQUIRY-SETUP.md), [`NEWSLETTER-SETUP.md`](./NEWSLETTER-SETUP.md)
and [`EMAIL-DOMAIN-SETUP.md`](./EMAIL-DOMAIN-SETUP.md); data compliance in
[`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md); the copy review (artist worksheet +
internal tracker, one doc) in [`COPY-REVIEW.md`](./COPY-REVIEW.md); image/video media
in [`MEDIA.md`](./MEDIA.md); motion in [`MOTION.md`](./MOTION.md); the **payments**
plan in [`PAYMENTS.md`](./PAYMENTS.md); and the post-launch feature stubs in
[`SCHEDULING.md`](./SCHEDULING.md), [`DASHBOARD.md`](./DASHBOARD.md) and
[`CMS.md`](./CMS.md).

Owners: 👤 **YOU** (external accounts / DNS / dashboards / sign-off) · 🛠 **CODE**
(done in-repo via PR — most need a value from you first).

## Status snapshot

**Verified against the codebase on 2026-06-15:** `npm test` fully green, CNAME absent
(staging posture intact), **54 portfolio photos in** (via the Dropbox media-sync
workflow), 12 flash pieces still placeholder.

Shipped (audience-capture + early management layer):

- **P0 hardening** — portfolio scroll-reveal fix, enquiry-upload XSS fix,
  dead-guard removal; vendor-agnostic analytics scaffold; persist-before-email
  for enquiries/flash; `clientIp` anti-spoof + request body/per-image size caps;
  skip-to-content links; branded 404.
- **Inline newsletter capture** on the homepage, flash, and post-enquiry pages.
- **Per-piece portfolio pages** at `/portfolio/<slug>/` (per-piece SEO + sitemap).
- **Responsive image pipeline + Dropbox media workflow** (#109, #189–#194) —
  `process-media.mjs` (sharp) emits AVIF/WebP/JPG tiers with a **centre cover-crop**; the
  **Dropbox media-sync** Action parses filename metadata (the `" -- "` grammar) into
  auto-written `pieces.js`/`flash.js` entries + a reject report. The catalogue is now
  **54 portfolio photos**. Tokens — styles plus the coarse `arm · body · leg` placements —
  live in **`src/data/taxonomy.js`** (the single source the renderers, data tests and the
  filename parser read); the **cybersigilism** chip is in. A hero-video helper
  (`process-video.mjs`) is ready, though the clips are still to come (C6). Full guide:
  [`MEDIA.md`](./MEDIA.md).
- **Data-driven testimonials** (`src/data/testimonials.js`).
- **Flash inventory state** — claims reserve the one-of-a-kind piece server-side
  (reject double-claims with 409); the grid reflects live availability.
- **Centralised colour palette** — every colour lives in one content file
  (`src/data/palette.js`); `src/build/palette.js` turns the **active** palette into
  CSS custom properties a build plugin injects into each page's `<head>`, so no CSS
  hard-codes a colour. Switch `active` to recolour the whole site; ships with
  `woodland` (the original look) and a `dusk` example. See `CLAUDE.md`.
- **Security headers (Tier 1)** — a build-time CSP + Referrer-Policy `<meta>` on every
  HTML page (`src/build/security.js` + the `securityHeaders` Vite plugin), and
  `nosniff` / `default-src 'none'` / `no-referrer` on every Worker JSON response.
  The clickjacking/HSTS gap a `<meta>` CSP can't close on Pages waits for the
  infrastructure consolidation (backlog).
- **GDPR retention/erasure (the one engineering launch blocker) — cleared.** Personal /
  special-category data lives in **D1**; a **12-month retention period** and a working
  **delete-by-email erasure path** exist as plain SQL, and the privacy page matches.
  Runbook + Time-Travel safety net: [`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md).
- **Backend stood up (Resend + Cloudflare)** — Resend key/domain/Audience, the Worker,
  and D1 are live with secrets in place. `FROM_EMAIL` / `ARTIST_EMAIL` deliberately hold
  the **staging/test** values until the cutover flips them (X4 below).
- **Artist copy pass — Round 1** (#155) — the artist's reviewed words + the global
  tone/style/fact decisions applied site-wide: the three approved style categories
  (**fine line · high detail · realism**) wired through the portfolio taxonomy + the
  homepage cards; confirmed **pricing** (£80 / £120–£200 / £300 / £500), a **flat 50%
  deposit**, a **48h** reschedule window and a **one-year** touch-up; the hours /
  getting-here / booking-lead-time facts followed in #179. The reviewed-section
  `ARTIST-COPY` markers are flipped + stripped; the live count of remaining markers is
  the gate command in [§A below](#a-content--copy-sign-off--supply-values---i-apply).
- **Lint floor** — **Biome** (`npm run lint`, `biome.json`, its own CI job). The
  **formatter is deliberately off** (the hand column-alignment is a feature);
  `useIterableCallbackReturn` is off as idiomatic. There is no `npm run format`.
- **June 2026 code review + hardening** — both workspaces audited; launch-path fixes
  (flash `piece_id` required, manifest price in claim emails, newsletter body cap,
  reduced-motion sticky-CTA, lightbox full-size/modified-click fixes) and the payments
  webhook/hold lifecycle hardening (migration `0003`) shipped with tests.

Deploys to **staging only** (GitHub Pages + the Cloudflare Worker; the always-on
staging preview is Cloudflare Pages building `develop`). The apex `beansprout.ink`
stays on **v1** until the cutover (D below) — see the deploy guardrail in `CLAUDE.md`.

> **Why Cloudflare, not Netlify:** Netlify's free tier pauses the whole project on a
> monthly **credit limit** (it took the staging functions down), so the functions were
> ported to one Cloudflare Worker and personal data moved to **D1** — which also
> delivers the compliance-manageable store (erasure/retention are plain SQL).

---

# Remaining launch actions (the tick-list)

> The two hard blockers: **GDPR** ✅ cleared (above); **real copy + images** ⏳ — the
> bulk of section A. Everything else is operational wiring, mostly done.

## A. Content & copy sign-off  (👤 supply values → 🛠 I apply)

The gate for copy is one command reaching zero:
`grep -rn "pending approval" apps/web/ --exclude-dir=dist --exclude-dir=node_modules`
(run it for the live figure — it isn't baked anywhere else). The artist fills in the
worksheet half of [`COPY-REVIEW.md`](./COPY-REVIEW.md); each answer is applied to
source and its `ARTIST-COPY · <REF>` marker flipped, then stripped before cutover.

- [~] **C1 · Copy approval (umbrella)** — **Round 1 + follow-ups applied & cleaned:**
      the reviewed words + tone/style/fact decisions (#155, #179), plus **newsletter,
      visit, portfolio and the small pages are now confirmed** — their markers (incl.
      reply time, and the enquiry-received "we→I" fix) are stripped, and the **404 was
      reworked** (real brand mark + de-cheesed copy); and the **portfolio piece data is
      fully confirmed** (PORT-D1/D2 — incl. the original set's styles, signed off 2026-06-15).
      **Remaining (the gate above, ~17):** the **flash** page + data (FLASH-01/03/04/05,
      FLASH-D1/D2),
      **ENQ-06/07**, **PRIV/TERMS** legal, and the off/optional slots (ABOUT-04 stats,
      HOME-08/10, DATA-MEDIA/TEST).
- [x] **C2 · Services prices** — ✅ confirmed + applied (#155): **£80 / £120–£200 /
      £300 / £500**, flat 50% deposit, 48h reschedule, one-year touch-up; the
      `/enquire/` budget bands mirror them.
- [~] **C3 · Terms/privacy effective date + legal review** — deposit figures match
      `/services/`, the **effective date is approved** ("June 2026"), and the **CCR 2013
      deposit/cancellation wording was clarified** (#204). **Open:** the **ICO public
      registration reference** (ZA###### — the account/cert number must never be
      published), the **tattoo-registration number** (TBC), and a professional review.
- [ ] **C4 · Flash art + copy** — all **12** pieces in `flash.js` are `img: null`
      (line-art glyphs; titles/specs/prices placeholder). 👤 supply photos + real copy
      → 🛠 add to `flash.js` + `public/images/flash/`.
- [ ] **C5 · og-image.jpg** — a branded **placeholder** is committed so cards/JSON-LD
      don't 404. 👤 supply a real **1200×630** photo → 🛠 swap
      `public/images/og-image.jpg`.
- [ ] **C6 · Hero video / GIF** — both slots in `media.js` are `show: false`. 👤 supply
      clip/GIF → 🛠 run `process-video.mjs`, flip `show: true`, LFS the binaries.
- [x] **C7 · Brand logo + confirmation icon** — ✅ the supplied artwork is traced to a
      true vector (`src/build/favicon.js`) and injected at build via the
      `<!-- brand:mark -->` marker: every nav now carries the mark (icon-only — the
      `.nav-logo` styles are ready if a wordmark is added later), and
      `/enquiry-received/` the moss confirmation mark (palette-driven, like the
      generated `favicon.svg`).
- [x] **C8 · Portfolio spot-check** — ✅ passed: the **54** real photos were eyeballed on
      staging and signed off as good to go live.
- [ ] **C9 · (Optional) Testimonials** — "Kind words" is `hidden` while empty. Add real
      quotes to `testimonials.js` + remove `hidden`. **Fine to launch without.**

## B. Operational wiring  (👤 YOU) — safe before cutover (no A/CNAME changes)

- [~] **O1 · Wire the inbox** (`EMAIL-DOMAIN-SETUP.md`) — **receive side ✅ done:**
      ImprovMX live, `hello@`/`roxy@` → the artist's Gmail, DMARC TXT in at GoDaddy, a
      real test email landed. **One item left (send side):** Gmail **"Send mail as"**
      `roxy@beansprout.ink` via Resend SMTP (`smtp.resend.com`, port 465/587, user
      `resend`, pass = `RESEND_API_KEY`) so manual replies stay DKIM-aligned.
- [x] **O2 · Build-time Worker URLs** — ✅ the three repo Actions **Variables**
      (`VITE_*_FN_URL`) are set. *(Mirror them in the Cloudflare Pages project's env if
      the `*.pages.dev` URL is used for verification.)*
- [x] **O3 · GitHub Pages enabled** — ✅ Source = GitHub Actions; no `CNAME`, so it
      serves only on `*.github.io` until the deliberate cutover.

## C. Verify on staging  (👤 + 🛠) — before *any* apex change

- [x] **O4 · End-to-end email test (staging run "a")** — ✅ verified 2026-06-08 on
      `beanstalk-e61.pages.dev`: enquiry → inbox with photos attached, reply-path
      `Reply-To` = the enquirer, flash claim reserved + re-claim blocked, newsletter
      contact subscribed, staging SPF/DKIM/DMARC pass. *(The production run "b" is X7.)*
- [x] **O5 · Erasure runbook dry-run** — ✅ done 2026-06-08 (access `SELECT` + prune
      preview against D1). *Residual (👤, not a blocker): a quarterly prune reminder.*
- [~] **O6 · Console clean** — largely covered by days of stable staging; to close,
      glance at the dev-tools console on home / portfolio / enquire (zero errors) and
      confirm the nav status light renders. (On staging, `robots.txt` = `Disallow: /`
      with no sitemap — expected, not a bug.)
- [x] **O7 · Media-input dry run (Dropbox → site, real input)** — ✅ **confirmed working
      end-to-end:** the Dropbox → filename-parse → tiers + auto-written data → PR →
      staging path was used to upload the live **54-piece catalogue** (#192–#194). The
      artist can publish a piece unaided beyond the [`MEDIA.md`](./MEDIA.md) guide.

### The end-to-end email test (go-live acceptance — run "b" at cutover)

Repeatable test of the full round-trip, against `https://beansprout.ink` with the
production secrets (`FROM_EMAIL=roxy@beansprout.ink`, `ARTIST_EMAIL` = the artist's
Gmail). All six must pass before the launch is "done":

1. **Enquiry → inbox.** Submit `/enquire/` with 1–2 photos → land on
   `/enquiry-received/`; a "New enquiry — …" email reaches `ARTIST_EMAIL`, photos
   attached, fields laid out.
2. **Reply path.** Hit **Reply** — the `To:` is the *enquirer's* address. Send it;
   confirm it arrives. (Replies go out as `roxy@beansprout.ink` via Gmail "Send mail
   as" — `EMAIL-DOMAIN-SETUP.md`.)
3. **Flash claim → inbox.** Claim a piece → a "Flash claim — …" email arrives; reload
   the grid → the piece reads claimed; a second claim is rejected (409).
4. **Newsletter → Audience.** Sign up → the contact appears in the Resend Audience and
   a row lands in `newsletter_consent`.
5. **Source-of-truth (independent of mail).** D1 console:
   `SELECT id, kind, email, email_status FROM submissions ORDER BY received_at DESC;`
   — each test submission present with `email_status = 'sent'` (persist-before-email
   isolates *send* from *deliver*). A `'failed'` row → `wrangler tail` shows the Resend
   response (usually an unverified domain or bad key).
6. **Deliverability.** The email lands in the **inbox, not spam**, and Gmail → "Show
   original" shows `SPF`/`DKIM`/`DMARC` all **PASS**. If it spams, re-check the Resend
   domain verification + DMARC (`EMAIL-DOMAIN-SETUP.md`).

## D. The apex cutover — LAST, only after A–C are green  (👤 + 🛠)

Moves `beansprout.ink` from **v1 → v2**. Two test→prod flips happen together (DNS +
email). **X2 (re-add CNAME) only at cutover** — never earlier, or Pages claims the
apex off v1 (the guardrail in `CLAUDE.md`).

- [ ] **X1 · A day ahead: lower apex DNS TTL to 300 s** (👤 GoDaddy) on the apex `A` /
      `www` `CNAME` — so cutover *and* rollback propagate in minutes. Raise back after.
- [ ] **X2 · Re-add `apps/web/public/CNAME` = `beansprout.ink`** (🛠), let Pages deploy.
- [ ] **X3 · Point DNS at GitHub Pages** (👤 GoDaddy) — apex `A` → Pages IPs + `www`
      `CNAME` → `<user>.github.io`. *This is what moves traffic off v1.*
- [ ] **X4 · Flip Worker email secrets test → prod** (👤): `FROM_EMAIL` →
      `roxy@beansprout.ink`, `ARTIST_EMAIL` → the artist's Gmail. Needs
      `beansprout.ink` verified in Resend. Saving redeploys the Worker.
- [ ] **X5 · Add `beansprout.ink` as the verified custom domain** in Pages settings;
      enable **Enforce HTTPS** once the cert provisions. 👤
- [ ] **X6 · Confirm the Worker CORS allowlist** includes the apex — it already does
      (`src/lib/http.js`); just verify.
- [ ] **X7 · Smoke-test the live apex** — the acceptance test above as production
      run "b", incl. deliverability.
- [ ] **X8 · Decommission/redirect v1** once v2 is healthy — keep v1 **idle, not
      deleted** for 1–2 weeks as the rollback target.

### Rollback plan (if the cutover goes wrong)

Every step is reversible; with the TTL pre-lowered a revert is minutes. Roll back the
moment the live apex is broken rather than debugging on the live domain:

1. **DNS** — restore the apex `A` / `www` `CNAME` to the **v1** target (this moves
   traffic back; do it first).
2. **Email** — flip the Worker secrets back to test only if production sending is
   what's broken.
3. **Pages** — remove `apps/web/public/CNAME` (revert the commit) so Pages stops
   claiming the apex.
4. **Data is safe** — D1 is untouched by a DNS rollback; enquiries from the live
   window are persisted (Time Travel covers operator error — `DATA-COMPLIANCE.md`).

## Ordering (the only constraints)

```
A content + B wiring  (parallel)
        └─► C verify on staging ─► D apex cutover (dead last)
```

## Launch decisions — settled (both deferred to post-launch)

- **Payments — NOT live at launch.** Deposits requested by email; the Worker backbone
  stays dark behind `PAYMENTS_ENABLED`; the embedded Payment Element frontend + account
  setup are the post-launch item ([`PAYMENTS.md`](./PAYMENTS.md)). The engine decision
  (**Stripe → Monzo Business**) is settled — it's what shipped.
- **Analytics — NOT live at launch.** **Plausible**, post-launch (cookieless, no
  banner; the read-only shared link is the artist's view). GA4 is out. The `track()`
  scaffold no-ops until wired, so the site is launch-legal without it
  ([`ANALYTICS.md`](./ANALYTICS.md)).

---

# Backlog (post-launch — extends past go-live)

Everything that outlives the launch, in rough priority order. None of it blocks the
apex cutover.

## Delivery sequence (the dependencies between the in-flight features)

The per-feature decisions live in the stubs ([`PAYMENTS.md`](./PAYMENTS.md),
[`SCHEDULING.md`](./SCHEDULING.md), [`DASHBOARD.md`](./DASHBOARD.md),
[`CMS.md`](./CMS.md)); this is the ordering that keeps them shippable in turn.

```
Launch (D above)
  │
  ├─0. Quick wins (independent, front-load) ─ reduced-motion as a tested invariant +
  │     axe-core a11y in the Playwright tier · wire the analytics vendor
  │
  ├─1. /studio artist dashboard ──────────┐  (token-protected read/manage over D1:
  │      enquiry/claim status lifecycle +  │   the shared substrate the next three reuse)
  │      GDPR erasure UI)                   │
  │                                         ▼
  ├─2. Payments — Stripe checkout ──► 3. Scheduling (deposit = booking trigger;
  │      (flash full-pay first, then          co-ships with payments Phase 2)
  │       custom deposit via /studio)
  │
  ├─4. CMS (TinaCMS) ─ parallel track: POC first, then build-out
  │
  ├─5. Infrastructure consolidation (Cloudflare front + Tier-3 headers) ─ parallel;
  │      pairs with the CMS's git-backed Cloudflare stack; NOT entangled with the cutover
  │
  └─(ongoing) TypeScript incrementally · Turnstile spam layer · retargeting/Instagram
            (the last two unblock on the analytics/feed decisions)
```

**Why this order.** **(0)** raises the engineering floor cheaply and independently.
**(1) the dashboard is the load-bearing substrate** — the artist-facing enquiry/claim
view, payments reconciliation, the scheduling confirm step, and the GDPR erasure UI
are all the same token-protected D1 surface, built once and reused. **Recommended next
to scope:** with the payments backbone shipped, a thin `/studio` is the
highest-leverage next step. **(2) Payments** is the highest-value feature and its
Worker backbone is already built (shipped dark); its flash-frontend phase can ship
before `/studio`, its custom-deposit phase needs it. **(3) Scheduling** rides on the
deposit trigger. **(4) CMS** and **(5) infra consolidation** are independent parallel
tracks that pair naturally. **TypeScript** threads through all of it.

## P2 — booking/enquiry management

- **Artist dashboard** _(designed — [`DASHBOARD.md`](./DASHBOARD.md))._ A private,
  single-artist dashboard over the D1 data, Worker-served and access-gated: enquiry
  inbox with a status lifecycle, flash inventory, payments reconciliation, the GDPR
  delete-by-email tools, and the scheduling confirm queue. Built once, before the
  deposit/scheduling features that depend on it.
- **Online payments — integrated Stripe checkout** _(backbone **shipped dark**;
  embedded frontend + go-live config remain)._ Flash = full payment, custom = deposit
  only; one Stripe engine carries card + Klarna + PayPal, paying out to Monzo
  Business, embedded on-site (PCI SAQ-A), REST/no-SDK. **Remaining:** the embedded
  Payment Element frontend, the studio's account setup, a staging test-mode run; then
  custom deposits (tokenised link + `/studio` reconciliation), then refunds polish.
  Everything — model, spec, fees, runbook — in [`PAYMENTS.md`](./PAYMENTS.md).
- **Scheduling / appointment booking** _(planned — [`SCHEDULING.md`](./SCHEDULING.md))._
  A calendar layer over the flash claim (later the custom enquiry) so a booking moves
  toward a confirmed date. **Request/hold + manual confirm** — the human step exists
  because Beansprout is a guest artist at Tiny Knives and the chair time isn't owned by
  the site. Reuses the payments track's machinery, so the two co-ship (payments first).
- **GDPR management UI.** The SQL runbook covers launch; the post-launch step is a
  per-subject view, one-click erasure, and auto-retention (a `booked` flag + an audit
  log) — it lives in the dashboard above.

## P2 — content CMS for the artist _(decided, deferred — [`CMS.md`](./CMS.md))_

Let the artist manage **site content** herself (distinct from the dashboard, which
manages *enquiries/claims*). **TinaCMS** (git-backed — content + images stay in the
repo; email login via Tina Cloud free tier; publish = commit to `main` → the existing
Pages build). Chosen over Sanity (content moves off git) and Sveltia (GitHub-account
friction). First step is a POC. Colour/swatch pickers generate from
`src/data/palette.js` so the CMS can't drift off-brand.

## P2 — infrastructure consolidation (Cloudflare front + full security headers)

**Direction (decided — post-launch):** fold the site's host onto Cloudflare so the
stack lives in one place, instead of GitHub Pages (site) + Cloudflare Worker (API).
Unlocks real response headers on the HTML — HSTS, `frame-ancestors` (the clickjacking
defense Tier 1 can't give), COOP/CORP — plus one origin and one CORS story.
_Recommended route:_ **move the site to Cloudflare Pages** (git-backed, `_headers`
file; consistent with the TinaCMS plan). **Supersedes** "the canonical site is GitHub
Pages" in `CLAUDE.md` when undertaken — update `CLAUDE.md`, retire
`deploy-web.yml`, re-point the `VITE_*_FN_URL` wiring. Don't entangle it with the apex
cutover; ship on Pages first, consolidate once live and stable.

## Engineering quality & tooling

From the June 2026 benchmarking review (measured against `satnaing/astro-paper` and
`cloudflare/templates`, plus Core Web Vitals and OWASP upload guidance). The lint
floor from that review is **shipped** (see the status snapshot). Open items:

- **[High · a11y] Make `prefers-reduced-motion` a tested invariant.** Motion is the
  site's differentiator *and* its biggest a11y risk (smooth-scroll is a documented
  accessibility concern). _Delivery: a Playwright spec loading with
  `prefers-reduced-motion: reduce`, asserting GSAP/Lenis are inert and content is
  visible._ See [`MOTION.md`](./MOTION.md).
- **[Medium · a11y] Automated accessibility checks** — axe-core in the Playwright
  tier. _Delivery: an axe pass per key page in the E2E job._
- **[High] TypeScript, incrementally** — types would formalise the data→render field
  contracts the `data-integrity` tests assert by hand. Start at
  `apps/web/src/{data,build}` and the Worker. _Ongoing thread, not one PR._
- **[Medium] JS weight / Core Web Vitals budgets** — GSAP + Lenis ship on every page;
  audit per-page motion need and hold budgets (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1).
- **[Consider] Cloudflare Turnstile** as a defense-in-depth spam layer alongside the
  shipped honeypot + rate limiting. Cheap to add when form spam appears.
- **[Park] Astro migration** at a future v3 / major-refresh inflection — *not now*.
  Astro would absorb sitemap/SEO/OG/content-collections, shrinking the bespoke surface
  to the motion layer; the Worker stays as-is. The test net is what makes it safe to
  revisit.

**Standing strengths to protect (don't regress):** the security backbone (magic-byte
sniffing, rate limiting, atomic reservation, fail-open D1, CORS allowlist) is ahead of
the field; the two-workspace test suite + Playwright tier is what makes refactors safe
(no doc bakes the count — `npm test` is the live figure); the 7-plugin bespoke Vite
build is a known bus-factor-of-one liability — keep it well-documented; View
Transitions keep their graceful no-VT fallback; hold the `ROUTES` + sitemap discipline
as indexable pages are added.

## P1 leftovers (decision-blocked)

- **Retargeting pixel** (Meta/TikTok) — a marketing cookie that **forces a consent
  banner**; parked behind that deliberate call (default: stay banner-free). See
  [`ANALYTICS.md`](./ANALYTICS.md).
- **Instagram feed embed** — recommended as a **build-time static snapshot** (no
  token, no third-party cookies, no banner), reusing the `process-media.mjs` +
  data-file pattern. See [`ANALYTICS.md`](./ANALYTICS.md).

## P3 — polish

- **Scrub the artist's personal email from git history** _(deferred, not urgent)._ It
  lives only as a Worker secret now but exists in earlier commits of this public repo.
  Needs a **local** `git filter-repo` rewrite + coordinated force-push (can't be done
  from a web session — the git proxy rejects history rewrites) — or treat the address
  as exposed and rotate the inbox.
- **Self-host + subset the fonts** (LCP + EU-privacy) — currently the Google Fonts
  CDN, render-blocking.
- **Firm up `src/build/seo.js`** — the `<head>` injection is regex-on-HTML and
  attribute-order-sensitive; pin it with tests or move to a parser.
- **Palette visual QA.** The colour centralisation was behaviour-preserving for
  `woodland` but not browser-verified in-session; before relying on a palette swap,
  eyeball the image-less placeholders and the homepage hero, and try `active: 'dusk'`.
