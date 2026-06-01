# Forms — setup & configuration

How the **enquiry form** and the **flash-claim form** deliver submissions to the
artist's inbox, and the steps to switch them on. Architecture you chose: **site
on GitHub Pages, one function on Netlify, email via Resend, sending as
`Beansprout <roxy@beansprout.ink>`.**

```
Visitor submits a form (beansprout.ink / GitHub Pages)
      │  fetch() POST — JSON { kind, fields, images[] }   ← images downscaled in the browser
      ▼
Netlify function  (netlify/functions/enquiry.js)   ← handles both enquiry + flash
      │  validates · builds the email · attaches images
      ▼
Resend API  →  artist's inbox   (formatted email, reply-to = the visitor)
```

Running cost at studio volumes: **£0/month** (Netlify free functions + Resend free tier + GitHub Pages).

---

## What's already wired in the code

| File | Role |
|------|------|
| `netlify/functions/enquiry.js` | Serverless handler for **both** forms (`kind: enquiry` / `flash`) — validates, emails via Resend, attaches images |
| `netlify.toml` | Tells Netlify where the function lives + CORS headers |
| `src/js/modules/config.js` | Shared function URL both forms POST to |
| `enquire/index.html` · `src/js/modules/enquire.js` | Enquiry form — JS-driven (Formspree removed), honeypot, **downscales images** |
| `flash/index.html` · `src/js/modules/flash.js` | Flash-claim form — same pipeline (Formspree removed), honeypot |
| `enquiry-received/index.html` | Success page the enquiry form redirects to |
| `.github/workflows/deploy.yml` | Builds the site → GitHub Pages (optional, see Part C) |
| `public/CNAME` | Keeps `beansprout.ink` attached on each Pages deploy |
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
(`roxy@beansprout.ink`), and `ARTIST_EMAIL` (wherever the artist reads mail —
`roxy@beansprout.ink` for now).

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
   | `ARTIST_EMAIL`   | inbox that receives submissions (`roxy@beansprout.ink` for now) |
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
     run `npm run build`, and publish `dist/` however you currently do.
   - *(Or skip the env var and hardcode the URL in the `ENQUIRY_FN_URL` fallback
     in `src/js/modules/config.js`.)*
2. Make sure `beansprout.ink` points at GitHub Pages (the site uses root-absolute
   paths, so it must be served from the domain root — `public/CNAME` is already
   set for this). In repo **Settings → Pages**, confirm the custom domain.
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
- **Spam.** A hidden honeypot field (`_gotcha`) silently drops bot submissions —
  no paid CAPTCHA needed. If spam ever becomes a problem, add Netlify's built-in
  form spam filtering or an hCaptcha.
- **Field → email mapping.** Each form's layout (required fields, email sections,
  subject) lives in the `FORMS` map in `enquiry.js` — `enquiry` and `flash`. If
  you rename a form field's `name`, update its entry there so it still shows up.
- **No secrets in the repo.** Keys live only in Netlify; `.env` is gitignored.
