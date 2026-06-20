# v2 launch — apex cutover runbook

The launch-day operational script for moving `beansprout.ink` from **v1**
(`gfnnn/beansprout`) to **v2** (this repo). It is deliberately version-controlled
(not improvised on the day) so the sequence is **rehearsed and reversible**, with an
explicit go/no-go gate and a documented rollback to v1.

This is the **procedure**. The launch **state / tick-list / owners** live once in
[`ROADMAP.md` → section D](./ROADMAP.md#d-the-apex-cutover--last-only-after-ac-are-green-) — don't
duplicate them here; tick the boxes there as you go. Architecture/guardrails are in
[`CLAUDE.md`](../CLAUDE.md); the email round-trip detail is the "run b" acceptance test
in `ROADMAP.md`; data/erasure is [`DATA-COMPLIANCE.md`](./DATA-COMPLIANCE.md).

**Owner:** 👤 the operator runs every step below (all DNS / secret / flag actions and
the go/no-go call). 🛠 the only code action is the `CNAME` commit (X2). Nothing here
runs itself.

**Status:** `blocked-on-ICO` — do not start Phase 1 until the pre-flight gate is green
(ICO is the long pole, ~2 weeks out as of this writing).

> **Hard guardrail (from `CLAUDE.md`):** until the moment of cutover there is **no
> `apps/web/public/CNAME`**. Re-adding it (X2) is what makes GitHub Pages claim the
> apex — so it happens **in Phase 2 and never earlier**, or Pages steals the apex off
> v1 prematurely.

---

## Phase 1 — Pre-flight go/no-go gate

Run through this the day before. **Every line must be green.** If any is red, the
launch is **NO-GO** — fix it and re-gate; do not start Phase 2.

### Content & privacy gates
- [ ] **ICO registration reference is in the privacy policy.** The ZA###### number is
      published on `/privacy/`. Verify it renders on the live staging build, not just in
      source. *(This is the milestone's blocking dependency — see ROADMAP C3.)*
- [ ] **Copy grep-gate is at zero.** From the repo root:
      ```bash
      grep -rn "pending approval" apps/web/ --exclude-dir=dist --exclude-dir=node_modules
      ```
      No matches = all artist copy signed off. Any match = NO-GO.
- [ ] **Real images are in — no placeholders.** All flash pieces in `apps/web/src/data/flash.js`
      have a real `img` (none `null`); the hero clip is live (`media.js` `show: true`); the
      OpenGraph image (`apps/web/public/images/og-image.jpg`) is the real 1200×630 photo, not
      the committed brand placeholder. *(ROADMAP C4/C5/C6.)*

### Privacy / security gates (before any real data is collected)
- [ ] **Delete-by-email erasure path is proven.** The GDPR delete-by-email runbook has
      been dry-run against D1 (access `SELECT` + prune preview) — see `DATA-COMPLIANCE.md`.
- [ ] **Resend sending domain is verified.** `beansprout.ink` shows verified in Resend
      (SPF/DKIM/DMARC), so production mail from `roxy@beansprout.ink` is DKIM-aligned and
      won't spam. Required before X4 flips the secrets.

### Engineering gates
- [ ] **`npm test` is green** on the commit being released (both workspaces).
- [ ] **`npm run build` succeeds** with the production Worker URLs.
- [ ] **`PAYMENTS_ENABLED` is `false`** (or unset) on the Worker. Payments stay dark
      through launch — turning them on is a **separate post-launch step**, explicitly not
      part of this cutover.
- [ ] **TTL was pre-lowered (X1).** A day ahead, lower the apex `A` / `www` `CNAME` TTL to
      **300 s** at GoDaddy (external DNS, not Cloudflare-proxied) so both cutover *and*
      rollback propagate in minutes.

### Abort conditions for Phase 1
**NO-GO — do not proceed** if any of: the ICO number is missing; the copy grep-gate is
non-zero; any placeholder image remains; the erasure path or Resend domain is unverified;
`npm test` is red; or `PAYMENTS_ENABLED` is `true`. Park the launch and clear the gate.

---

## Phase 2 — Cutover

Two test→prod flips happen together (DNS + email). Do them in this order.

1. **X2 · Add the apex CNAME (🛠 code).** Add `apps/web/public/CNAME` containing
   `beansprout.ink`, land it on `main` via the normal release PR, and let GitHub Pages
   deploy. This flips the build to **production** mode (the noindex/staging switch keys off
   this file — `apps/web/src/build/seo.js` — so the site becomes indexable and emits a real
   sitemap/robots.txt automatically). *Do not point DNS yet.*
2. **X5 · Add the custom domain in Pages.** GitHub repo → Settings → Pages → add
   `beansprout.ink` as the custom domain so Pages provisions the TLS cert. Leave **Enforce
   HTTPS** unchecked until the cert finishes provisioning (next step), then enable it.
3. **X3 · Point DNS at GitHub Pages (👤 GoDaddy).** Apex `A` records → the four GitHub Pages
   IPs; `www` `CNAME` → `<user>.github.io`. **This is the step that moves live traffic off
   v1.** With TTL at 300 s it propagates in minutes.
4. **X5 (cont.) · Enforce HTTPS** in Pages settings once the cert shows provisioned.
5. **X4 · Flip the Worker email secrets test → prod (👤).** Set `FROM_EMAIL` =
   `roxy@beansprout.ink` and `ARTIST_EMAIL` = the artist's Gmail (`wrangler secret put …`, or
   the Cloudflare dashboard). Saving redeploys the Worker. Requires the Resend domain verified
   (Phase 1).
6. **X6 · Verify CORS (👤).** Confirm the Worker's `ALLOWED_ORIGINS` already includes
   `https://beansprout.ink` + `https://www.beansprout.ink` — it does
   (`apps/functions/src/lib/http.js`); this is a read-only verify, no change expected.

---

## Phase 3 — Smoke test

Two layers: the automated probe (every check below in one command) then the manual
acceptance round-trip (real email, which the probe deliberately does not send).

1. **Automated smoke test** — from a clone, against the live apex:
   ```bash
   npm run smoke -- https://beansprout.ink
   # or explicitly: node scripts/smoke-test.mjs https://beansprout.ink \
   #                  --worker https://beansprout-forms.<subdomain>.workers.dev
   ```
   It asserts: key pages 200 over HTTPS; the CSP + Referrer-Policy `<meta>` are present; the
   apex is **not** a noindex staging build; the Worker's JSON security headers are set;
   `GET /flash-status` returns a claims map; `POST /checkout` returns **503** (payments still
   dark); and `/enquiry` + `/newsletter` accept a request. The form checks use the **honeypot
   path** — they prove the routes are live and the production secrets are configured **without
   writing any D1 row or sending any email** (no real PII, no Stripe keys). The script exits
   non-zero on any failure. **Any red check is an abort trigger → Phase 4.**
2. **Manual acceptance — the email round-trip ("run b").** The automated probe can't prove
   deliverability, so run the six-point end-to-end email test from `ROADMAP.md`
   (enquiry → inbox with photos; reply-path = enquirer; flash claim reserves + re-claim 409;
   newsletter → Audience; the D1 source-of-truth `SELECT`; SPF/DKIM/DMARC all PASS, lands in
   inbox not spam). Use clearly-marked test submissions and prune them from D1 afterwards.

### Abort conditions for Phase 3
Roll back (Phase 4) if: any page is non-200 or served without HTTPS; the apex serves a
noindex/staging build; `/checkout` is anything other than 503 (payments must not be live);
the security headers/`<meta>` are missing; or a real enquiry/newsletter does not arrive (or
lands in spam) in the manual round-trip. **Roll back rather than debug on the live apex.**

---

## Phase 4 — Rollback (if the cutover goes wrong)

Every step is reversible; with the TTL pre-lowered to 300 s a revert is minutes. **Roll
back the moment the live apex is broken — don't debug on the live domain.** Reverse in
this order:

1. **DNS first (this moves traffic back).** Restore the apex `A` / `www` `CNAME` at GoDaddy
   to the **v1** target. Traffic returns to the working v1 site within the TTL window.
2. **Email — only if production sending is what broke.** Flip the Worker secrets `FROM_EMAIL`
   / `ARTIST_EMAIL` back to their test values; saving redeploys the Worker.
3. **Pages — stop it claiming the apex.** Revert the X2 commit (remove
   `apps/web/public/CNAME`) so Pages releases the apex and the build reverts to staging mode.
   Remove the custom domain in Pages settings if it was added.
4. **Data is safe.** D1 is untouched by a DNS rollback — any enquiries captured during the
   live window are persisted (persist-before-email), and Cloudflare **Time Travel** covers
   operator error (`DATA-COMPLIANCE.md`). Nothing to restore.

v1 stays **idle, not deleted** (see Phase 5), so it is always a working rollback target.

---

## Phase 5 — Post-cutover

Once the apex is healthy and both smoke layers are green:

- [ ] **Raise the apex DNS TTL back up** (e.g. 3600 s) at GoDaddy now that propagation
      speed is no longer needed.
- [ ] **Keep v1 idle, not deleted, for 1–2 weeks (X8).** It is the rollback target; only
      decommission/redirect it once v2 has been healthy for that window.
- [ ] **Watch for the first day:** check the D1 source-of-truth `SELECT` shows real
      enquiries landing with `email_status = 'sent'`, the inbox is receiving, and deliverability
      stays out of spam.
- [ ] **Tick ROADMAP section D** to record the cutover as done, and move the launch milestone
      to shipped.
- [ ] **Schedule the deferred post-launch steps** (explicitly *not* part of this cutover):
      enabling payments (`PAYMENTS_ENABLED` → `true` + live Stripe keys, see
      [`PAYMENTS.md`](./PAYMENTS.md)) and wiring the analytics vendor
      ([`ANALYTICS.md`](./ANALYTICS.md)).
