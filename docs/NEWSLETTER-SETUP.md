# Newsletter setup

The `/newsletter/` page POSTs signups to a Netlify function
(`apps/functions/netlify/functions/newsletter.js`), which adds the subscriber to a **Resend
Audience**. It reuses the same Resend account and `RESEND_API_KEY` that already
power the enquiry + flash forms — you only need to create an Audience and tell
the function its ID.

## One-time setup

1. **Create an Audience** — [resend.com](https://resend.com) → **Audiences** →
   *Create Audience* (e.g. "Beansprout newsletter"). Open it → **Settings** and
   copy the **Audience ID** (a UUID like `78261eea-…`).

2. **Add the env var in Netlify** — Site configuration → Environment variables →
   *Add a variable*:

   | Key | Value |
   | --- | --- |
   | `RESEND_AUDIENCE_ID` | the Audience ID from step 1 |

   `RESEND_API_KEY` is already set (shared with the enquiry function). No new key
   needed.

3. **Redeploy** so the function picks up the new variable (Deploys → *Trigger
   deploy*, or just push a commit).

That's it — the signup form is live. The function URL is already wired via
`VITE_NEWSLETTER_FN_URL` (see `.env.example`), defaulting to
`https://beansprout.netlify.app/.netlify/functions/newsletter`.

## Test it

- Visit `/newsletter/`, enter an email, tick consent, submit → you should see the
  "You're on the list" panel, and the contact should appear in the Resend
  Audience within a few seconds.
- Submitting the same email again is treated as success (idempotent — the visitor
  is on the list either way).

## Notes

- **Single opt-in, with a consent ledger.** Resend Audiences has no native double
  opt-in, and we deliberately *don't* add one — a confirmation email per signup
  would burn the Resend free-tier quota and isn't legally required (single opt-in
  with clear, recorded consent is lawful under UK GDPR/PECR). To make that
  defensible, every accepted signup writes a record to the **`newsletter-consent`**
  Netlify Blobs store — email, the exact consent wording + its version
  (`CONSENT_VERSION` in `newsletter.js`), timestamp, source, and IP. That's the
  audit trail proving *when* and *to what* each subscriber consented; no email is
  sent. **Bump `CONSENT_VERSION` whenever the consent wording or privacy policy
  changes**, keeping it in step with the label in `apps/web/newsletter/index.html`
  and `src/build/newsletter-inline.js`. If you ever do want double opt-in, it's an
  add-on: send a tokenised confirm link and only flip `unsubscribed:false` once
  it's clicked.
- **Sending the newsletter** itself is done from Resend (Broadcasts), not from
  this site. This setup only captures subscribers.
- **Unsubscribes** are handled by Resend's unsubscribe link in broadcasts; no
  extra work here.
