# Newsletter setup

The `/newsletter/` page POSTs signups to a Netlify function
(`netlify/functions/newsletter.js`), which adds the subscriber to a **Resend
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

- **Single opt-in.** Resend Audiences has no native double opt-in, so the consent
  checkbox on the form is the record of consent. If you later want double opt-in
  (a confirmation email before a subscriber is active), that's an add-on: send a
  tokenised confirm link and only flip `unsubscribed:false` once it's clicked.
- **Sending the newsletter** itself is done from Resend (Broadcasts), not from
  this site. This setup only captures subscribers.
- **Unsubscribes** are handled by Resend's unsubscribe link in broadcasts; no
  extra work here.
