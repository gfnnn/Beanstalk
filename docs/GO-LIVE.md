# Go-live tracker — the remaining actions only

The **working tick-list** for launching Beansprout v2 onto the apex `beansprout.ink`.
This is intentionally *just what's left* — every shipped/closed item and the whole
post-launch backlog live in [`ROADMAP.md`](./ROADMAP.md); this page is the short list we
work through to launch. When an item lands, tick it here and reflect it in `ROADMAP.md`.

**Verified against the codebase on 2026-06-08** — counts and states below are real
(not assumed): `npm test` = **620 pass**, CNAME absent (staging posture intact), 28
portfolio photos in, 12 flash pieces still placeholder, 68 copy markers still pending.

Owners: 👤 **YOU** (external accounts / DNS / dashboards / sign-off) · 🛠 **CODE**
(I do it in-repo via PR — most need a value from you first).

---

## The two hard blockers (everything else is operational)

1. **GDPR retention/erasure** — ✅ **cleared** (12-month retention + delete-by-email SQL
   runbook in `DATA-COMPLIANCE.md`; privacy page matches). Only a *dry-run* remains (O5).
2. **Real copy + images** — ⏳ **the live blocker.** 28 portfolio photos are in, but
   **68 copy slots are unapproved**, **12 flash pieces are placeholder art**, and the
   hero clip / og-image / logo are placeholders. This is the bulk of the work below (C1–C9).

---

## A. Content & copy sign-off  (👤 supply values → 🛠 I apply)

The gate for copy is one command reaching zero: `grep -rn "pending approval" apps/web/`
(currently **68**, across 22 files). The artist fills in [`COPY-FOR-ARTIST.md`](./COPY-FOR-ARTIST.md);
I apply each to source and flip/clear its `ARTIST-COPY · <REF>` marker.

- [ ] **C1 · Copy approval (umbrella)** — work `COPY-FOR-ARTIST.md` against the staging
      site; 🛠 I apply words + flip markers until `pending approval` = 0, then strip the
      `ARTIST-COPY` comments before cutover. Refs span HOME-01..10, FLASH, PORT, SERV,
      VISIT, PRIV, TERMS, NL, PIECE, SHARED.
- [ ] **C2 · Services prices** (`SERV-02`) — `services/index.html` prices (£120 / £180–280
      / £420) are *design-brief placeholders*. 👤 confirm real prices/tiers → 🛠 apply.
- [ ] **C3 · Terms/privacy effective date + legal review** (`TERMS-01/02/03`) — placeholder
      effective date; have wording reviewed against current consumer law; **deposit figures
      must match `/services/`.** 👤 review → 🛠 apply.
- [ ] **C4 · Flash art + copy** — all **12** pieces in `flash.js` are `img: null` (line-art
      glyphs; titles/specs/prices placeholder). 👤 supply photos + real copy → 🛠 add to
      `flash.js` + drop files in `public/images/flash/`.
- [ ] **C5 · og-image.jpg** — a branded **placeholder** (68 KB) is committed so cards/JSON-LD
      don't 404. 👤 supply a real **1200×630** photo → 🛠 swap `public/images/og-image.jpg`.
- [ ] **C6 · Hero video / GIF** — both slots in `media.js` are `show: false`. 👤 supply clip/GIF
      → 🛠 run `process-video.mjs`, flip `show: true`, LFS the binaries.
- [ ] **C7 · Brand logo + confirmation icon** — nav shows a `logo.svg` **text** placeholder
      (no real file yet) and `/enquiry-received/` shows an icon placeholder. 👤 supply final
      artwork → 🛠 wire into `.nav-logo-placeholder` + `.confirm-mark`.
- [ ] **C8 · Portfolio spot-check** — 28 real photos are in; 👤 eyeball them on the built site.
- [ ] **C9 · (Optional) Testimonials** — "Kind words" block is `hidden` while empty. Add real
      quotes to `testimonials.js` + remove `hidden` to switch on. **Fine to launch without.**

## B. Operational — backend is up, finish the wiring  (👤 YOU)

Phase 2 (Resend + Cloudflare Worker + D1) is ✅ done. These remain. All are safe **before**
cutover (MX/TXT and repo settings only — they don't touch the website's A/CNAME).

- [~] **O1 · Wire the inbox** (Phase 3, `EMAIL-DOMAIN-SETUP.md`) — **receive side ✅ done.**
      ImprovMX live ("Email forwarding active"); `hello@` / `roxy@` → artist Gmail
      (`beansprouttattoo@gmail.com`), catch-all `*@` → `harrisonfisher1990@gmail.com`; no
      `*.secureserver.net` default MX existed (nothing to remove); Resend's `send`/amazonses
      MX left intact; a **real test email to `hello@` landed in the artist inbox**; the
      `_dmarc` TXT (`v=DMARC1; p=none; rua=mailto:hello@beansprout.ink`) is ✅ in at GoDaddy.
      **Outstanding (send side) — one item:** the Gmail **"Send mail as"** `roxy@beansprout.ink`
      via Resend SMTP (needs the artist's Gmail — the reply-as-domain piece).
- [x] **O2 · Set build-time Worker URLs** — ✅ done. Three repo Actions **Variables**
      (`VITE_ENQUIRY_FN_URL` / `VITE_NEWSLETTER_FN_URL` / `VITE_FLASH_STATUS_FN_URL`) set to
      the `beansprout-forms.harrisonfisher1990.workers.dev/<route>` URLs (matches the
      `config.js` default). *(Cloudflare Pages staging project still needs these in its own
      env if the `*.pages.dev` URL is used for verification.)*
- [x] **O3 · Enable GitHub Pages** — ✅ done. Settings → Pages → Source = **GitHub Actions**.
      No `CNAME`, so it serves only on `gfnnn.github.io` until the deliberate cutover — apex
      untouched. (Builds on push to `main` / manual dispatch.)

## C. Verify on staging  (👤 YOU + 🛠) — before *any* apex change

Fastest loop is local (`wrangler dev` + `npm run dev`). Run the **staging (a)** email test.

- [x] **O4 · End-to-end email test (staging run "a")** — ✅ **verified on `beanstalk-e61.pages.dev`**
      (2026-06-08). Enquiry → inbox with **2 photos attached** + full field layout; reply-path
      `Reply-To` = the enquirer; flash claim → inbox **and** the grid flips to **● PENDING**
      (server-side reserved, re-claim blocked); newsletter → contact **Subscribed** in the Resend
      Audience (`Beansprout_SUBS`). Staging `SPF`/`DKIM`/`DMARC` all **pass** (resend.dev sender).
      *(Production deliverability against `beansprout.ink` is the separate X7 check.)*
- [ ] **O5 · Erasure runbook dry-run** — run an access `SELECT` + the prune **preview**
      against D1 (`DATA-COMPLIANCE.md`), so the GDPR path is proven before a real request.
      Easiest route: Cloudflare → D1 → `beansprout` → Console. Also captures O4's D1
      source-of-truth check (test rows present, `email_status='sent'`). Set a quarterly prune reminder.
- [~] **O6 · Console clean** — **largely covered**: `beanstalk-e61.pages.dev` has run stably for
      days. To formally close, glance at the dev-tools console on home / portfolio / enquire
      (zero errors) + confirm the nav status light renders. (Browser-only interaction paths are
      gated by the PR's `e2e.yml` job, not this manual sweep. On staging, `robots.txt` =
      `Disallow: /` with no sitemap — expected, not a bug.)

## D. The apex cutover — Phase 6, LAST, only after A–C are green  (👤 + 🛠)

Moves `beansprout.ink` from **v1 → v2**. Two test→prod flips happen together (DNS + email).

- [ ] **X1 · A day ahead: lower apex DNS TTL to 300 s** (👤 GoDaddy) on the apex `A` /
      `www` `CNAME` — so cutover *and* rollback propagate in minutes. Raise back after.
- [ ] **X2 · Re-add `apps/web/public/CNAME` = `beansprout.ink`** (🛠) and let Pages deploy.
- [ ] **X3 · Point DNS at GitHub Pages** (👤 GoDaddy) — apex `A` → Pages IPs + `www`
      `CNAME` → `<user>.github.io`. *This is what moves traffic off v1.*
- [ ] **X4 · Flip Worker email secrets test → prod** (👤 Worker settings): `FROM_EMAIL`
      → `roxy@beansprout.ink`, `ARTIST_EMAIL` → artist Gmail. (Needs `beansprout.ink`
      verified in Resend.) Saving redeploys the Worker.
- [ ] **X5 · Add `beansprout.ink` as a verified custom domain** in Pages settings; enable
      **Enforce HTTPS** once the cert provisions. 👤
- [ ] **X6 · Confirm Worker CORS allowlist** includes the apex — it already does
      (`src/lib/http.js`); just verify, no change.
- [ ] **X7 · Smoke-test the live apex** — repeat the email test as **production run "b"**
      against `https://beansprout.ink`, incl. deliverability (inbox-not-spam, SPF/DKIM/DMARC PASS).
- [ ] **X8 · Decommission/redirect v1** once v2 is healthy — keep v1 **idle, not deleted**
      for 1–2 weeks as the rollback target. (Rollback steps: `ROADMAP.md` → *Rollback plan*.)

---

## Decisions still open (don't block the build — confirm before/at launch)

- **Payments live at launch?** Worker backbone is shipped dark behind `PAYMENTS_ENABLED`;
  only the embedded Payment Element frontend + account setup remain. **Recommend launch
  WITHOUT** (deposit requested by email), flip on post-launch. → needs a yes/no.
- **Analytics** — decided **Plausible**, deferred post-launch; site is launch-legal without
  it (the `track()` scaffold no-ops). No action to launch.

## Ordering (the only constraints)

```
A content + B wiring  (parallel)
        └─► C verify on staging ─► D apex cutover (dead last)
```
Everything in A/B/C can run in parallel. The only hard rules: **C before D**, **D last**,
and **X2 (re-add CNAME) only at cutover** — never earlier, or Pages claims the apex off v1.

## What I can start on now vs. what's waiting on you

- **Waiting on your values** (then 🛠 same-day): C2 prices, C3 terms date, C4 flash photos/copy,
  C5 og-image, C6 hero clip, C7 logo/icon, and each C1 copy block as you fill `COPY-FOR-ARTIST.md`.
- **Yours alone** (external): O1 inbox, O2 Worker URLs, O3 Pages, O4/O5/O6 verification, all of D.
- **Lowest-friction first move:** O1–O3 (you) unblock the staging email test, while you/the
  artist work the copy sheet — those two tracks run fully in parallel.
