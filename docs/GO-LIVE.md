# MVP go-live plan — Beansprout v2

A step-by-step path to take this repo from **staging** (GitHub Pages + the
Cloudflare Worker) to **live on the apex `beansprout.ink`**, replacing the v1 site.

This plan is derived from a full review of `CLAUDE.md`, `docs/ROADMAP.md`,
`docs/ENQUIRY-SETUP.md`, `docs/NEWSLETTER-SETUP.md`, `docs/EMAIL-DOMAIN-SETUP.md`,
the privacy page, and the function code. It separates **what only you can do**
(external accounts, DNS, dashboards, content sign-off — marked 👤 **YOU**) from
**what is code work** (marked 🛠 **CODE**, doable in this repo via PR).

> **Guardrail (from `CLAUDE.md`):** `beansprout.ink` is intentionally still served
> by **v1** (`gfnnn/beansprout`). Nothing in Phases 1–5 points the apex at v2.
> The apex cutover is **Phase 6** and is deliberately last.

---

## At-a-glance: the only hard blockers

Per `docs/ROADMAP.md`, two things gate the apex cutover:

1. **GDPR retention/erasure** for the `submissions` Blobs store (special-category
   data: allergies, DOB). The privacy page already *states* retention periods, but
   there is **no working erasure path** (delete-by-key) and no retention enforcement.
   → **Phase 1** (code). This is the one real engineering blocker.
2. **Real copy + images.** Largely done (#53; 29 portfolio pieces with real photos,
   12 flash pieces). Remaining gaps are small and listed in **Phase 4**.

Everything else is wiring (Phases 2–3) and verification (Phase 5).

---

## Phase 0 — Decisions to make first (👤 YOU)

These unblock later phases. None require code to decide.

- [x] **Where Roxy reads mail** — confirmed: **`roksanazielonka.z@gmail.com`** is
      `ARTIST_EMAIL` (where `@beansprout.ink` forwards). See `EMAIL-DOMAIN-SETUP.md`.
- [x] **DNS access** — confirmed (GoDaddy, for `beansprout.ink`).
- [ ] **Analytics vendor (optional for MVP)** — Plausible/Fathom (cookieless, no
      consent banner) vs GA4 (needs a banner). The `track()` scaffold no-ops until
      one is wired, so the site is launch-legal without it. *Recommend deferring to
      post-launch unless you want launch-day numbers.*
- [ ] **Deposit capture (Stripe)** — the enquire copy mentions deposits, but Stripe
      is **not** wired (ROADMAP P2). Decide: launch without it (manual deposit
      requests) or build it first. *Recommend launch without; add post-launch.*

---

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

---

## Phase 2 — Stand up the backend (Resend + Cloudflare) (👤 YOU)

Follow `docs/ENQUIRY-SETUP.md` and `docs/NEWSLETTER-SETUP.md`. Summary:

- [ ] **Resend account** — sign up, create an API key (`re_…`). *(ENQUIRY-SETUP Part A)*
- [ ] **Verify the sending domain** in Resend — add Resend's DNS records (MX/TXT/DKIM
      on the `send.` subdomain) at GoDaddy, click **Verify**. Until verified, sends
      are rejected. *(ENQUIRY-SETUP Part A; EMAIL-DOMAIN-SETUP)*
- [ ] **Create a Resend Audience** (newsletter) — copy its Audience ID.
      *(NEWSLETTER-SETUP step 1)*
- [ ] **Cloudflare account + Worker** — from `apps/functions/`: `wrangler login`,
      `wrangler d1 create beansprout` (paste the id into `wrangler.toml`),
      `wrangler d1 migrations apply beansprout`, then `wrangler deploy`.
      *(ENQUIRY-SETUP Part B)*
- [ ] **Set Worker secrets** (`wrangler secret put <NAME>`):
      | Key | Value |
      |---|---|
      | `RESEND_API_KEY` | the `re_…` key |
      | `ARTIST_EMAIL` | `roksanazielonka.z@gmail.com` |
      | `FROM_EMAIL` | `roxy@beansprout.ink` (or `onboarding@resend.dev` while testing) |
      | `RESEND_AUDIENCE_ID` | the Audience ID |
      | `RATE_*` | *(optional vars — defaults are sane)* |
- [ ] **Note the Worker URL** — `https://beansprout-forms.<subdomain>.workers.dev/`
      (routes: `/enquiry`, `/newsletter`, `/flash-status`).

> **Why Cloudflare, not Netlify:** the previous host paused the whole project when a
> monthly **credit limit** was hit (taking the live forms down). Cloudflare's free
> Workers + D1 tiers have no credit-pause model, so the forms can't go dark that way.

---

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

---

## Phase 4 — Content sign-off (👤 YOU, with 🛠 CODE to apply edits)

Content is mostly in, but a few items need your confirmation before launch.
(Edits land via PR — give me the values and I'll wire them.)

- [ ] **Services prices** — `apps/web/services/index.html` flags prices as
      *placeholders from the design brief*. Confirm real prices/tiers. 🛠 apply.
- [ ] **Terms & privacy effective date + legal review** — `terms/index.html` has a
      placeholder effective date and a note to have wording reviewed against current
      consumer law; deposit figures must match `/services/`. 👤 review → 🛠 apply.
- [ ] **`og-image.jpg` (1200×630)** — referenced site-wide for social cards and the
      default piece-page OG image, **still missing** (ROADMAP P3). 👤 supply image →
      🛠 add to `apps/web/public/images/og-image.jpg`.
- [ ] **Portfolio / flash spot-check** — 29 pieces + 12 flash are populated with real
      photos; eyeball them for any remaining placeholders/tone-swatch fallbacks.
- [ ] *(Optional)* **Testimonials** — the "Kind words" homepage block is `hidden`
      while empty. Add real quotes to `src/data/testimonials.js` and remove `hidden`
      to switch it on. Fine to launch without.

---

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
- [ ] **Enquiry form** — submit with 1–2 photos → land on `/enquiry-received/`,
      email arrives at `ARTIST_EMAIL` with attachments, **Reply** goes to the
      enquirer. 👤
- [ ] **Flash claim** — claim a piece → email arrives; the piece flips to
      pending/claimed on the grid (verify double-claim is rejected). 👤
- [ ] **Newsletter** — sign up → "You're on the list", contact appears in the Resend
      Audience, consent ledger written. 👤
- [ ] **Erasure runbook dry-run** — run an access `SELECT` and the prune preview
      against D1 (the Phase 1 / `DATA-COMPLIANCE.md` path). 👤
- [ ] **Console clean** — no errors on each page; nav status light, sitemap, robots,
      404 all render. 👤

---

## Phase 6 — The apex cutover (👤 YOU) — LAST, only after 1–5 are green

This is the actual go-live switch and the one irreversible-ish step. It moves
`beansprout.ink` from **v1** to **v2**.

✅ **CNAME landmine — resolved for staging.** `apps/web/public/CNAME` (which
contained `beansprout.ink`) has been **removed**, restoring the guardrail in
`CLAUDE.md` / `ENQUIRY-SETUP.md` ("intentionally no `public/CNAME`"). With it gone,
enabling GitHub Pages in Phase 5 serves only on the `*.github.io` URL and **cannot**
prematurely claim the apex off v1. Re-adding it is now the deliberate cutover step
below.

When ready to go live:

- [ ] **Re-add `apps/web/public/CNAME` = `beansprout.ink`** (🛠) and let Pages deploy.
- [ ] **Point DNS at GitHub Pages** (👤, GoDaddy): apex `A` records to GitHub's Pages
      IPs + `www` `CNAME` to `<user>.github.io` (or per your Pages custom-domain
      instructions). This is what actually moves traffic off v1.
- [ ] **Add `beansprout.ink` as a verified custom domain** in the repo's Pages
      settings; enable **Enforce HTTPS** once the cert provisions. 👤
- [ ] **Confirm the Worker CORS allowlist** already includes `https://beansprout.ink`
      and `https://www.beansprout.ink` — it does (`src/lib/http.js`), so no change needed.
- [ ] **Smoke-test the live apex** — repeat the Phase 5 form tests against
      `https://beansprout.ink`.
- [ ] **Decommission/redirect v1** as appropriate once v2 is confirmed healthy. 👤

---

## Phase 7 — Post-launch (deferred, not blockers)

From ROADMAP, in rough priority order:

- Analytics vendor decision → turn on `track()`; then the retargeting pixel.
- Stripe deposit capture.
- Artist-facing admin view + status lifecycle (folds in the erasure UI from Phase 1).
- Instagram feed embed (pick a mechanism).
- TinaCMS content dashboard for Roxy (`docs/CMS.md`).
- Polish: self-host/subset fonts, firm up `seo.js` regex injection with tests,
  palette visual QA, Vite 8 / Vitest 4 dev-tooling bump.

---

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
3. Start the Resend + Cloudflare accounts (Phase 2) — `wrangler deploy` the Worker;
   this gates deployed form testing (local `wrangler dev` works without it).
4. Send me confirmed **service prices**, a signed-off **terms effective date**, and
   the **og-image** (Phase 4) and I'll apply them.
</content>
</invoke>
