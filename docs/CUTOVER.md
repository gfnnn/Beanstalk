# v2 launch — go-live & apex cutover runbook

The launch-day script for moving `beansprout.ink` from **v1** (`gfnnn/beansprout`) to
**v2** (this repo). It is version-controlled so the sequence is **rehearsed and
reversible**, with an explicit go/no-go gate and a rollback to v1.

This is the **procedure and the state tracker** — tick the boxes here as you go.
Architecture/guardrails are in [`CLAUDE.md`](../CLAUDE.md), the email round-trip is the
"run b" acceptance test in Phase 3 below, data/erasure is
[`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md).

**Owner:** 👤 the operator runs every step (settings, secrets, the go/no-go call). 🛠 the
code actions are the release PR (R1) and the `CNAME` commit (X2). Nothing runs itself.

**Status:** `live` — `beansprout.ink` has been served by v2 since **2026-11-15 16:10 UTC**
(the handover took three seconds; the certificate carried over, so there was no HTTPS wait;
the CDN kept v1's cached homepage for about six minutes). The automated probe passes on the
apex. Still open: the manual email test (run "b"), production analytics (X7b) and Phase 5.

> `apps/web/public/CNAME` is now committed, so **every** build is a production build —
> including the Cloudflare Pages staging build from `develop` (`CLAUDE.md` → *SEO structure*).

---

## How the switch actually works (read first)

**v1 is already on GitHub Pages, on the same account.** DNS for the apex already points at
GitHub (apex `A` → `185.199.108–111.153`, `www` `CNAME` → `gfnnn.github.io`), and GitHub
routes the domain to whichever repo **claims it as its Pages custom domain** — today that's
`gfnnn/beansprout` (legacy branch build, a `CNAME` file on `main`, cert valid to Jan 2027).

So **the cutover is not a DNS change.** It's a custom-domain handover between two repos:

1. release `beansprout.ink` from v1's Pages settings, then
2. claim it in v2's Pages settings.

Consequences:
- **No TTL lowering, no GoDaddy A-record edits.**
- **Downtime is the gap between the two clicks** (seconds) plus HTTPS certificate
  re-issue for v2 (usually minutes, can be up to an hour; HTTP serves meanwhile). Do it at
  a quiet hour.
- **Rollback is the same handover in reverse** — just as quick, no propagation wait.
- **v2 deploys through Actions, so GitHub ignores the `CNAME` *file* for routing.** The
  custom domain **must** be set in v2's Pages settings (step X5). The file still matters:
  it's what flips the build to production mode (`isProductionBuild()` in
  `apps/web/src/build/seo.js` — indexable pages, real `robots.txt` + `sitemap.xml`).

---

## Phase 0 — Prep (any time before launch day, no visitor impact)

- [x] **P1 · Verify `beansprout.ink` on the GitHub account** (👤) — ✅ 2026-11-15; keep the TXT record. GitHub →
      Settings → Pages → *Add a domain* → add the `_github-pages-challenge-gfnnn` TXT record
      at GoDaddy → *Verify*. This is the only DNS edit, and it stops anyone else's repo
      claiming the domain in the seconds it's unclaimed during the handover.
- [x] **P2 · Confirm D1 migrations are applied** (👤) — ✅ 2026-11-15. `0002` and `0003` had
      never been applied to the remote database (the first tables were created outside
      Wrangler); all three are now applied and recorded.
      `npx wrangler d1 migrations list beansprout --remote --config apps/functions/wrangler.toml`
      says none to apply.
- [x] **P3 · Take a D1 export** — skipped 2026-11-15: the database holds test submissions
      only. The monthly off-platform export (`DATA-COMPLIANCE.md` → *Backup & recovery*)
      starts once real enquiries arrive.
- [x] **P4 · Resend capacity** — ✅ 2026-11-15, free plan (3,000/month, 100/day). Each submission now sends **two** emails (artist
      notification + sender receipt), and the daily ceiling defaults to 45 submissions. On
      Resend's free tier (100/day) that's fine for launch; raise `RATE_MAX_PER_DAY` only on
      a paid plan.
- [x] **P5 · Set `SMOKE_SITE_URL`** (repo Actions variable) — ✅ 2026-11-15, set to the staging
      URL and the daily health check ran green; switch it to `https://beansprout.ink` in Phase 5.
- [x] **P6 · Gmail "Send mail as" `roxy@beansprout.ink`** (`EMAIL-DOMAIN-SETUP.md`) — ✅ 2026-11-15, so manual replies
      are DKIM-aligned from day one.

---

## Phase 1 — Pre-flight go/no-go gate

Run the day before. **Every line must be green, or explicitly waived by the operator
(record the waiver privately — not in this public repo or its PRs).** If any is red and not waived → NO-GO.

### Engineering (all ✅ on `develop` as of 2026-11-14)
- [x] `npm test` green, `npm run build` succeeds, `npm run lint` clean, on the release commit.
- [x] `npm run smoke -- https://beanstalk-e61.pages.dev` → all checks pass.
- [x] `PAYMENTS_ENABLED` is unset/`false` on the Worker (smoke asserts `/checkout` → 503).
      Payments are a **separate post-launch step**.
- [x] Worker CORS already allows `https://beansprout.ink` + `https://www.beansprout.ink`
      (`apps/functions/src/lib/http.js`) — read-only check.

### Privacy & email
- [x] ICO reference `ZC165794` renders on staging `/privacy/` (✅ applied).
- [x] Erasure path dry-run done (✅ 2026-06-08).
- [ ] `beansprout.ink` shows **Verified** in Resend (SPF/DKIM/DMARC) — needed before X4.

### Content — the MVP gate (operator go/no-go)

The original gate (copy grep at zero, all flash art, a hero clip) no longer matches the MVP:
flash is held back (`live: false` in `flash.js` hides and redirects `/flash/`), the heroes use
portfolio stills, and `og-image.jpg` is a strip of real pieces. Proposed MVP gate:

| Item | Status | Go-live needs |
|---|---|---|
| Hero media | ✅ stills (`media.js`, `kind: 'image'`) | nothing |
| `og-image.jpg` | ✅ real pieces | nothing |
| Flash page | held back (`live: false`) | nothing — FLASH-* markers don't face visitors |
| Optional slots (ABOUT-04, HOME-08/10, DATA-MEDIA, DATA-TEST) | off / hidden | nothing |
| **PRIV-01..05, TERMS-01..03** | pending legal review | 👤 **decide:** legal review before launch, or launch on the current text and review after |
| **ENQ-06 / ENQ-07** (enquiry hints, consent wording) | ✅ approved by the artist (2026-11-15) | nothing |
| Deposit wording on `/services/` | ✅ now "Deposit paid by · Bank transfer" (2026-11-15) | nothing |
| Homepage "Bookings" notice | ✅ switched off (`homepage.js`, 2026-11-15) | nothing |
| One-word portfolio titles / alt text | open | nice-to-have; fine to fix after launch |

Visitor-facing gate command (excludes the held-back/off slots):
```bash
grep -rn "pending approval" apps/web/ --exclude-dir=dist --exclude-dir=node_modules \
  | grep -v -E "FLASH-|ABOUT-04|HOME-08|HOME-10|DATA-MEDIA|DATA-TEST"
```
Zero lines = content green. Any remaining line must be fixed or waived by the operator.

The `ARTIST-COPY` markers themselves need no manual strip: the production build removes them
from the shipped HTML (`CLAUDE.md` → *Artist-copy markers*), so they stay in the source until
each block is approved. After X2, confirm with
`curl -s https://gfnnn.github.io/Beanstalk/ | grep -c ARTIST-COPY` → `0`.

### Abort conditions
NO-GO if: any engineering check is red; Resend domain unverified; `PAYMENTS_ENABLED` is
`true`; or a visitor-facing content item above is neither green nor waived.

---

## Phase 2 — Release & cutover (launch day)

The release comes first, is checked, and only *then* does the domain move. The first
release since June (GA4 scaffold, confirmation emails, failed-send digest cron, MVP heroes,
flash hold-back, ICO number, …) went out on 2026-11-14, so R1/R2 are ticked. Anything merged
to `develop` since then rides along with the X2 release — re-run R2 after it.

**Run the steps in the order listed.** The labels (R1, X2, X4, …) are stable IDs that other
docs and commits cite, not a sequence.

- [x] **R1 · Release PR `develop → main`** (🛠 + 👤 review) — ✅ 2026-11-14 (#251). `gh pr create --base main --head
   develop --title "release: <date> — v2 go-live"`, review the combined diff, **merge-commit**
   (not squash). This deploys:
   - the web build to `https://gfnnn.github.io/Beanstalk/` (still staging mode, noindex), and
   - the Worker via Cloudflare Workers Builds (`wrangler deploy`), which also registers the
     08:00 UTC failed-send digest cron.
   Watch both deploys go green (Actions tab; Cloudflare → Workers → Deployments).
- [x] **R2 · Smoke the Worker after its deploy** — ✅ 2026-11-14, 18/18:
   `npm run smoke -- https://beanstalk-e61.pages.dev` (still uses the same Worker).
- [x] **X2 · Add `apps/web/public/CNAME` = `beansprout.ink`** (🛠) — ✅ 2026-11-15, via a one-line PR to
   `develop` → a second small release PR to `main`. Pages redeploys in **production mode**
   (indexable, real sitemap). It's still only served at `gfnnn.github.io/Beanstalk/` at this
   point; v1 still owns the apex.
- [x] **X4 · Flip the Worker email secrets test → prod** (👤) — ✅ 2026-11-15: `FROM_EMAIL` =
   `roxy@beansprout.ink`, `ARTIST_EMAIL` = the artist's Gmail (`wrangler secret put …` or the
   Cloudflare dashboard; saving redeploys). Requires Resend verified. Do it now so the first
   live enquiry uses production mail.
- [x] **X3 · Release the domain from v1** (👤) — ✅ 2026-11-15, via the Pages API (v1's `CNAME` file is still in its repo; harmless while v2 holds the domain): `gfnnn/beansprout` → Settings → Pages → Custom
   domain → **Remove**. (On a branch build this commits the removal of v1's `CNAME` file.)
   *The apex now 404s — go straight to X5.*
- [x] **X5 · Claim the domain in v2** (👤) — ✅ 2026-11-15, Enforce HTTPS on: `gfnnn/Beanstalk` → Settings → Pages → Custom domain
   → `beansprout.ink` → Save. (CLI equivalent:
   `gh api -X PUT repos/gfnnn/Beanstalk/pages -f cname=beansprout.ink`.) Wait for the DNS
   check to pass and the certificate to show provisioned, then tick **Enforce HTTPS**.
- [ ] **X7b · Production analytics** (👤 + 🛠 one line). Create the production GA4 property, run
   its admin setup ([`ANALYTICS.md`](./ANALYTICS.md) → *GA4 admin setup*), paste the `G-…` ID
   into `production.measurementId` in `apps/web/src/data/analytics.js`, ship via a small
   release. Can follow on the same day or later — with no ID the apex sends nothing.

---

## Phase 3 — Smoke test

- [x] **Automated probe** against the live apex — ✅ 2026-11-15, 19/19:
   ```bash
   npm run smoke -- https://beansprout.ink
   ```
   Asserts key pages 200 over HTTPS, CSP + Referrer-Policy present, the apex is **not** a
   noindex build, Worker security headers, `/flash-status` map, `/checkout` → 503, and
   `/enquiry` + `/newsletter` accept (honeypot path — no D1 row, no email). Also check by hand:
   `https://beansprout.ink/robots.txt` allows crawling and `/sitemap.xml` exists, and
   `https://www.beansprout.ink` redirects to the apex.
- [ ] **Manual acceptance — run "b"** (*The end-to-end email test* below). Use
   clearly-marked test submissions; prune them from D1 afterwards.
- [ ] **Analytics** (once X7b is in): Realtime shows `page_view`, `generate_lead`, `sign_up`;
   opting out on `/privacy/` stops all Google requests. Not an abort trigger — fix forward.

### The end-to-end email test (go-live acceptance — run "b" at cutover)

Repeatable test of the full round-trip, against `https://beansprout.ink` with the
production secrets (`FROM_EMAIL=roxy@beansprout.ink`, `ARTIST_EMAIL` = the artist's
Gmail). Every step must pass before the launch is "done" — except step 3, which is
**skipped while flash is held back** (`live: false`) and run when the flash page goes live:

1. **Enquiry → inbox, and a receipt to the sender.** Submit `/enquire/` with 1–2 photos →
   land on `/enquiry-received/`; a "New enquiry — …" email reaches `ARTIST_EMAIL`, photos
   attached, fields laid out; and the address you entered gets the confirmation email (it
   never shows `ARTIST_EMAIL`).
2. **Reply path.** Hit **Reply** — the `To:` is the *enquirer's* address. Send it;
   confirm it arrives. (Replies go out as `roxy@beansprout.ink` via Gmail "Send mail
   as" — `EMAIL-DOMAIN-SETUP.md`.)
3. **Flash claim → inbox** *(skip while flash is held back).* Claim a piece → a
   "Flash claim — …" email arrives and the claimant gets their confirmation; reload the
   grid → the piece reads claimed; a second claim is rejected (409).
4. **Newsletter → Audience.** Sign up → the contact appears in the Resend Audience and
   a row lands in `newsletter_consent`.
5. **Source-of-truth (independent of mail).** D1 console:
   `SELECT id, kind, email, email_status FROM submissions ORDER BY received_at DESC;`
   — each test submission present with `email_status = 'sent'` (persist-before-email
   isolates *send* from *deliver*). A `'failed'` row → `wrangler tail` shows the Resend
   response (usually an unverified domain or bad key).
6. **Deliverability.** Both emails (the artist's notification and the sender's receipt)
   land in the **inbox, not spam**, and Gmail → "Show original" shows `SPF`/`DKIM`/`DMARC` all **PASS**. If it spams, re-check the Resend
   domain verification + DMARC (`EMAIL-DOMAIN-SETUP.md`).

### Abort conditions
Roll back (Phase 4) if: any page is non-200 or HTTPS won't provision within ~1 hour; the apex
serves a noindex build; `/checkout` isn't 503; security `<meta>` missing; or a real enquiry
doesn't arrive (or lands in spam). **Roll back rather than debug on the live apex.**

---

## Phase 4 — Rollback

Same handover in reverse; minutes, no DNS propagation.

1. **Traffic:** `gfnnn/Beanstalk` → Pages → Custom domain → **Remove**; then
   `gfnnn/beansprout` → Pages → Custom domain → `beansprout.ink` → Save (re-commits v1's
   `CNAME`), and re-tick Enforce HTTPS once its cert shows.
2. **Email — only if production sending broke:** set `FROM_EMAIL` / `ARTIST_EMAIL` back to
   their test values.
3. **Build mode:** revert the X2 commit (remove `apps/web/public/CNAME`) through
   `develop → main` so the v2 build returns to noindex staging mode.
4. **Data is safe.** D1 is untouched by any of this; enquiries taken during the live window
   are persisted (persist-before-email), and Time Travel covers operator error.

v1 stays **idle, not deleted**, so it's always a working rollback target.

---

## Phase 5 — Post-cutover

- [x] Set `SMOKE_SITE_URL` = `https://beansprout.ink` so the daily health check watches prod — ✅ 2026-11-15.
- [ ] **First day:** the D1 `SELECT` from run "b" shows real enquiries with
      `email_status = 'sent'`; no failed-send digest email arrives at 08:00 UTC.
- [ ] **Search Console:** add the `beansprout.ink` property and submit `/sitemap.xml`.
- [ ] **Keep v1 idle 1–2 weeks**, then archive `gfnnn/beansprout` (and disable its Pages).
- [ ] **DMARC:** after a few clean weeks of reports, tighten `p=none` → `quarantine`
      (`EMAIL-DOMAIN-SETUP.md`).
- [ ] Deferred, not part of this cutover: flash goes live (`live: true` once a real drop is
      in); payments (`PAYMENTS_ENABLED` + live Stripe keys, [`PAYMENTS.md`](./PAYMENTS.md)).
