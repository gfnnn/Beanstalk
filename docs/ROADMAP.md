# Beansprout — roadmap & go-live plan

The single living document for Beansprout v2: **what's shipped**, the **sequenced
path to launch** (the go-live plan), and the **post-launch backlog** that extends
past it. Update it as items land. Architecture lives in [`CLAUDE.md`](../CLAUDE.md);
function/secret setup in [`ENQUIRY-SETUP.md`](./ENQUIRY-SETUP.md),
[`NEWSLETTER-SETUP.md`](./NEWSLETTER-SETUP.md) and
[`EMAIL-DOMAIN-SETUP.md`](./EMAIL-DOMAIN-SETUP.md); data compliance in
[`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md); the content-CMS plan in
[`CMS.md`](./CMS.md); image/video media in [`MEDIA.md`](./MEDIA.md); the **payments**
plan — model, architecture, build spec, fees, and the operator runbook, in one doc — in
[`PAYMENTS.md`](./PAYMENTS.md); scheduling in
[`SCHEDULING.md`](./SCHEDULING.md); and engineering benchmarking takeaways in
[`ENGINEERING-LEARNINGS.md`](./ENGINEERING-LEARNINGS.md).

The work was derived from a platform evaluation (senior-dev / artist / marketer /
customer lenses) plus a review of the setup docs, the privacy page, and the function
code. The go-live plan separates **what only you can do** (external accounts, DNS,
dashboards, content sign-off — marked 👤 **YOU**) from **what is code work** (marked
🛠 **CODE**, doable in this repo via PR).

## Status snapshot

Shipped (audience-capture + early management layer):

- **P0 hardening** — portfolio scroll-reveal fix, enquiry-upload XSS fix,
  dead-guard removal; vendor-agnostic analytics scaffold; persist-before-email
  for enquiries/flash; `clientIp` anti-spoof + request body/per-image size caps;
  skip-to-content links; branded 404.
- **Inline newsletter capture** on the homepage, flash, and post-enquiry pages.
- **Per-piece portfolio pages** at `/portfolio/<slug>/` (per-piece SEO + sitemap).
- **Responsive image pipeline** (#109) — `apps/web/scripts/process-media.mjs` (sharp)
  emits AVIF/WebP/JPG tiers with a **centre cover-crop** to the lane aspect (masters are
  pre-framed by the artist before upload). The catalogue is the artist's **28 pre-edited
  pieces** — an earlier unedited batch, added to trial an automated subject-detection crop
  that has since been removed, was dropped along with that feature. The style taxonomy is
  real execution styles (`fine-line · high-detail · realism · black-grey · colour ·
  dotwork · script · cybersigilism`). A hero-video helper (`process-video.mjs`) is in too, though the clips
  themselves are deferred (Phase 4). Full guide: [`MEDIA.md`](./MEDIA.md).
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
  (`src/build/html.js`), `EMAIL_RE` in the worker's `src/lib/http.js`, and a
  sticky-shadow helper (`src/js/modules/sticky.js`) replace 2–3 copies each; the
  enquiry image-preview object-URL leak is fixed.
- **Security headers (Tier 1)** — a build-time CSP + Referrer-Policy `<meta>` on every
  HTML page (`src/build/security.js` + the `securityHeaders` Vite plugin), and
  `nosniff` / `default-src 'none'` / `no-referrer` on every Worker JSON response
  (`SECURITY_HEADERS` in `src/lib/http.js`). The clickjacking/HSTS gap that a `<meta>`
  CSP can't close on Pages is tracked under infrastructure consolidation (Tier 3).
- **Artist copy pass — Round 1** (#155) — the artist's reviewed words + the global
  tone/style/fact decisions applied site-wide: the three approved style categories
  (**fine line · high detail · realism**) wired through the portfolio taxonomy + the homepage
  "What I do" cards; confirmed **pricing** (£80 / £120–£200 / £300 / £500), a **flat 50%
  deposit**, a **48h** reschedule window and a **one-year** touch-up; "custom"→"bespoke" and
  the botanical/illustrative wording removed; em dashes stripped from visible copy; the About
  **stats** + **"The space"** modules switched off for go-live. The reviewed-section
  `ARTIST-COPY` markers have since been flipped + stripped; the live count of remaining
  markers is the §A gate in [`GO-LIVE.md`](./GO-LIVE.md) (tracked there only).

Deploys to **staging only** (GitHub Pages + the Cloudflare Worker). The apex
`beansprout.ink` stays on **v1** until the go-live plan below clears — see the deploy
guardrail in `CLAUDE.md`.

> **Backend migrated off Netlify → Cloudflare (Workers + D1).** Netlify's free tier
> now pauses the whole project on a monthly **credit limit** (it took the staging
> functions down), so the three functions were ported to one Cloudflare Worker and
> personal data moved to **D1 (SQLite)** — which also delivers the "proper,
> compliance-manageable store" we wanted (erasure/retention are now plain SQL).

---

# Go-live plan (staging → apex)

> **Working the launch?** [`GO-LIVE.md`](./GO-LIVE.md) is the short, **codebase-verified
> tick-list of only the remaining actions** — the surface to work through, item by item.
> The phases below are the *narrative* (why/how, the acceptance test, the rollback plan);
> keep the two in sync when an item lands.

A step-by-step path to take this repo from **staging** (GitHub Pages + the Cloudflare
Worker) to **live on the apex `beansprout.ink`**, replacing the v1 site. The phases
are parallelisable except for the ordering called out below.

> **Guardrail (from `CLAUDE.md`):** `beansprout.ink` is intentionally still served
> by **v1** (`gfnnn/beansprout`). Nothing in Phases 1–5 points the apex at v2.
> The apex cutover is **Phase 6** and is deliberately last.

## The only hard blockers

Two things gate the apex cutover:

1. **GDPR retention/erasure** — **✅ cleared (MVP).** Personal / special-category
   data (allergies, DOB) lives in the `submissions` / `newsletter_consent` **D1
   tables**; a concrete **12-month retention period** and a working **delete-by-email
   erasure path** exist as plain SQL (`docs/DATA-COMPLIANCE.md`), and the privacy
   page matches. Built in **Phase 1** — this was the one real engineering blocker,
   and it's done.
2. **Real copy + images.** Largely done (#53, #109; **28 portfolio pieces** with real
   photos on a responsive pipeline). The **12 flash pieces are still placeholder art**
   (line-art glyphs, no flash photos yet); the hero video/GIF and a real og-image are the
   other open items — all listed in **Phase 4**.

With the engineering blocker cleared, the route to live is now **operational**: stand
up the backend (Phase 2), wire the inbox (Phase 3), sign off content (Phase 4), verify
on staging (Phase 5), then cut the apex over (Phase 6).

## Phase 0 — Decisions to make first (👤 YOU)

These unblock later phases. None require code to decide.

- [x] **Where the artist reads mail** — confirmed and set as the `ARTIST_EMAIL`
      Worker secret (the artist's Gmail, kept out of the repo; where
      `@beansprout.ink` forwards). See `EMAIL-DOMAIN-SETUP.md`.
- [x] **DNS access** — confirmed (GoDaddy, for `beansprout.ink`).
- [x] **Analytics — not live at launch** (decided) — **Plausible**, deferred to post-launch (cookieless, no consent
      banner; the read-only **shared link** is the non-technical "foolproof view" for the
      artist). GA4 is out (needs a banner + is unusable raw by a
      non-tech artist). The `track()` scaffold (`src/js/modules/analytics.js`) no-ops until
      one is wired, so the site is launch-legal without it. Full rationale, wiring, and the
      Instagram-feed + retargeting calls in [`ANALYTICS.md`](./ANALYTICS.md).
- [x] **Online payments / deposits — not live at launch** (decided) — launch with the deposit
      **requested by email**; the **Worker backbone stays dark** behind `PAYMENTS_ENABLED`
      (flash full-payment via an embedded Stripe **Payment Element** → Monzo Business payout,
      Klarna via Stripe; custom = deposit only; PayPal timing TBD). The **step-4 frontend +
      go-live config** are a **post-launch** item (see [`PAYMENTS.md`](./PAYMENTS.md)).
      The load-bearing engine decision (**Stripe → Monzo Business**) is settled — it's what shipped.

Two further decisions gate **post-launch** work only (not the launch itself) and live
with their Backlog items below: the **Instagram-feed mechanism** (static snapshot /
third-party widget / Graph API) and **where the artist-facing view lives** (P2).

## Phase 1 — Engineering go-live blocker: GDPR erasure ✅ DONE (🛠 CODE)

**Decision taken: (b) the minimal offline runbook** — least surface area now, with
the strategic plan to move data into a dedicated secure store post-launch (see
`docs/DATA-COMPLIANCE.md`). Built and shipped:

- [x] **Erasure (delete-by-email)** + **access (select-by-email)** + **retention
      prune** as plain SQL via `wrangler d1 execute` (no public endpoint = no new
      attack surface). Personal data lives in **Cloudflare D1**, so these are one
      query each; full runbook in `docs/DATA-COMPLIANCE.md`.
- [x] **Retention window** defined at **12 months**, matching the privacy page.
      Pruned manually on a quarterly reminder.
- [x] **Privacy page reconciled** — already states the 12-month retention and the
      one-month response window; no change needed.

👤 **Remaining (you):** after Phase 2 (the Worker + D1 are live), run one dry-run
(an access `SELECT` + the prune preview) so the runbook is proven before a real
request, and set a quarterly prune reminder.

## Pre-launch hardening — security headers, Tier 1 ✅ DONE (🛠 CODE)

The security headers that **are** achievable on the current split deploy (static HTML on
GitHub Pages + the JSON Worker). Built and shipped — both layers below are in code with
tests; verified against a production build (`npm run build`) and preview.

- [x] **Site CSP + Referrer-Policy via a Vite head plugin.** A dedicated plugin
      (`securityHeaders`) in `apps/web/vite.config.js` injects
      `<meta http-equiv="Content-Security-Policy">` and
      `<meta name="referrer" content="strict-origin-when-cross-origin">` into every
      page's `<head>` — including the generated per-piece pages (handed the same string
      via `renderPiecePage`). Policy + rationale live in `apps/web/src/build/security.js`.
      `connect-src` is pinned to the `*.workers.dev` Worker origin (derived from the
      `VITE_*_FN_URL` vars, falling back to the `config.js` default); `fonts.googleapis.com`
      / `fonts.gstatic.com` are allowed until the fonts are self-hosted (P3), then tighten.
      **Build/preview only** (`apply: 'build'`) — a strict CSP breaks the dev HMR client.
- [x] **Security headers on the Worker's JSON responses.** `SECURITY_HEADERS` in
      `apps/functions/src/lib/http.js` (`X-Content-Type-Options: nosniff`,
      `Content-Security-Policy: default-src 'none'`, `Referrer-Policy: no-referrer`) is
      spread into every `replyWith()` reply and the Worker's 404. CORS still wins where
      it overlaps.

> **What Tier 1 can't cover (a real GitHub Pages limit).** A `<meta>` CSP can't set
> `frame-ancestors`, and `X-Frame-Options` / `Strict-Transport-Security` /
> `X-Content-Type-Options` are ignored as meta tags — so **clickjacking defense on
> the HTML pages isn't achievable on Pages**. (HSTS you partly get for free once
> **Enforce HTTPS** is on in Phase 6.) Closing that gap needs a layer that owns the
> responses — see *infrastructure consolidation* in the Backlog (Tier 3).

## Phase 2 — Stand up the backend (Resend + Cloudflare) ✅ DONE (👤 YOU)

**Confirmed done (June 2026):** Resend account + API key, sending domain, and Audience
are all set up; Cloudflare account, the Worker, and D1 are deployed with secrets in
place. The **only** Phase-2-adjacent item left is the **test → production email flip**
(`FROM_EMAIL` / `ARTIST_EMAIL`), which is deliberately deferred to the **Phase 6 cutover**
(the secrets currently hold the staging/test sender + inbox). Follow `docs/ENQUIRY-SETUP.md`
and `docs/NEWSLETTER-SETUP.md` for reference.

- [x] **Resend account** — API key (`re_…`) created. *(ENQUIRY-SETUP Part A)*
- [x] **Verify the sending domain** in Resend — Resend's DNS records (MX/TXT/DKIM on the
      `send.` subdomain) added at GoDaddy and verified. *(ENQUIRY-SETUP Part A; EMAIL-DOMAIN-SETUP)*
- [x] **Create a Resend Audience** (newsletter) — Audience ID copied.
      *(NEWSLETTER-SETUP step 1)*
- [x] **Cloudflare account + Worker** — `wrangler d1 create` / `migrations apply` /
      `deploy` done; the Worker is live. *(ENQUIRY-SETUP Part B)*
- [x] **Set Worker secrets** (`wrangler secret put <NAME>`) — set. `FROM_EMAIL` /
      `ARTIST_EMAIL` currently hold the **test** values (`onboarding@resend.dev` and
      the developer's own inbox, used for staging email tests); they flip to
      production at Phase 6.
      | Key | Value |
      |---|---|
      | `RESEND_API_KEY` | the `re_…` key |
      | `ARTIST_EMAIL` | the artist's Gmail (production, set as a secret; test = the developer's own inbox) |
      | `FROM_EMAIL` | `roxy@beansprout.ink` (production; test = `onboarding@resend.dev`) |
      | `RESEND_AUDIENCE_ID` | the Audience ID |
      | `RATE_*` | *(optional vars — defaults are sane)* |
- [x] **Note the Worker URL** — `https://beansprout-forms.<subdomain>.workers.dev/`
      (routes: `/enquiry`, `/newsletter`, `/flash-status`).

> **Why Cloudflare, not Netlify:** the previous host paused the whole project when a
> monthly **credit limit** was hit (taking the live forms down). Cloudflare's free
> Workers + D1 tiers have no credit-pause model, so the forms can't go dark that way.

## Phase 3 — Wire the inbox (email forwarding) (👤 YOU)

So `hello@` / `roxy@beansprout.ink` actually **receive**, and the artist can reply *as*
the domain. Full detail in `docs/EMAIL-DOMAIN-SETUP.md`. This uses **MX/TXT** only
and does **not** touch the website's A/CNAME — so it's safe to do before cutover.

- [x] **ImprovMX** (free) — ✅ live; `hello@` / `roxy@` aliases → the artist's Gmail
      (see GO-LIVE O1 for the verified detail).
- [x] **GoDaddy DNS** — ✅ ImprovMX MX + SPF TXT in (no `*.secureserver.net` default
      MX existed). Nameservers stay on GoDaddy.
- [x] **One SPF record only** at `@`.
- [x] **Add a DMARC record** at `_dmarc` (`p=none`) — ✅ in at GoDaddy.
- [ ] **Gmail "Send mail as"** `roxy@beansprout.ink` **via Resend SMTP**
      (`smtp.resend.com`, port 465/587, user `resend`, pass = `RESEND_API_KEY`) so
      manual replies stay DKIM-aligned and don't land in spam. **The one O1 item left.**
- [x] **Test:** email `hello@beansprout.ink` → ✅ landed in the artist's Gmail.

## Phase 4 — Content sign-off (👤 YOU, with 🛠 CODE to apply edits)

Content is mostly in, but a few items need your confirmation before launch.
(Edits land via PR — give me the values and I'll wire them.)

### Copy sign-off — the review loop (the artist)

**Goal:** every word that reads as the artist speaking is *theirs*, not a placeholder
drafted for them. The mechanism, end to end:

1. **The artist reads the site in a browser.** Use the always-on **Cloudflare Pages
   staging URL** (the `*.pages.dev` built from `develop`), or a local
   `npm run preview:branch -- <branch>` (fetches a branch + serves it at
   `localhost:5173`). They see every page's copy **in context**, as a visitor
   would — the designed draft copy stays live precisely so they can react to it.
2. **They fill in their words in [`docs/COPY-FOR-ARTIST.md`](./COPY-FOR-ARTIST.md).**
   That worksheet is the artist-facing companion to the internal tracker
   ([`COPY-REVIEW.md`](./COPY-REVIEW.md)): one plain-English entry per copy slot,
   each saying **what the copy is for**, a **simple example**, and a blank for
   **their words** — so they're guided, not staring at an empty page. Facts I need
   from them (prices, hours, dates) are marked 🔒.
3. **🛠 I apply their edits to source** — the data files (`src/data/*.js`) and the
   page HTML — then flip each block's marker `ARTIST-COPY · <REF> · pending approval`
   → `approved`. The gate `grep -rn "pending approval" apps/web/` reaching zero
   means the copy pass is done.
4. **Strip the markers before cutover.** The `ARTIST-COPY` comments are a staging
   review aid and ship into page source; clear them as part of this phase so the
   apex (Phase 6) carries none. See the convention note in `COPY-REVIEW.md`.

- [~] **Artist copy review** — **Round 1 done, applied + cleaned (#155):** the artist reviewed
      the checklist **up to enquiries** plus the global tone/style/fact decisions; those words
      are in source and **those sections' markers are flipped + stripped.** **Remaining:** the
      still-pending sections (ABOUT-04 stats, the visit/enquire *voice* lines — the hours,
      getting-here and lead-time *facts* were confirmed in #179 — reply time, flash
      names/photos, portfolio piece names, newsletter, enquiry-received voice, privacy/terms
      legal). The live marker count is the §A gate in `GO-LIVE.md`. The specific value-only
      items below are called out separately because they also gate other things (legal,
      pricing parity).

### Specific items (also tracked above)

- [x] **Services prices** — ✅ confirmed + applied (#155): **£80 / £120–£200 / £300 / £500**
      (min / small / half-day / full-day), a **flat 50% deposit**, **48h** reschedule and a
      **one-year** touch-up; the deposit box was reworked and the `/enquire/` budget bands mirror them.
- [~] **Terms & privacy effective date + legal review** — deposit figures now match `/services/`
      (flat 50%) and the **effective date is approved** ("June 2026"). **Open:** the **ICO public
      registration reference** (ZA###### — held until confirmed; the account/cert number must
      never be published), the **tattoo-registration number** (TBC), and a professional review of
      the wording. 👤 → 🛠 apply.
- [ ] **`og-image.jpg` (1200×630)** — used site-wide for social cards, the default
      piece-page OG image, **and the homepage JSON-LD `image`**. A **branded placeholder**
      is now committed so link previews and the `Person` schema don't point at a 404;
      **replace with a real 1200×630 photo before launch.** 👤 supply →
      🛠 swap `apps/web/public/images/og-image.jpg`.
- [ ] **Portfolio / flash spot-check** — **28 portfolio pieces** carry real photos;
      eyeball them on the built site. The **12 flash pieces are still placeholder art**
      (`img: null` → line-art glyphs; titles/specs/prices are placeholders too) — add real
      flash photos + copy to `src/data/flash.js` and files to
      `apps/web/public/images/flash/` before launch.
- [ ] **Hero video / GIF** — the homepage + About hero slots (`src/data/media.js`) are
      `show:false` (placeholder). An ffmpeg helper (`apps/web/scripts/process-video.mjs`)
      is ready. 👤 supply the clip/GIF → 🛠 process, flip `show:true`, LFS the binaries.
- [ ] **Brand logo & icon artwork** — the nav still shows a `logo.svg` text placeholder
      and the `/enquiry-received/` confirmation badge shows an `icon` text placeholder
      (the old 🌱 emoji was removed from both the badge and the "Send my enquiry" button).
      👤 supply the final logo/icon files → 🛠 wire them into the nav (`.nav-logo-placeholder`)
      and the confirmation mark (`.confirm-mark`).
- [ ] *(Optional)* **Testimonials** — the "Kind words" homepage block is `hidden`
      while empty. Add real quotes to `src/data/testimonials.js` and remove `hidden`
      to switch it on. Fine to launch without.

## Phase 5 — End-to-end verification on staging (👤 YOU + 🛠 CODE)

Do this on the Pages project URL **before** any apex change. The fastest loop is
**local** (`wrangler dev` + `npm run dev`), which needs no cloud at all
(`ENQUIRY-SETUP.md` Part D).

- [x] **Set the build-time Worker URLs.** ✅ done — the three repo Actions **Variables**
      (`VITE_ENQUIRY_FN_URL`, `VITE_NEWSLETTER_FN_URL`, `VITE_FLASH_STATUS_FN_URL`) are
      set (GO-LIVE O2). 👤
- [x] **Enable GitHub Pages** — ✅ done; Source = **GitHub Actions**, no `CNAME`, so it
      serves only on the `*.github.io` URL until the deliberate cutover (GO-LIVE O3). 👤
- [x] **End-to-end email test** — ✅ staging run "a" verified 2026-06-08 on
      `beanstalk-e61.pages.dev` (GO-LIVE O4); the production run "b" repeats at Phase 6. 👤
- [x] **Erasure runbook dry-run** — ✅ done 2026-06-08 (access `SELECT` + prune preview
      against D1; GO-LIVE O5). 👤
- [~] **Console clean** — largely covered by days of stable staging; a formal dev-tools
      glance on home/portfolio/enquire remains (GO-LIVE O6). 👤

### End-to-end email test (go-live acceptance)

A repeatable test of the **full email round-trip**. Run it twice:
- **(a) Staging** — `FROM_EMAIL=onboarding@resend.dev`, with `ARTIST_EMAIL` set to the developer's own inbox
  (Resend's test sender only delivers to the Resend-account owner).
- **(b) Production** — after the Phase 6 email switch-over, repeat against
  `https://beansprout.ink` with `FROM_EMAIL=roxy@beansprout.ink` and the production
  `ARTIST_EMAIL` (the artist's Gmail).

Both runs must pass before the launch is "done":

1. **Enquiry → inbox.** Submit `/enquire/` with 1–2 photos → land on
   `/enquiry-received/`. Within seconds a "New enquiry — …" email reaches
   `ARTIST_EMAIL`, **photos attached**, fields laid out.
2. **Reply path.** Hit **Reply** — the `To:` is the *enquirer's* address (the form's
   `reply_to`), not the Worker. Send it; confirm it reaches the address you entered.
   *(Production: replies go out as `roxy@beansprout.ink` via Gmail "Send mail as" —
   `EMAIL-DOMAIN-SETUP.md` Step 2.)*
3. **Flash claim → inbox.** Claim a `/flash/` piece → a "Flash claim — …" email
   arrives; reload the grid → the piece reads claimed; a second claim is rejected (409).
4. **Newsletter → Audience.** Sign up at `/newsletter/` → the contact appears in the
   Resend Audience and a row lands in the `newsletter_consent` D1 table.
5. **Source-of-truth (independent of mail).** D1 console:
   `SELECT id, kind, email, email_status FROM submissions ORDER BY received_at DESC;`
   — each test submission is present with `email_status = 'sent'` (persist-before-email
   means the row exists even if delivery fails — so this isolates *send* from *deliver*).
6. **Deliverability (production run only).** Confirm the email lands in the **inbox,
   not spam**, and that auth passes (Gmail → "Show original" → `SPF`/`DKIM`/`DMARC`
   all **PASS**). If it spams, re-check the Resend domain verification + the DMARC
   record (`EMAIL-DOMAIN-SETUP.md`).

If a row shows `email_status = 'failed'`, `wrangler tail` (or the Worker's
Observability → Logs) shows the Resend response — usually an unverified domain or a
bad key.

## Phase 6 — The apex cutover (👤 YOU) — LAST, only after 0–5 are green

This is the actual go-live switch and the one irreversible-ish step. It moves
`beansprout.ink` from **v1** to **v2**.

✅ **CNAME landmine — resolved for staging.** `apps/web/public/CNAME` (which
contained `beansprout.ink`) has been **removed**, restoring the guardrail in
`CLAUDE.md` / `ENQUIRY-SETUP.md` ("intentionally no `public/CNAME`"). With it gone,
enabling GitHub Pages in Phase 5 serves only on the `*.github.io` URL and **cannot**
prematurely claim the apex off v1. Re-adding it is now the deliberate cutover step
below.

> **Two test → production switch-overs happen at cutover** (both are flips of
> staging/test values to real ones — do them together):
> 1. **DNS** — point the apex at v2 (below).
> 2. **Email config** — flip the Worker secrets off the test sender/inbox (below).
> Until both are done, the site is staging: forms email the *developer's* inbox via
> Resend's test sender, and the apex still serves v1.

When ready to go live:

- [ ] **A day ahead: lower the apex DNS TTL** (👤, GoDaddy) on the records you'll change —
      drop the apex `A` / `www` `CNAME` TTL to **300s (5 min)** so both the cutover *and* a
      rollback propagate in minutes, not hours. Raise it back (e.g. 1 hour) a day after the
      cutover is confirmed healthy.
- [ ] **Re-add `apps/web/public/CNAME` = `beansprout.ink`** (🛠) and let Pages deploy.
- [ ] **Point DNS at GitHub Pages** (👤, GoDaddy): apex `A` records to GitHub's Pages
      IPs + `www` `CNAME` to `<user>.github.io` (or per your Pages custom-domain
      instructions). This is what actually moves traffic off v1.
- [ ] **Switch the email config from test → production** (👤, Worker → Settings →
      Variables and Secrets). During staging these point at the developer's Resend
      account; at go-live flip all three:
      | Secret | Test (now) | Production |
      |---|---|---|
      | `FROM_EMAIL` | `onboarding@resend.dev` | `roxy@beansprout.ink` |
      | `ARTIST_EMAIL` | the developer's test inbox | the artist's Gmail |
      Requires **`beansprout.ink` verified in Resend** (Phase 2/3) — until then
      `roxy@beansprout.ink` sends are rejected. `RESEND_API_KEY` /
      `RESEND_AUDIENCE_ID` stay the same. Saving a secret redeploys the Worker.
- [ ] **Add `beansprout.ink` as a verified custom domain** in the repo's Pages
      settings; enable **Enforce HTTPS** once the cert provisions. 👤
- [ ] **Confirm the Worker CORS allowlist** already includes `https://beansprout.ink`
      and `https://www.beansprout.ink` — it does (`src/lib/http.js`), so no change needed.
- [ ] **Smoke-test the live apex** — repeat the Phase 5 form tests against
      `https://beansprout.ink`.
- [ ] **Decommission/redirect v1** as appropriate once v2 is confirmed healthy. 👤
      Keep the v1 repo/deploy *intact but idle* (not deleted) for a week or two — it's the
      rollback target below.

### Rollback plan (if the cutover goes wrong)

The cutover is "irreversible-ish" only because DNS takes time to propagate — every step is
reversible, and with the TTL pre-lowered (first Phase-6 step) a revert is minutes, not
hours. Roll back the moment the live apex is broken (won't load, forms 500, mail bounces)
rather than debugging on the live domain:

1. **DNS — point the apex back at v1.** Restore the previous apex `A` / `www` `CNAME` to
   the **v1** target. This is the step that actually moves traffic back; do it first.
2. **Email — flip the Worker secrets back to test** (`FROM_EMAIL` / `ARTIST_EMAIL`) only if
   production sending is what's broken; otherwise leave them (the Worker is shared and v1
   doesn't use it).
3. **Pages — remove `apps/web/public/CNAME`** (revert the commit) so Pages stops claiming
   the apex and serves only on `*.github.io`, restoring the staging posture.
4. **Data is safe** — D1 is untouched by a DNS rollback; enquiries captured in the brief
   live window are still persisted (Time Travel covers operator error — see
   [`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md)). Diagnose on staging, then re-attempt.

## Critical path (the shortest route to live)

```
Phase 0 decisions
   └─► Phase 1 erasure runbook (CODE)  ┐
   └─► Phase 2 Resend+Cloudflare (YOU) ├─► Phase 5 verify on staging ─► Phase 6 apex cutover
   └─► Phase 3 email forwarding (YOU)  ┤
   └─► Phase 4 content sign-off        ┘
```

Phases 1–4 are parallelisable. The only ordering that matters: **everything before
Phase 5**, and **Phase 6 dead last** (resolve the CNAME landmine before enabling
Pages in Phase 5).

## Your immediate next actions (👤)

1. ~~Confirm the artist's Gmail + DNS access~~ ✅ done.
2. ~~Choose the erasure approach~~ ✅ done — minimal runbook built (Phase 1).
3. ~~Start the Resend + Cloudflare accounts (Phase 2)~~ ✅ done — Resend (key/domain/
   Audience) + Cloudflare Worker + D1 are live. The production email flip is held for
   Phase 6.
4. ~~Wire the inbox (Phase 3)~~ ✅ receive side done (ImprovMX + MX/SPF/DMARC, test
   landed). **One item left: Gmail "Send mail as"** via Resend SMTP.
5. ~~Set the build-time Worker URLs / enable Pages / staging email test / erasure
   dry-run (Phase 5)~~ ✅ all verified 2026-06-08 (GO-LIVE O2–O5).
6. Prices, the terms effective date (#155) and the hours / getting-here / booking
   lead-time facts (#179) are in. Still needed for Phase 4: the **ICO public reference**
   (ZA######), the **og-image**, **flash photos/copy**, **reply time**, the **logo/icon**,
   and the still-pending voice copy — send each and I'll apply it.

**Post-launch (Phase 7) is the [Backlog](#backlog-post-launch--extends-past-go-live)
below** — the same items, in rough priority order. Launch first; pick those up once
the site is live.

---

# Backlog (post-launch — extends past go-live)

Everything that outlives the launch. None of it blocks the apex cutover; it's picked
up after the site is live, in rough priority order.

## Post-launch delivery sequence (the path to delivery for every in-flight feature)

The detailed plans live in the per-feature stubs ([`PAYMENTS.md`](./PAYMENTS.md),
[`SCHEDULING.md`](./SCHEDULING.md),
[`CMS.md`](./CMS.md), [`ENGINEERING-LEARNINGS.md`](./ENGINEERING-LEARNINGS.md)); this is the
**ordering and the dependencies between them** so nothing stalls for lack of a prerequisite.
Each item below carries its own delivery detail; the sequence is what makes them shippable in
turn.

```
Launch (Phase 6)
  │
  ├─0. Quick wins (independent, front-load) ─ reduced-motion as a tested invariant +
  │     axe-core a11y in the Playwright tier · pick the analytics vendor
  │     (the lint floor already shipped — Biome, formatter deliberately off)
  │
  ├─1. /studio admin substrate ───────────┐  (token-protected read/manage over D1:
  │      enquiry/claim status lifecycle +  │   the shared surface the next three reuse)
  │      GDPR erasure UI)                   │
  │                                         ▼
  ├─2. Payments — Stripe checkout ──► 3. Scheduling (deposit = booking trigger;
  │      (flash full-pay first, then          co-ships with payments Phase 2)
  │       custom deposit via /studio)
  │
  ├─4. CMS (TinaCMS) ─ parallel track: crop→pieces.js refactor · POC · build-out
  │
  ├─5. Infrastructure consolidation (Cloudflare front + Tier-3 headers) ─ parallel;
  │      pairs with the CMS's git-backed Cloudflare stack; NOT entangled with the cutover
  │
  └─(ongoing) TypeScript incrementally · Turnstile spam layer · retargeting/Instagram
            (the last two unblock on the Phase-0 analytics/feed decisions)
```

**Why this order.** **(0)** raises the engineering floor cheaply and independently, so it
rides alongside everything after it. **(1) `/studio` is the load-bearing substrate** — the
artist-facing enquiry/claim view, the payments reconciliation surface, the scheduling
confirm step, and the GDPR erasure UI are all the same token-protected D1 surface, so it's
built once and reused. **Recommended next to scope** (post-audit, June 2026): now that the
payments backbone is shipped, a thin **`/studio`** admin page is the highest-leverage next
step — the custom-deposit reconciliation, the scheduling confirm, and the erasure UI all wait
on it. A short scoping note is enough to start: the **auth model** (a single shared
token/passcode vs. a real login), the handful of **read/update actions** (list submissions &
payments, mark a manual bank-transfer paid, confirm/decline a date, delete-by-email), and that
it **reuses the existing D1 + Worker** rather than a new app. **(2) Payments** is the highest-value feature and its **Worker
backbone is already built** (shipped dark); its flash-frontend phase can ship before
`/studio`, its custom-deposit phase needs it. **(3) Scheduling** rides on the deposit trigger, so it follows payments.
**(4) CMS** and **(5) infra consolidation** are independent parallel tracks that pair
naturally (both want a git-backed, Cloudflare-centred stack) and neither should be tangled
into the apex cutover. **TypeScript** is incremental and threads through all of it. The
detailed, ordered build steps for each are in the items below and their stubs.

## P2 — toward booking/enquiry *management*

- **Artist dashboard (enquiry/claim management + the admin substrate)** _(designed — see
  [`DASHBOARD.md`](./DASHBOARD.md))._ A private, single-artist dashboard over the D1 data
  (`submissions` / `flash_claims` / `payments`), **Worker-served and gated by Cloudflare
  Access**: an enquiry inbox with a status lifecycle, flash inventory, payments reconciliation,
  the GDPR delete-by-email tools, and the scheduling confirm queue. It's the **load-bearing
  substrate** — payments reconciliation, the scheduling confirm, and the erasure UI all live
  here — so it's built once, before the deposit/scheduling features that depend on it. The
  full functional design, data-model addition (`0003`), security model, and phased build are in
  [`DASHBOARD.md`](./DASHBOARD.md).

- **Online payments — integrated Stripe checkout** _(backbone **shipped dark**; embedded
  frontend + go-live config remain)._ The no-show defence the copy already promises — an
  **integrated checkout**, not hand-reconciled links. **Flash = full payment, custom = deposit
  only**; one Stripe engine carries card + Klarna + PayPal (PayPal native to Stripe in the UK),
  paying out to **Monzo Business**, embedded on-site (PCI SAQ-A), REST/no-SDK. The **Worker
  backbone is shipped dark** behind `PAYMENTS_ENABLED` (migration `0002`, server-side price
  authority, `/checkout`, `/webhooks/stripe`, lazy stale-release — all unit-tested; the
  `expires_at` + stale-release also closed the narrow stranded-`pending` durability gap from the
  June 2026 review). **Remaining:** ④ the embedded Payment Element frontend, the studio's account
  setup, and a staging test-mode run. **Then** Phase 2 = custom deposits (tokenised link +
  `/studio` reconciliation), Phase 3 = refunds/cancellation polish. Full detail — model,
  architecture, build spec, fees, operator runbook — in [`PAYMENTS.md`](./PAYMENTS.md).

- **Scheduling / appointment booking** _(planned — post-go-live, several decisions parked
  for the artist)._ A calendar layer over the flash claim (and later the custom enquiry) so a
  booking moves toward a **confirmed date** instead of an open email thread. The model is
  **request/hold + manual confirm**, not instant self-serve — but, under the Stripe direction,
  for **one** reason rather than two: the *deposit* now confirms automatically (the webhook
  promotes the claim), so what still forces a human step is that **Beansprout is a guest artist
  at Tiny Knives** and the bookable chair time isn't owned by the site. It reuses the flash
  atomic-reserve, the `expires_at`/stale-release, the `/studio` admin and the customer-email
  work the **payments track** already builds, so the two **co-ship as one track** (payments
  first — the deposit is the trigger). Couples with the artist-facing view below (same admin
  surface). Build-vs-buy and the product questions for the artist are open. Decisions + backlog
  stub: [`SCHEDULING.md`](./SCHEDULING.md).

- **GDPR retention/erasure — management UI.** The MVP runbook is done (Phase 1, plain
  SQL via `wrangler d1 execute`); the post-launch step is a **per-subject view,
  one-click erasure, and auto-retention** (a `booked` flag so the prune can run
  automatically + an audit log of who erased what). The erasure UI belongs with the
  artist-facing view above.

## P2 — content dashboard (CMS for the artist) _(planned — decided, deferred until after go-live)_

Let the artist manage **site content** themselves (distinct from the artist-facing view
above, which manages *enquiries/claims*). Decisions + backlog stub: [`CMS.md`](./CMS.md).

- **Scope:** portfolio (image + data, hide), flash (upload + data), homepage alert
  system + hero, testimonials, then the hand-authored pages (FAQ, services, about,
  aftercare). **Out:** editable filters, flash status, Visit home/guest.
- **Tool decided — TinaCMS** (git-backed: content + images stay in the repo, build
  stays self-contained) with email login via Tina Cloud (free tier, 1 editor).
  **Publish = direct to live** (commits to `main` → existing Pages build). Chosen
  over Sanity (which would move content/images off git to a SaaS + CDN) and Sveltia
  (GitHub-account friction). Hardening + CVE controls in `CMS.md` (security baseline).
- **Sequencing:** a post-launch track — ship the site first (GDPR + images), add the
  CMS once content churns. First step is a POC to validate Tina end-to-end.
- **Palette tie-in:** colour/swatch pickers generate from `src/data/palette.js` and
  honour the *never hard-code colour* rule, so the dashboard can't drift off-brand.

## P2 — infrastructure consolidation (Cloudflare front + full security headers)

**Direction (decided — post-launch):** fold the website's host onto Cloudflare so the
whole stack lives in one place, rather than the current **GitHub Pages (site) +
Cloudflare Worker (API)** split. The split carries standing maintenance overhead — two
hosts, two deploy paths, two header/security models — and that friction compounds as
the project grows; centralising removes it and **unlocks full security-header control**
(the Tier 3 the pre-launch headers note points to).

- **What it unlocks:** real response headers on the HTML — `Strict-Transport-Security`,
  `X-Frame-Options` / CSP `frame-ancestors` (the clickjacking defense Tier 1 can't
  give), `X-Content-Type-Options`, COOP/CORP — set declaratively, plus one origin and
  one CORS story for site + API.
- **Two routes:**
  - **(a) Move the site to Cloudflare Pages** — git-backed (content + images stay in
    the repo, build stays self-contained), with a `_headers` file for the full set.
    _Recommended:_ keeps the git-backed model (consistent with the TinaCMS plan) and is
    the cleanest single-host consolidation.
  - **(b) Keep GitHub Pages, front it with the Cloudflare proxy** — orange-cloud +
    Transform Rules / a Worker to inject headers. Less migration, but needs the apex DNS
    on Cloudflare nameservers (currently GoDaddy) and still leaves two hosts.
- **Supersedes a current decision:** this revisits "**the canonical site is GitHub
  Pages**" and "two independent deploys" in `CLAUDE.md`. When undertaken, update
  `CLAUDE.md` (deploy targets + the deploy guardrail), retire/replace
  `.github/workflows/deploy-web.yml`, and re-point the `VITE_*_FN_URL` build wiring.
- **Sequencing:** post-launch — don't entangle a host migration with the Phase 6 apex
  cutover. Ship MVP on Pages with Tier 1 headers first; consolidate once the site is
  live and stable. Pairs naturally with the CMS track (both want a git-backed,
  Cloudflare-centred stack).

## Engineering quality & tooling (from the benchmarking review)

Scheduled work promoted out of [`ENGINEERING-LEARNINGS.md`](./ENGINEERING-LEARNINGS.md), which
holds the **benchmark rationale** for each (cited by number below, not restated here, so the
two don't drift). This is the **actionable view**: priority + delivery. Priority reflects
leverage. The first three are the **quick wins** in the sequence above — independent,
low-effort, and they raise the floor under every feature that follows.

- **[High · low-effort] Linter, gated in CI** (LEARNINGS #1) — **✅ shipped.**
  **Biome** is wired in: config in `biome.json`, `npm run lint` (`lint:fix` for safe fixes),
  and a dedicated `lint` job in `.github/workflows/test.yml`. The recommended rule set is on
  and the tree passes. Genuine correctness findings were fixed in the setup PR (missing
  `parseInt` radix, a dead variable, useless regex escapes, `Math.pow`→`**`, an unused param,
  a bracket-key access, an assignment-in-expression); the **mechanical-modernisation sweep**
  (separate PR) then applied the two high-count behaviour-preserving rewrites across the tree
  (`useTemplate` → template literals, `useOptionalChain` → `?.`). Two deliberate, documented
  exclusions remain and are **not** a TODO:
  - The **formatter is intentionally off.** The code uses deliberate hand column-alignment
    (e.g. aligned `=` in `const` blocks) that Biome's formatter would collapse; the lint rules
    give the static-analysis value without imposing whitespace opinions over that craft.
  - **`useIterableCallbackReturn` is off** — the side-effecting one-liner `arr.forEach(x => fn(x))`
    is idiomatic throughout the codebase; wrapping ~22 call sites in braces is cosmetic churn
    with no real bug caught. Re-enable if that pattern is ever retired.
- **[High · a11y] Make `prefers-reduced-motion` a tested invariant** (LEARNINGS #7).
  _Delivery: a Playwright spec that loads with `prefers-reduced-motion: reduce` and asserts
  GSAP/Lenis are inert and content is visible._
- **[Medium · a11y] Automated accessibility checks** — axe-core in the Playwright tier
  (LEARNINGS #8). _Delivery: an axe pass per key page in the E2E job._
- **[High] TypeScript, incrementally** (LEARNINGS #2) — start at the data→render contract
  (`apps/web/src/data/*`, `apps/web/src/build/*`) and the Worker (`apps/functions/src/*`).
  _Ongoing thread, not a single PR._
- **[Medium] JS-weight / Core Web Vitals budgets** (LEARNINGS #6) — audit per-page motion need
  and track CWV as budgets (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1).
- **[Consider] Defense-in-depth spam layer** (LEARNINGS #12) — **Cloudflare Turnstile**
  alongside the existing honeypot + rate limiting (plus the consent/validation hardening from
  the June 2026 review). Cheap to add when form spam appears.
- **[Park] Astro migration** at a future v3/major-refresh inflection (LEARNINGS #3) — *not
  now*; recorded as a considered option, gated by the test net that makes it safe to revisit.

## P1 leftovers (decision-blocked)

- **Retargeting pixel** (Meta/TikTok) — a deliberate either/or: it's a marketing cookie that
  **forces a consent banner** (the cookieless analytics choice gives no head start here). Parked
  behind that call; default is stay banner-free. See [`ANALYTICS.md`](./ANALYTICS.md) §4.
- **Instagram feed embed** — recommended as a **build-time static snapshot** (no token, no
  third-party cookies, no banner), reusing the `process-media.mjs` + data-file pattern. See
  [`ANALYTICS.md`](./ANALYTICS.md) §6.

## P3 — polish

- **Scrub the artist's personal email from git history** _(noted — deferred, not
  urgent)._ The persona-decoupling pass removed the real `ARTIST_EMAIL` Gmail from
  the **working tree** (it now lives only as a Worker secret), but it still exists
  in **earlier commits** of this public repo. Remove it when convenient with a
  **local** history rewrite — e.g. from a full clone,
  `git filter-repo --replace-text replacements.txt` (where `replacements.txt` maps
  the old address → `REDACTED`), then a coordinated **force-push** to all branches
  and tags. This **cannot be done from a Claude Code web session** (the git proxy
  rejects history rewrites — see `CLAUDE.md`), and it rewrites SHAs so it needs a
  heads-up to anyone with a clone/open PR. Zero-effort alternative: treat the
  address as exposed and **rotate the inbox**. (Forks/GitHub caches may retain old
  commits even after a force-push.)
- **Self-host + subset the fonts** (LCP + EU-privacy) — currently the Google
  Fonts CDN, render-blocking, with wide variable-font ranges.
- **Real `/images/og-image.jpg`** (1200×630) — a branded **placeholder** now ships so
  social cards / the JSON-LD `image` don't 404; swap in a real photo before launch (Phase 4).
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
- ~~**Dev-tooling audit advisories.**~~ ✅ **Done** — the Vite 8 / Vitest 4 bump shipped
  (#99, #100); `npm audit` is now clean (**0 vulnerabilities**, production + dev).
