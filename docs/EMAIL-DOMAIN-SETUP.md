# Email on the `beansprout.ink` domain

How to make `hello@beansprout.ink` and `roxy@beansprout.ink` work as **real email
addresses** — receiving into a Gmail account, and letting Roxy reply *as* the
domain. This is separate from the app's outbound mail (Resend), which is covered
in `ENQUIRY-SETUP.md`.

> **Two different jobs, don't confuse them.**
> - **Sending** as `@beansprout.ink` — done by **Resend** (the Netlify functions,
>   and Roxy's manual replies). Resend is a sending API; it gives you no inbox.
> - **Receiving** at `@beansprout.ink` — done by **forwarding** the addresses to a
>   Gmail account. This is the piece this doc adds.
>
> Until receiving is set up, every `mailto:hello@beansprout.ink` link on the site
> bounces, **and** the app's enquiry emails bounce if `ARTIST_EMAIL` is a
> non-existent `@beansprout.ink` address. So this is required, not cosmetic.

## Won't this clash with the "don't switch the apex" rule?

No. Email uses **MX + TXT** DNS records; the website uses **A/CNAME** records.
They're independent. Setting up email does **not** point `beansprout.ink` at the
v2 site, so the apex guardrail in `CLAUDE.md` is untouched. You only need access
to the domain's DNS zone, and you must not remove any MX the **v1** setup already
relies on (check what's there first).

## The address scheme

| Address | Role | Where it goes |
|---|---|---|
| `hello@beansprout.ink` | Primary **public** contact (every footer, privacy page, 404, …) | Forwards → Roxy's Gmail |
| `roxy@beansprout.ink` | The app's **sending** identity (`FROM_EMAIL`), and the "from" on Roxy's manual replies | Forwards → Roxy's Gmail (so out-of-app replies reach her too) |
| Roxy's Gmail | Where she actually **reads and works** | — |

## Step 1 — Forward the addresses to Gmail

Pick one forwarder and add the DNS records it gives you:

- **Cloudflare Email Routing** (free) — cleanest, but the domain's nameservers
  must be on Cloudflare. Add `hello@` and `roxy@` as routes → Roxy's Gmail; it
  adds the MX records + an SPF `TXT` for you and sends Gmail a verify link.
- **ImprovMX** or **ForwardEmail.net** (free tiers) — work with any DNS host. Add
  their MX records + the SPF `TXT` they specify, then add the two aliases.

Verify by emailing `hello@beansprout.ink` from a phone — it should land in Gmail.

## Step 2 — Let Gmail reply *as* the domain (the deliverability-critical bit)

Forwarding gets mail **in**; by default Gmail still replies **from** the personal
Gmail address. To reply as `roxy@beansprout.ink`, add it under Gmail → **Settings
→ Accounts and Import → "Send mail as" → Add another email address**.

**Send it through Resend's SMTP, not "via Gmail".** The domain has no SMTP of its
own (it's forward-only), and sending a `roxy@beansprout.ink` From header through
Google's servers fails SPF/DKIM alignment → the reply lands in the customer's spam
or is rejected by DMARC. Resend is **already a verified sender for the domain**, so
routing Gmail's send-as through it keeps replies DKIM-signed and inboxing:

- SMTP server: `smtp.resend.com`
- Port: `465` (SSL) or `587` (TLS)
- Username: `resend`
- Password: your `RESEND_API_KEY`

(Manual replies then count against the Resend quota, but reply volume is tiny.)
Optionally set `roxy@beansprout.ink` as the default "from" so every reply uses it.

## Step 3 — Point the app at the inbox

In Netlify → **Site configuration → Environment variables** (these are the only
config touchpoints — no code change):

| Key | Value | Why |
|---|---|---|
| `ARTIST_EMAIL` | Roxy's **Gmail** address | Where enquiries land. Use the raw Gmail (no extra forwarding hop = most reliable delivery). Once Step 1 is confirmed, `hello@beansprout.ink` works too. |
| `FROM_EMAIL` | `roxy@beansprout.ink` | The app's verified sending identity. Kept different from `ARTIST_EMAIL` so the notification isn't from==to. |

The enquiry function already sets `reply_to` to the **customer's** address, so when
Roxy hits Reply in Gmail it goes straight to the customer — and Step 2 makes that
reply go out as `roxy@beansprout.ink`. No app change needed.

## DNS sanity checks (avoid the common foot-guns)

- **Only one SPF record per name.** If both Resend and the forwarder want an SPF
  `TXT` at the same name, **merge the includes into a single record** (e.g.
  `v=spf1 include:<forwarder> include:<resend> ~all`) — two separate SPF records
  break both. (Resend often puts its SPF on a `send.` subdomain, in which case
  there's no clash at the root.)
- **Add one DMARC record** at `_dmarc.beansprout.ink`
  (`v=DMARC1; p=none; rua=mailto:hello@beansprout.ink` to start, then tighten to
  `quarantine`/`reject` once you've confirmed Resend + Gmail-send-as both pass).
- **Use Resend's records verbatim** from its dashboard for the sending/DKIM side —
  don't hand-write them.
- **Don't delete the v1 MX records** if the v1 site still uses the domain for mail.

## What's in the repo vs. what's external

- **Repo / config:** `ARTIST_EMAIL`, `FROM_EMAIL` (this doc + `.env.example` +
  `ENQUIRY-SETUP.md`). All site contact links already use `hello@beansprout.ink`.
- **External (can't be done from the repo):** the forwarder account, the Gmail
  "Send mail as", and the DNS records — all live in the registrar / Cloudflare /
  ImprovMX / Gmail accounts.
</content>
</invoke>
