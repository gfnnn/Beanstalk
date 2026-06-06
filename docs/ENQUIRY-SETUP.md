# Forms — setup & configuration

How the **enquiry form** and the **flash-claim form** deliver submissions to the
artist's inbox, and the steps to switch them on. Architecture: **site on GitHub
Pages, one Cloudflare Worker (+ D1) handling the forms, email via Resend, sending
as `Beansprout <roxy@beansprout.ink>`.**

```
Visitor submits a form (beansprout.ink / GitHub Pages)
      │  fetch() POST — JSON { kind, fields, images[] }   ← images downscaled in the browser
      ▼
Cloudflare Worker  (apps/functions/src/handlers/enquiry.js)   ← handles enquiry + flash
      │  validates · reserves flash piece (D1) · persists (D1) · builds the email
      ▼
Resend API  →  artist's inbox   (formatted email, reply-to = the visitor)
```

Running cost at studio volumes: **£0/month** (Cloudflare Workers + D1 free tiers +
Resend free tier + GitHub Pages). Unlike the previous host, Cloudflare's free tier
does not pause the project when a monthly credit runs out.

---

## What's already wired in the code

| File | Role |
|------|------|
| `apps/functions/src/index.js` | Worker entry — routes `/enquiry`, `/newsletter`, `/flash-status` |
| `apps/functions/src/handlers/enquiry.js` | Handler for **both** forms (`kind: enquiry` / `flash`) — validates, emails via Resend, attaches images |
| `apps/functions/src/lib/db.js` | D1 storage: persistence, rate limiting, flash inventory (fail-safe/open) |
| `apps/functions/src/lib/http.js` | CORS allowlist, JSON replies, anti-spoof client IP, Request→event adapter |
| `apps/functions/migrations/0001_init.sql` | D1 schema |
| `apps/functions/wrangler.toml` | Worker name, D1 binding, vars |
| `apps/web/src/js/modules/config.js` | The Worker URLs the forms POST to (set via `VITE_*_FN_URL`) |

There are **3 secrets to set** (all on free accounts) and **1 URL to paste back**. That's it.

---

## Part A — Resend (sending the email)

1. Sign up at **https://resend.com** (free: 3,000 emails/month).
2. **API Keys → Create** → copy the key (`re_…`). Keep it for Part B.
3. **Domains → Add Domain → `beansprout.ink`.** Add the DNS records Resend shows
   (MX + TXT for the sending subdomain, DKIM TXT, usually DMARC) at GoDaddy, then
   **Verify**. Until verified, sends are rejected.
   - To smoke-test before DNS is done, temporarily use `onboarding@resend.dev` as
     `FROM_EMAIL` — but Resend only delivers it to *your own Resend-account email*,
     so set `ARTIST_EMAIL` to that address during that test.

You'll end up with `RESEND_API_KEY`, a verified `FROM_EMAIL` (`roxy@beansprout.ink`),
and `ARTIST_EMAIL` (`roksanaklaudia.z@gmail.com` — where the artist reads mail; see
`EMAIL-DOMAIN-SETUP.md`).

---

## Part B — Cloudflare (running the Worker + D1)

One-time, from `apps/functions/`:

```bash
npm i -g wrangler
wrangler login                          # opens the browser to authorise
wrangler d1 create beansprout           # prints a database_id
#   → paste that id into wrangler.toml  (d1_databases.database_id)
wrangler d1 migrations apply beansprout # creates the tables (--remote for prod)
```

Set the server-side secrets (not committed):

```bash
wrangler secret put RESEND_API_KEY      # paste the re_… key
wrangler secret put ARTIST_EMAIL        # roksanaklaudia.z@gmail.com
wrangler secret put FROM_EMAIL          # roxy@beansprout.ink (or onboarding@resend.dev while testing)
wrangler secret put RESEND_AUDIENCE_ID  # the newsletter Audience id (see NEWSLETTER-SETUP.md)
```

Deploy:

```bash
wrangler deploy                         # prints the Worker URL
```

Your routes are then:

```
https://beansprout-forms.<your-subdomain>.workers.dev/enquiry
                                                      /newsletter
                                                      /flash-status
```

> **Auto-deploy via Cloudflare Workers Builds (browser, recommended).** Instead of
> running `wrangler deploy` by hand, connect the Worker to this repo: Worker →
> **Settings → Build → Connect to Git** → pick the repo, then in **Build
> configuration** set:
> - **Root directory = `/`** — the repo root. This is an npm-workspaces monorepo
>   with a single `package-lock.json` at the root, and Cloudflare runs `npm ci`
>   there; pointing the root at `apps/functions` makes `npm ci` fail (no lockfile).
> - **Deploy command** `npx wrangler deploy --config apps/functions/wrangler.toml`
> - **Version command** `npx wrangler versions upload --config apps/functions/wrangler.toml`
>   (used on non-`main` branches for a preview)
>
> wrangler resolves `main`/`migrations` relative to the config file, so `--config`
> makes it find `apps/functions/src/index.js`. A push to `main` then deploys
> automatically. Set the runtime secrets (above) on the Worker's **Settings →
> Variables and Secrets** as encrypted **Secret**s — `wrangler deploy` preserves
> them across builds. The D1 schema is created once via the **D1 → Console** (paste
> `migrations/0001_init.sql`) or `wrangler d1 migrations apply beansprout --remote`.

---

## Part C — Connect the form & deploy the site

The form needs the Worker URL **at build time** (Vite bakes it in).

1. Set the build-time vars to your Worker URL from Part B:
   - **GitHub Actions deploy (recommended):** repo **Settings → Secrets and
     variables → Actions → Variables** → add `VITE_ENQUIRY_FN_URL`,
     `VITE_NEWSLETTER_FN_URL`, `VITE_FLASH_STATUS_FN_URL` (each the matching route).
     Then **Settings → Pages → Source = "GitHub Actions"**. Every push to `main`
     builds + deploys.
   - **Building yourself:** put them in a local `.env` (copy from `.env.example`),
     run `npm run build`, publish `apps/web/dist/`.
2. **Apex domain is deferred — do not switch it yet.** `beansprout.ink` is still
   served by **v1**; v2 lives on the Pages project URL. There is intentionally **no
   `public/CNAME`** until cutover (see `ROADMAP.md` → Go-live plan, Phase 6, and the
   guardrail in `CLAUDE.md`). The CORS allowlist in `src/lib/http.js` already permits
   `beansprout.ink`, `www.beansprout.ink`, the GitHub Pages origin, and localhost.
3. Deploy. Done.

---

## Part D — Test it end to end

**Locally (no cloud needed, no credits used):**

```bash
# Terminal 1 — the Worker, with secrets in apps/functions/.dev.vars (gitignored):
cd apps/functions && wrangler dev          # http://localhost:8787
# Terminal 2 — the site, pointed at the local Worker:
#   apps/web/.env → VITE_*_FN_URL=http://localhost:8787/<route>
npm run dev                                # http://localhost:5173
```

`wrangler dev` gives you a local D1, so persistence + flash state work. Open
`localhost:5173/enquire/`, complete all four steps, attach 1–2 photos, submit → you
land on **/enquiry-received/** and the email hits `ARTIST_EMAIL` within seconds with
the photos attached. Hit **reply** — it goes to the enquirer. Then test the **flash
claim** (`/flash/`) and the **newsletter** (`/newsletter/`).

**Deployed:** same flow against the Pages site + the deployed Worker. Logs:
`wrangler tail` (live) or the Cloudflare dashboard → Workers → Logs.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "isn't connected yet" / 500 | `VITE_ENQUIRY_FN_URL` not set, or a Worker secret missing | Set the build var (Part C) and the `wrangler secret`s (Part B) |
| CORS error in console | Site origin not in the allowlist | Add it to `ALLOWED_ORIGINS` in `src/lib/http.js`, redeploy |
| Email never arrives (502) | Domain not verified, or bad API key | Verify the domain in Resend; re-check `RESEND_API_KEY` |
| Images missing / 413 | Too many / too large | Limit is 8 images, ~5 MB total *after* downscaling |

---

## Notes

- **Image handling.** Photos are downscaled in the browser (long edge ≤ 1600px,
  JPEG) before upload; HEIC the browser can't decode is sent as-is and capped at
  8 MB. Server-side each file is **type-sniffed by magic bytes** (the client's MIME
  isn't trusted) with request-body and per-image size caps.
- **Spam & abuse.** A hidden honeypot (`_gotcha`) silently drops bots; the Worker is
  origin-locked (CORS allowlist) with per-IP + global-daily rate limiting (state in
  D1, **fails open** — a DB outage never blocks a real enquiry). Tunable via the
  `RATE_*` vars.
- **Persisted, then emailed.** Every valid submission is written to the D1
  `submissions` table (with `email_status`) **before** the Resend call — so an
  enquiry survives a mail-provider outage and is recoverable. Image bytes are not
  stored, only count/names.
- **Retention/erasure (GDPR).** The `submissions` table can hold special-category
  data (health). Retention period + erasure path are documented in
  **`DATA-COMPLIANCE.md`** (plain SQL via `wrangler d1 execute`).
- **No secrets in the repo.** Keys live only in Cloudflare (Worker secrets); `.env`
  and `.dev.vars` are gitignored.

---

## Form UX — validation timing & field limits

The four-step enquiry form (`apps/web/src/js/modules/enquire.js`,
markup in `apps/web/enquire/index.html`) follows a deliberate **"reward early,
punish late"** contract. It's easy to undo by accident, so it's written down here —
change the behaviour *and* this note together.

- **Never nag before the first Continue.** A field only starts live-validating
  **after** it has been flagged once (a failed Continue/submit sets `data-live` on
  it). Before that, typing is silent.
- **Once flagged, be gentle.** Text-like fields **clear the error the moment you
  type** and are re-judged only on **blur** — so a slow typer or someone obviously
  mid-correction is never scolded character by character. Discrete controls
  (radio / checkbox / date) re-check **on change**, which is what keeps a
  part-ticked consent group correctly red.
- **A failed step takes you to the problem.** A failed Continue/submit **scrolls to
  and focuses the first errored field**, so keyboard and screen-reader users land
  on it directly.
- **Messages are specific and in Roxy's first-person voice.** They distinguish
  "too long" from a stray character, and don't claim "letters only" where hyphens,
  apostrophes and spaces are accepted (names). Keep new messages warm and concrete,
  not generic ("Please fill this in").
- **Character counter is quiet.** A `… characters left` counter appears **only in
  the last quarter** of a field's allowance (≥ 75% full) and emphasises (`.low`)
  with ≤ 40 left — it never clutters an empty field.

**Field limits — two layers (defence-in-depth).** The client `maxlength` keeps real
users comfortably within budget; the Worker **re-clamps every field server-side**
(`clampFields()` in `apps/functions/src/handlers/enquiry.js`) so a direct API call
can't bloat a D1 row or the Resend payload. The Worker cap is intentionally higher
than any single `maxlength` — it's a backstop, not the UX limit.

| Field | Client `maxlength` | Worker clamp |
|-------|-------------------:|-------------:|
| First / last name | 50 each | 2000 (`MAX_FIELD_LEN`) |
| Email | 254 | 2000 |
| Idea / brief (textarea) | 1200 | 2000 |
| Placement | 80 | 2000 |
| Size | 40 | 2000 |
| Allergies (textarea) | 600 | 2000 |
| Additional notes (textarea) | 600 | 2000 |
| Multi-selects (`style[]`, `days[]`, …) | — | 50 items (`MAX_ARRAY_ITEMS`), each clamped to 2000 |

Image caps are separate (8 images, ~5 MB total after downscale, 4 MB per file) —
see **Image handling** above and the constants at the top of `enquiry.js`.
