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

**Status:** `ready-pending-go/no-go` — engineering is green (checked 2026-11-14: 845 web +
235 Worker tests, build, lint, staging smoke 18/18), and the first release to `main` is
done (R1/R2, 2026-11-14). What's left is the content/legal gate in Phase 1, which is the
operator's go/no-go, then the handover from X2 on.

> **Hard guardrail (from `CLAUDE.md`):** until the moment of cutover there is **no
> `apps/web/public/CNAME`**. It lands in Phase 2 and never earlier.

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
- **No TTL lowering, no GoDaddy A-record edits** (the old X1/X3 steps are obsolete).
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

- [ ] **P1 · Verify `beansprout.ink` on the GitHub account** (👤, recommended). GitHub →
      Settings → Pages → *Add a domain* → add the `_github-pages-challenge-gfnnn` TXT record
      at GoDaddy → *Verify*. This is the only DNS edit, and it stops anyone else's repo
      claiming the domain in the seconds it's unclaimed during the handover.
- [ ] **P2 · Confirm D1 migrations are applied** (👤) — from `apps/functions`:
      `npx wrangler d1 migrations list beansprout --remote` should say none to apply
      (0001–0003). The 2026-11-14 release had no schema change.
- [ ] **P3 · Take a D1 export** before the first production release
      (`DATA-COMPLIANCE.md` → *Backup & recovery*). Counts as this month's off-platform export.
- [ ] **P4 · Resend capacity.** Each submission now sends **two** emails (artist
      notification + sender receipt), and the daily ceiling defaults to 45 submissions. On
      Resend's free tier (100/day) that's fine for launch; raise `RATE_MAX_PER_DAY` only on
      a paid plan.
- [ ] **P5 · Set `SMOKE_SITE_URL`** (repo Actions variable) to the staging URL now, so the
      daily health check runs; switch it to `https://beansprout.ink` in Phase 5.
- [ ] **P6 · Gmail "Send mail as" `roxy@beansprout.ink`** (`EMAIL-DOMAIN-SETUP.md`), so manual replies
      are DKIM-aligned from day one.

---

## Phase 1 — Pre-flight go/no-go gate

Run the day before. **Every line must be green, or explicitly waived by the operator
(record the waiver privately — not in this public repo or its PRs).** If any is red and not waived → NO-GO.

### Engineering (all ✅ on `develop` as of 2026-11-14)
- [ ] `npm test` green, `npm run build` succeeds, `npm run lint` clean, on the release commit.
- [ ] `npm run smoke -- https://beanstalk-e61.pages.dev` → all checks pass.
- [ ] `PAYMENTS_ENABLED` is unset/`false` on the Worker (smoke asserts `/checkout` → 503).
      Payments are a **separate post-launch step**.
- [ ] Worker CORS already allows `https://beansprout.ink` + `https://www.beansprout.ink`
      (`apps/functions/src/lib/http.js`) — read-only check.

### Privacy & email
- [ ] ICO reference `ZC165794` renders on staging `/privacy/` (✅ applied).
- [ ] Erasure path dry-run done (✅ 2026-06-08).
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
| **ENQ-06 / ENQ-07** (enquiry hints, consent wording) | pending artist eye | 👤 artist approves, or accept as-is |
| Deposit wording ("Card or bank" vs. email-arranged) | open | 👤 confirm method → 🛠 one-line copy fix |
| Homepage notice | now reads "Books are open." (`homepage.js`) | 👤 confirm it's still true |
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

- [x] **R1 · Release PR `develop → main`** (🛠 + 👤 review) — ✅ 2026-11-14 (#251). `gh pr create --base main --head
   develop --title "release: <date> — v2 go-live"`, review the combined diff, **merge-commit**
   (not squash). This deploys:
   - the web build to `https://gfnnn.github.io/Beanstalk/` (still staging mode, noindex), and
   - the Worker via Cloudflare Workers Builds (`wrangler deploy`), which also registers the
     08:00 UTC failed-send digest cron.
   Watch both deploys go green (Actions tab; Cloudflare → Workers → Deployments).
- [x] **R2 · Smoke the Worker after its deploy** — ✅ 2026-11-14, 18/18:
   `npm run smoke -- https://beanstalk-e61.pages.dev` (still uses the same Worker).
- [ ] **X2 · Add `apps/web/public/CNAME` = `beansprout.ink`** (🛠), via a one-line PR to
   `develop` → a second small release PR to `main`. Pages redeploys in **production mode**
   (indexable, real sitemap). It's still only served at `gfnnn.github.io/Beanstalk/` at this
   point; v1 still owns the apex.
- [ ] **X4 · Flip the Worker email secrets test → prod** (👤): `FROM_EMAIL` =
   `roxy@beansprout.ink`, `ARTIST_EMAIL` = the artist's Gmail (`wrangler secret put …` or the
   Cloudflare dashboard; saving redeploys). Requires Resend verified. Do it now so the first
   live enquiry uses production mail.
- [ ] **X3 · Release the domain from v1** (👤): `gfnnn/beansprout` → Settings → Pages → Custom
   domain → **Remove**. (On a branch build this commits the removal of v1's `CNAME` file.)
   *The apex now 404s — go straight to X5.*
- [ ] **X5 · Claim the domain in v2** (👤): `gfnnn/Beanstalk` → Settings → Pages → Custom domain
   → `beansprout.ink` → Save. (CLI equivalent:
   `gh api -X PUT repos/gfnnn/Beanstalk/pages -f cname=beansprout.ink`.) Wait for the DNS
   check to pass and the certificate to show provisioned, then tick **Enforce HTTPS**.
- [ ] **X7b · Production analytics** (👤 + 🛠 one line). Create the production GA4 property, run
   its admin setup ([`ANALYTICS.md`](./ANALYTICS.md) → *GA4 admin setup*), paste the `G-…` ID
   into `production.measurementId` in `apps/web/src/data/analytics.js`, ship via a small
   release. Can follow on the same day or later — with no ID the apex sends nothing.

---

## Phase 3 — Smoke test

- [ ] **Automated probe** against the live apex:
   ```bash
   npm run smoke -- https://beansprout.ink
   ```
   Asserts key pages 200 over HTTPS, CSP + Referrer-Policy present, the apex is **not** a
   noindex build, Worker security headers, `/flash-status` map, `/checkout` → 503, and
   `/enquiry` + `/newsletter` accept (honeypot path — no D1 row, no email). Also check by hand:
   `https://beansprout.ink/robots.txt` allows crawling and `/sitemap.xml` exists, and
   `https://www.beansprout.ink` redirects to the apex.
- [ ] **Manual acceptance — run "b"** (*The end-to-end email test* below), minus the flash
   claim step while flash is held back. Use clearly-marked test submissions; prune them from
   D1 afterwards.
- [ ] **Analytics** (once X7b is in): Realtime shows `page_view`, `generate_lead`, `sign_up`;
   opting out on `/privacy/` stops all Google requests. Not an abort trigger — fix forward.

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

- [ ] Set `SMOKE_SITE_URL` = `https://beansprout.ink` so the daily health check watches prod.
- [ ] **First day:** the D1 `SELECT` from run "b" shows real enquiries with
      `email_status = 'sent'`; no failed-send digest email arrives at 08:00 UTC.
- [ ] **Search Console:** add the `beansprout.ink` property and submit `/sitemap.xml`.
- [ ] **Keep v1 idle 1–2 weeks (X8)**, then archive `gfnnn/beansprout` (and disable its Pages).
- [ ] **DMARC:** after a few clean weeks of reports, tighten `p=none` → `quarantine`
      (`EMAIL-DOMAIN-SETUP.md`).
- [ ] Deferred, not part of this cutover: flash goes live (`live: true` once a real drop is
      in); payments (`PAYMENTS_ENABLED` + live Stripe keys, [`PAYMENTS.md`](./PAYMENTS.md)).
