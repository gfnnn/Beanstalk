# Newsletter setup

The `/newsletter/` page POSTs signups to the Cloudflare Worker's `/newsletter`
route (`apps/functions/src/handlers/newsletter.js`), which adds the subscriber to a
**Resend Audience**. It reuses the same Resend account and `RESEND_API_KEY` that
already power the enquiry + flash forms — you only need to create an Audience and
tell the Worker its ID.

## One-time setup

1. **Create an Audience** — [resend.com](https://resend.com) → **Audiences** →
   *Create Audience* (e.g. "Beansprout newsletter"). Open it → **Settings** and
   copy the **Audience ID** (a UUID like `78261eea-…`).

2. **Set the secret in Cloudflare** — from `apps/functions/`:

   ```bash
   wrangler secret put RESEND_AUDIENCE_ID    # paste the Audience ID from step 1
   ```

   `RESEND_API_KEY` is already set (shared with the enquiry route). No new key
   needed. (Locally, add it to `apps/functions/.dev.vars` instead.)

3. **Redeploy** so the Worker picks up the new secret: `wrangler deploy` (or just
   push — secrets persist across deploys, so this is only needed the first time).

That's it — the signup form is live. The Worker route is wired via
`VITE_NEWSLETTER_FN_URL` (see `.env.example`), pointing at your
`…workers.dev/newsletter`.

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
  defensible, every accepted signup writes a record to the **`newsletter_consent`**
  D1 table — email, the exact consent wording + its version
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
