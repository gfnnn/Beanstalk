# Forms — setup & configuration

How the **enquiry form** and the **flash-claim form** deliver submissions to the
artist's inbox, and the steps to switch them on. Architecture you chose: **site
on GitHub Pages, one function on Netlify, email via Resend, sending as
`Beansprout <roxy@beansprout.ink>`.**

```
Visitor submits a form (beansprout.ink / GitHub Pages)
      │  fetch() POST — JSON { kind, fields, images[] }   ← images downscaled in the browser
      ▼
Netlify function  (apps/functions/netlify/functions/enquiry.js)   ← handles both enquiry + flash
      │  validates · builds the email · attaches images
      ▼
Resend API  →  artist's inbox   (formatted email, reply-to = the visitor)
```

Running cost at studio volumes: **£0/month** (Netlify free functions + Resend free tier + GitHub Pages).

---

## What's already wired in the code

| File | Role |
|------|------|
| `apps/functions/netlify/functions/enquiry.js` | Serverless handler for **both** forms (`kind: enquiry` / `flash`) — validates, emails via Resend, attaches images |
| `apps/functions/netlify/functions/_shared.js` | Shared origin-locked CORS + per-IP/daily rate limiting (used by the enquiry **and** newsletter functions) |
| `netlify.toml` | Scopes Netlify to the `apps/functions` workspace (functions-only deploy); CORS is set in the function, not here |
| `apps/web/src/js/modules/config.js` | Shared function URL both forms POST to |
| `apps/web/enquire/index.html` · `apps/web/src/js/modules/enquire.js` | Enquiry form — JS-driven (Formspree removed), honeypot, **downscales images** |
| `apps/web/flash/index.html` · `apps/web/src/js/modules/flash.js` | Flash-claim form — same pipeline (Formspree removed), honeypot |
| `apps/web/enquiry-received/index.html` | Success page the enquiry form redirects to |
| `.github/workflows/deploy-web.yml` | Builds the site → GitHub Pages (optional, see Part C) |
| `.env.example` | Template for the build-time + function variables |

There are **3 secrets to set** (all on free accounts) and **1 URL to paste back**. That's it.

---

## Part A — Resend (sending the email)

1. Sign up at **https://resend.com** (free: 3,000 emails/month).
2. **API Keys → Create** → copy the key (starts with `re_`). Keep it for Part B.
3. **Domains → Add Domain → `beansprout.ink`.** Resend shows a set of DNS records
   (an `MX` + `TXT` for the sending subdomain, a DKIM `TXT`, usually a DMARC `TXT`).
4. Add those records at whoever manages `beansprout.ink`'s DNS, then click
   **Verify** in Resend (usually green within ~10 min, sometimes up to an hour).
   - ⚠️ Until the domain is **verified**, sends will be rejected. If you want to
     smoke-test before DNS is done, temporarily use `onboarding@resend.dev` as
     `FROM_EMAIL` — but Resend will only deliver it to *your own Resend-account
     email*, so set `ARTIST_EMAIL` to that address during that test.

You'll end up with: `RESEND_API_KEY`, a verified `FROM_EMAIL`
(`roxy@beansprout.ink`), and `ARTIST_EMAIL` (wherever the artist reads mail).

> **`ARTIST_EMAIL` must be a real inbox.** Resend only *sends* — it gives you no
> mailbox, so a bare `@beansprout.ink` address won't *receive* anything unless
> forwarding is set up. The recommended setup forwards the domain addresses to a
> Gmail account (and replies as the domain) — see **`EMAIL-DOMAIN-SETUP.md`**.
> Point `ARTIST_EMAIL` at that Gmail (most reliable, no extra hop) and keep
> `FROM_EMAIL` as `roxy@beansprout.ink`.

---

## Part B — Netlify (running the function)

1. Log in at **https://netlify.com** → **Add new site → Import an existing
   project → GitHub** → pick `gfnnn/beanstalk`.
2. Build settings are read from `netlify.toml` (build `npm run build`, publish
   `dist`) — just click **Deploy**. The `netlify.app` URL becomes a working
   mirror; `beansprout.ink` stays the real site.
3. **Site configuration → Environment variables → Add a variable** (add all three):

   | Key | Value |
   |-----|-------|
   | `RESEND_API_KEY` | `re_…` from Part A |
   | `ARTIST_EMAIL`   | the real inbox submissions land in — Roxy's Gmail (see `EMAIL-DOMAIN-SETUP.md`) |
   | `FROM_EMAIL`     | `roxy@beansprout.ink` (or `onboarding@resend.dev` while testing) |

4. **Deploys → Trigger deploy → Deploy site** so the function picks up the vars.
5. Copy your function URL — it's:

   ```
   https://<your-netlify-subdomain>.netlify.app/.netlify/functions/enquiry
   ```

---

## Part C — Connect the form & deploy the site

The form needs to know the function URL **at build time** (Vite bakes it in).

1. Set `VITE_ENQUIRY_FN_URL` to the URL from Part B, step 5. Two ways:
   - **GitHub Actions deploy (recommended):** repo **Settings → Secrets and
     variables → Actions → Variables → New variable** →
     `VITE_ENQUIRY_FN_URL` = the function URL. Then **Settings → Pages → Source =
     "GitHub Actions"**. Every push to `main` now builds + deploys automatically.
   - **Building yourself:** put it in a local `.env` (copy from `.env.example`),
     run `npm run build`, and publish `apps/web/dist/` however you currently do.
   - *(Or skip the env var and hardcode the URL in the `ENQUIRY_FN_URL` fallback
     in `apps/web/src/js/modules/config.js`.)*
2. **Apex domain is deferred — do not switch it yet.** `beansprout.ink` is still
   served by the **v1** site; v2 lives at `beansprout.netlify.app` (plus the Pages
   project URL). There is intentionally **no `public/CNAME`** and no apex A-record
   for v2 — adding one would take the live site down. Test on the `netlify.app`
   mirror for now, and switch the apex to v2 only once the copy and real images are
   done (see the deploy guardrail in `CLAUDE.md`). The site uses root-absolute
   paths, so when you do switch it must be served from the domain root.
3. Deploy. Done.

> Until `VITE_ENQUIRY_FN_URL` is set, submitting shows *"The enquiry form isn't
> connected yet"* instead of sending — a deliberate guard so a half-configured
> form never silently drops an enquiry.

---

## Part D — Test it end to end

1. Open `https://beansprout.ink/enquire/` (or the `netlify.app` mirror).
2. Complete all four steps, attach 1–2 photos, submit.
3. You should land on **/enquiry-received/** and the email should hit
   `ARTIST_EMAIL` within seconds, with the photos attached. Hit **reply** — it
   goes straight to the enquirer.
4. Then test the **flash claim**: open `/flash/`, click a piece's claim button,
   fill the modal, submit. A "Flash claim — …" email should arrive the same way.
5. If something's off, check **Netlify → Functions → enquiry → Logs**.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "isn't connected yet" message | `VITE_ENQUIRY_FN_URL` not set at build | Set it (Part C) and rebuild |
| CORS error in console | Function URL typo / not deployed | Re-check the URL; confirm the Netlify deploy succeeded |
| "form isn't configured yet" (500) | A Netlify env var is missing | Add all three vars, redeploy |
| Email never arrives (502) | Domain not verified, or bad API key | Verify domain in Resend; re-check `RESEND_API_KEY` |
| Images missing / 413 | Too many / too large | Limit is 8 images, ~5 MB total *after* downscaling |

---

## Notes

- **Image handling.** Photos are downscaled in the browser (long edge ≤ 1600px,
  JPEG) before upload, so several phone photos comfortably fit under Netlify's
  ~6 MB request cap. HEIC files that the browser can't decode are sent as-is and
  capped at 8 MB each. Limits live at the top of the submit block in
  `enquire.js` and are re-checked server-side in `enquiry.js`.
- **Spam & abuse.** A hidden honeypot field (`_gotcha`) silently drops bot
  submissions, and the function is origin-locked (CORS allowlist) with per-IP and
  global-daily rate limiting (`_shared.js`; tunable via the `RATE_*` vars in
  `.env.example`, state in Netlify Blobs, fails open). No paid CAPTCHA needed. If
  spam ever still becomes a problem, add Netlify's form spam filtering or hCaptcha.
- **Field → email mapping.** Each form's layout (required fields, email sections,
  subject) lives in the `FORMS` map in `enquiry.js` — `enquiry` and `flash`. If
  you rename a form field's `name`, update its entry there so it still shows up.
- **Submissions are persisted, then emailed.** Every valid submission is written
  to a Netlify Blobs `submissions` store (keyed `enquiry/…` or `flash/…`, with an
  `emailStatus` of `sent`/`failed`) **before** the Resend call — so an enquiry
  survives a mail-provider outage and is recoverable, rather than silently lost.
  Image bytes are not stored, only their count/names. Persistence is best-effort
  and fails safe (a Blobs outage never blocks a real enquiry).
- **⚠ GO-LIVE BLOCKER — retention/erasure for the `submissions` store.** Those
  records can contain special-category data (allergies, DOB). Before go-live this
  store **must** have a concrete retention period and a working erasure path
  (delete-by-key), and the privacy page must state both, so a UK-GDPR erasure
  request can actually be honoured. Tracked in `privacy/index.html` ("How long we
  keep it") — do not point the apex (`beansprout.ink`) at this site until it's done.
- **No secrets in the repo.** Keys live only in Netlify; `.env` is gitignored.
