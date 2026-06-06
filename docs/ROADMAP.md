# Beansprout — roadmap & go-live plan

The single living document for Beansprout v2: **what's shipped**, the **sequenced
path to launch** (the go-live plan), and the **post-launch backlog** that extends
past it. Update it as items land. Architecture lives in [`CLAUDE.md`](../CLAUDE.md);
function/secret setup in [`ENQUIRY-SETUP.md`](./ENQUIRY-SETUP.md),
[`NEWSLETTER-SETUP.md`](./NEWSLETTER-SETUP.md) and
[`EMAIL-DOMAIN-SETUP.md`](./EMAIL-DOMAIN-SETUP.md); data compliance in
[`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md); the content-CMS plan in
[`CMS.md`](./CMS.md).

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
2. **Real copy + images.** Largely done (#53; 28 portfolio pieces with real photos,
   12 flash pieces). Remaining gaps are small and listed in **Phase 4**.

With the engineering blocker cleared, the route to live is now **operational**: stand
up the backend (Phase 2), wire the inbox (Phase 3), sign off content (Phase 4), verify
on staging (Phase 5), then cut the apex over (Phase 6).

## Phase 0 — Decisions to make first (👤 YOU)

These unblock later phases. None require code to decide.

- [x] **Where Roxy reads mail** — confirmed: **`roksanaklaudia.z@gmail.com`** is
      `ARTIST_EMAIL` (where `@beansprout.ink` forwards). See `EMAIL-DOMAIN-SETUP.md`.
- [x] **DNS access** — confirmed (GoDaddy, for `beansprout.ink`).
- [ ] **Analytics vendor (optional for MVP)** — Plausible/Fathom (cookieless, no
      consent banner) vs GA4 (needs a banner). The `track()` scaffold
      (`src/js/modules/analytics.js`) no-ops until one is wired, so the site is
      launch-legal without it. *Recommend deferring to post-launch unless you want
      launch-day numbers.* (Also unblocks the retargeting pixel — see the Backlog.)
- [ ] **Deposit capture (Stripe)** — the enquire copy mentions deposits, but Stripe
      is **not** wired (Backlog P2). Decide: launch without it (manual deposit
      requests) or build it first. *Recommend launch without; add post-launch.*

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

- [x] **Site CSP + Referrer-Policy via a Vite head plugin.** A sixth plugin
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
      `ARTIST_EMAIL` currently hold the **test** values (`onboarding@resend.dev` /
      `harrisonfisher1990@gmail.com`); they flip to production at Phase 6.
      | Key | Value |
      |---|---|
      | `RESEND_API_KEY` | the `re_…` key |
      | `ARTIST_EMAIL` | `roksanaklaudia.z@gmail.com` (production; test = `harrisonfisher1990@gmail.com`) |
      | `FROM_EMAIL` | `roxy@beansprout.ink` (production; test = `onboarding@resend.dev`) |
      | `RESEND_AUDIENCE_ID` | the Audience ID |
      | `RATE_*` | *(optional vars — defaults are sane)* |
- [x] **Note the Worker URL** — `https://beansprout-forms.<subdomain>.workers.dev/`
      (routes: `/enquiry`, `/newsletter`, `/flash-status`).

> **Why Cloudflare, not Netlify:** the previous host paused the whole project when a
> monthly **credit limit** was hit (taking the live forms down). Cloudflare's free
> Workers + D1 tiers have no credit-pause model, so the forms can't go dark that way.

## Phase 3 — Wire the inbox (email forwarding) (👤 YOU)

So `hello@` / `roxy@beansprout.ink` actually **receive**, and Roxy can reply *as*
the domain. Full detail in `docs/EMAIL-DOMAIN-SETUP.md`. This uses **MX/TXT** only
and does **not** touch the website's A/CNAME — so it's safe to do before cutover.

- [ ] **ImprovMX** (free) — add `beansprout.ink`, create `hello@` and `roxy@`
      aliases → Roxy's Gmail.
- [ ] **GoDaddy DNS** — add ImprovMX's MX records + SPF TXT; **remove GoDaddy's
      default `*.secureserver.net` MX** (after confirming no current mail relies on
      them). Keep nameservers on GoDaddy.
- [ ] **One SPF record only** at `@` (edit the existing default, don't add a second).
- [ ] **Add a DMARC record** at `_dmarc` (`p=none` to start).
- [ ] **Gmail "Send mail as"** `roxy@beansprout.ink` **via Resend SMTP**
      (`smtp.resend.com`, port 465/587, user `resend`, pass = `RESEND_API_KEY`) so
      manual replies stay DKIM-aligned and don't land in spam.
- [ ] **Test:** email `hello@beansprout.ink` from your phone → lands in Gmail.

## Phase 4 — Content sign-off (👤 YOU, with 🛠 CODE to apply edits)

Content is mostly in, but a few items need your confirmation before launch.
(Edits land via PR — give me the values and I'll wire them.)

- [ ] **Services prices** — `apps/web/services/index.html` flags prices as
      *placeholders from the design brief*. Confirm real prices/tiers. 🛠 apply.
- [ ] **Terms & privacy effective date + legal review** — `terms/index.html` has a
      placeholder effective date and a note to have wording reviewed against current
      consumer law; deposit figures must match `/services/`. 👤 review → 🛠 apply.
- [ ] **`og-image.jpg` (1200×630)** — referenced site-wide for social cards, the
      default piece-page OG image, **and the homepage JSON-LD `image`** (so its absence
      also weakens the structured-data/rich-result), **still missing** (Backlog P3).
      Until it exists, link previews and the `Person` schema point at a 404. 👤 supply
      image → 🛠 add to `apps/web/public/images/og-image.jpg`.
- [ ] **Portfolio / flash spot-check** — 28 pieces + 12 flash are populated with real
      photos; eyeball them for any remaining placeholders/tone-swatch fallbacks.
- [ ] *(Optional)* **Testimonials** — the "Kind words" homepage block is `hidden`
      while empty. Add real quotes to `src/data/testimonials.js` and remove `hidden`
      to switch it on. Fine to launch without.

## Phase 5 — End-to-end verification on staging (👤 YOU + 🛠 CODE)

Do this on the Pages project URL **before** any apex change. The fastest loop is
**local** (`wrangler dev` + `npm run dev`), which needs no cloud at all
(`ENQUIRY-SETUP.md` Part D).

- [ ] **Set the build-time Worker URLs.** Repo → Settings → Secrets and variables →
      Actions → **Variables** → `VITE_ENQUIRY_FN_URL`, `VITE_NEWSLETTER_FN_URL`,
      `VITE_FLASH_STATUS_FN_URL` = your `…workers.dev/<route>` URLs (the workers.dev
      subdomain is account-specific, so all three must be set). 👤
- [ ] **Enable GitHub Pages** — Settings → Pages → Source = **GitHub Actions**.
      Safe now: the apex `CNAME` has been removed (Phase 6), so Pages serves only on
      the `*.github.io` URL until the deliberate cutover. 👤
- [ ] **End-to-end email test** — the acceptance test below. 👤
- [ ] **Erasure runbook dry-run** — run an access `SELECT` and the prune preview
      against D1 (the Phase 1 / `DATA-COMPLIANCE.md` path). 👤
- [ ] **Console clean** — no errors on each page; nav status light, sitemap, robots,
      404 all render. 👤

### End-to-end email test (go-live acceptance)

A repeatable test of the **full email round-trip**. Run it twice:
- **(a) Staging** — `FROM_EMAIL=onboarding@resend.dev`, `ARTIST_EMAIL=harrisonfisher1990@gmail.com`
  (Resend's test sender only delivers to the Resend-account owner).
- **(b) Production** — after the Phase 6 email switch-over, repeat against
  `https://beansprout.ink` with `FROM_EMAIL=roxy@beansprout.ink` / `ARTIST_EMAIL=roksanaklaudia.z@gmail.com`.

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

- [ ] **A day ahead: lower the apex DNS TTL** (👤, GoDaddy) on the records you'll
      change — drop the apex `A` / `www` `CNAME` TTL to **300s (5 min)**. This makes
      both the cutover *and* a rollback propagate in minutes instead of hours. Raise it
      back to a normal value (e.g. 1 hour) a day after the cutover is confirmed healthy.
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
      | `ARTIST_EMAIL` | `harrisonfisher1990@gmail.com` | `roksanaklaudia.z@gmail.com` |
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
      Keep the v1 repo/deploy *intact but idle* (not deleted) until v2 has run clean for
      a week or two — it's the rollback target below.

### Rollback plan (if the cutover goes wrong)

The cutover is "irreversible-ish" only because DNS takes time to propagate — every
step is reversible, and with the TTL pre-lowered (first step above) a revert is minutes,
not hours. Roll back the moment the live apex is broken (site won't load, forms 500,
mail bounces) rather than debugging on the live domain:

1. **DNS — point the apex back at v1.** Restore the previous apex `A` records / `www`
   `CNAME` to the **v1** target. This is the one that actually moves traffic back; do it
   first. (Keeping v1 idle-but-intact, above, is what makes this possible.)
2. **Email — flip the Worker secrets back to test** (`FROM_EMAIL` /`ARTIST_EMAIL`) only
   if production sending is the thing that's broken; otherwise leave them — the Worker is
   shared and v1 doesn't use it.
3. **Pages — remove `apps/web/public/CNAME`** (revert the commit) so Pages stops claiming
   the apex and serves only on `*.github.io` again, restoring the staging posture.
4. **Data is safe** — D1 is unaffected by a DNS rollback; any enquiries captured during
   the brief live window are still persisted (Time Travel covers operator error — see
   `DATA-COMPLIANCE.md`). Diagnose on staging, then re-attempt the cutover.

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

1. ~~Confirm Roxy's Gmail + DNS access~~ ✅ done.
2. ~~Choose the erasure approach~~ ✅ done — minimal runbook built (Phase 1).
3. ~~Start the Resend + Cloudflare accounts (Phase 2)~~ ✅ done — Resend (key/domain/
   Audience) + Cloudflare Worker + D1 are live. The production email flip is held for
   Phase 6.
4. **Wire the inbox (Phase 3)** — ImprovMX aliases + the GoDaddy MX/SPF/DMARC records,
   and Gmail "Send mail as". Safe before cutover (MX/TXT only, no A/CNAME change).
5. **Set the build-time Worker URLs** (Phase 5) — `VITE_*_FN_URL` as repo Actions
   Variables — then enable GitHub Pages and run the staging email test.
6. Send me confirmed **service prices**, a signed-off **terms effective date**, and
   the **og-image** (Phase 4) and I'll apply them.

**Post-launch (Phase 7) is the [Backlog](#backlog-post-launch--extends-past-go-live)
below** — the same items, in rough priority order. Launch first; pick those up once
the site is live.

---

# Backlog (post-launch — extends past go-live)

Everything that outlives the launch. None of it blocks the apex cutover; it's picked
up after the site is live, in rough priority order.

## P2 — toward booking/enquiry *management*

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
  - **Dependency:** the GDPR erasure UI (below) naturally lives in the same admin
    surface (delete-by-email).

- **Deposit capture (PayPal + Monzo, manual).** The no-show defence the copy already
  promises. Reserve → deposit links (PayPal.Me/Monzo.me) → artist marks paid → claim
  confirmed, with a stale-pending auto-release. Manual reconciliation (no gateway/webhooks).
  Decisions + backlog stub: [`PAYMENTS-PLAN.md`](./PAYMENTS-PLAN.md). _(Supersedes the earlier "Stripe" framing — the studio confirmed PayPal + Monzo.)_

- **Scheduling / appointment booking** _(planned — post-go-live switch-over, several
  decisions parked for Roxy)._ A calendar layer over the flash claim (and later the custom
  enquiry) so a booking moves toward a **confirmed date** instead of an open email thread.
  Because deposits are reconciled by hand (above), the model is **request/hold + manual
  confirm**, not instant self-serve — it reuses the flash atomic-reserve, the stale-pending
  TTL/cron, the `/studio` admin and the customer-email work the deposit plan already needs,
  so the two **co-ship as one track**. Couples with the artist-facing view below (same admin
  surface). Build-vs-buy and the product questions for Roxy are open. Decisions + backlog
  stub: [`SCHEDULING.md`](./SCHEDULING.md).

- **GDPR retention/erasure — management UI.** The MVP runbook is done (Phase 1, plain
  SQL via `wrangler d1 execute`); the post-launch step is a **per-subject view,
  one-click erasure, and auto-retention** (a `booked` flag so the prune can run
  automatically + an audit log of who erased what). The erasure UI belongs with the
  artist-facing view above.

## P2 — content dashboard (CMS for Roxy) _(planned — decided, deferred until after go-live)_

Let Roxy manage **site content** herself (distinct from the artist-facing view
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

## P1 leftovers (decision-blocked)

- **Retargeting pixel** (Meta/TikTok) — blocked on the analytics-vendor decision
  (Phase 0).
- **Instagram feed embed** — blocked on the feed-mechanism decision (Phase 0).

## P3 — polish

- **Self-host + subset the fonts** (LCP + EU-privacy) — currently the Google
  Fonts CDN, render-blocking, with wide variable-font ranges.
- **Add `/images/og-image.jpg`** (1200×630) — referenced site-wide for social
  cards (and the default piece-page OG image), still missing (also Phase 4).
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
