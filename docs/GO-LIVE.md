# Go-live tracker — the remaining actions only

The **working tick-list** for launching Beansprout v2 onto the apex `beansprout.ink`.
This is intentionally *just what's left* — every shipped/closed item and the whole
post-launch backlog live in [`ROADMAP.md`](./ROADMAP.md); this page is the short list we
work through to launch. When an item lands, tick it here and reflect it in `ROADMAP.md`.

**Verified against the codebase on 2026-06-08** — counts and states below are real
(not assumed): `npm test` = **620 pass**, CNAME absent (staging posture intact), 28
portfolio photos in, 12 flash pieces still placeholder. The **Round-1 copy pass** (#155)
applied the artist's reviewed words + the global tone/style/fact decisions; the **68
`ARTIST-COPY` markers are still in source** and need flipping→`approved` + stripping (the
remaining copy step), so the gate count below hasn't moved yet.

Owners: 👤 **YOU** (external accounts / DNS / dashboards / sign-off) · 🛠 **CODE**
(I do it in-repo via PR — most need a value from you first).

---

## The two hard blockers (everything else is operational)

1. **GDPR retention/erasure** — ✅ **cleared** (12-month retention + delete-by-email SQL
   runbook in `DATA-COMPLIANCE.md`; privacy page matches). Only a *dry-run* remains (O5).
2. **Real copy + images** — ⏳ **the live blocker.** The Round-1 copy pass (#155) landed
   the artist's reviewed words + confirmed facts (pricing, deposit, touch-up/reschedule
   windows, the three **fine line · high detail · realism** style categories) for the
   checklist **up to enquiries**; the `ARTIST-COPY` markers still need flipping/stripping.
   Still open: **12 flash pieces are placeholder art**, the **hero clip / og-image / logo**,
   and the sections after *enquire* (hours, reply time, flash data, legal numbers). This is
   the bulk of the work below (C1–C9).

---

## A. Content & copy sign-off  (👤 supply values → 🛠 I apply)

The gate for copy is one command reaching zero: `grep -rn "pending approval" apps/web/`
(still **68**, across 22 files — the Round-1 pass applied the artist's words but the markers
haven't been flipped/stripped yet). The artist fills in [`COPY-FOR-ARTIST.md`](./COPY-FOR-ARTIST.md);
I apply each to source and flip/clear its `ARTIST-COPY · <REF>` marker.

- [~] **C1 · Copy approval (umbrella)** — **Round 1 applied (#155):** the artist's reviewed
      words + the global tone/style/fact decisions are in source for the checklist **up to
      enquiries** (HOME, ABOUT, SERV, FAQ, AFTER, FLASH copy, ENQ, PORT styles, SHARED tagline/
      CTA), incl. "custom"→"bespoke", botanical/illustrative removed, the three style
      categories, and em dashes stripped from visible copy. **Remaining:** flip those markers
      `pending approval`→`approved` + strip the `ARTIST-COPY` comments, and review the
      still-pending refs (VISIT hours, PRIV/TERMS legal, NL, CONFIRM voice, PIECE, BUS
      reply-time, PORT piece names, flash data). `pending approval` = **68** until the flip.
- [x] **C2 · Services prices** (`SERV-02/03`) — ✅ confirmed + applied (#155): **£80 /
      £120–£200 / £300 / £500** (min / small / half-day / full-day), a **flat 50% deposit**,
      **48h** reschedule, **one-year** touch-up. `/enquire/` budget bands mirror them.
- [~] **C3 · Terms/privacy effective date + legal review** (`TERMS/PRIV`) — deposit figures
      now match `/services/` (flat 50%) and the **effective date is approved** ("June 2026").
      **Open:** the **ICO public registration reference** (ZA###### — held until confirmed; the
      account/cert number must never be published), the **tattoo-registration number** (TBC),
      and a professional review of the wording.
- [ ] **C4 · Flash art + copy** — all **12** pieces in `flash.js` are `img: null` (line-art
      glyphs; titles/specs/prices placeholder). 👤 supply photos + real copy → 🛠 add to
      `flash.js` + drop files in `public/images/flash/`. *(In #155 the homepage flash-day
      notice now reads "26 July" and the one stray "Botanical" spec label was removed.)*
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
- [x] **O5 · Erasure runbook dry-run** — ✅ **done** (2026-06-08, D1 console). Access `SELECT`
      returned the test rows (1 flash + 2 enquiries), each `email_status='sent'` (also satisfies
      O4's source-of-truth check); the 12-month prune **preview** correctly returned **0 rows**
      (nothing aged past the window). Both the access and retention paths proven safe; the erasure
      `DELETE` shares the same `WHERE`, so it's validated by extension.
      *Residual (👤, not a launch blocker): set a quarterly prune reminder.*
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

- **Waiting on your values** (then 🛠 same-day): C4 flash photos/copy, C5 og-image, C6 hero
  clip, C7 logo/icon, the **ICO public reference** (C3), the still-pending copy refs (VISIT
  hours, reply time, portfolio piece names, NL, CONFIRM), and the marker flip/strip for the
  Round-1 copy that's already applied (C1).
- **Yours alone** (external): O1 inbox, O2 Worker URLs, O3 Pages, O4/O5/O6 verification, all of D.
- **Lowest-friction first move:** O1–O3 (you) unblock the staging email test, while you/the
  artist work the copy sheet — those two tracks run fully in parallel.
