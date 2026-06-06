# Email on the `beansprout.ink` domain

How to make `hello@beansprout.ink` and `roxy@beansprout.ink` work as **real email
addresses** — receiving into a Gmail account, and letting the artist reply *as* the
domain. This is separate from the app's outbound mail (Resend), which is covered
in `ENQUIRY-SETUP.md`.

> **Two different jobs, don't confuse them.**
> - **Sending** as `@beansprout.ink` — done by **Resend** (the Cloudflare Worker,
>   and the artist's manual replies). Resend is a sending API; it gives you no inbox.
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
| `hello@beansprout.ink` | Primary **public** contact (every footer, privacy page, 404, …) | Forwards → the artist's Gmail |
| `roxy@beansprout.ink` | The app's **sending** identity (`FROM_EMAIL`), and the "from" on the artist's manual replies | Forwards → the artist's Gmail (so out-of-app replies reach them too) |
| The artist's Gmail | Where they actually **read and work** | — |

## Step 1 — Forward the addresses to Gmail (GoDaddy DNS)

`beansprout.ink`'s DNS is on **GoDaddy**. **Keep the nameservers on GoDaddy** and
just *add records* — do **not** move DNS to Cloudflare, because changing
nameservers migrates *every* record (including the v1 website's A/CNAME) and risks
taking the live apex down. Email needs only record additions, which is safe.

Use **ImprovMX** (free, works with any DNS host; ForwardEmail.net is an equivalent
alternative). GoDaddy's own forwarding is now largely paywalled behind Microsoft
365 — skip it.

1. **ImprovMX** ([improvmx.com](https://improvmx.com)) → add `beansprout.ink` →
   create aliases `hello@` and `roxy@`, both → the artist's Gmail. ImprovMX shows you the
   exact records to add (use *its* values; the well-known ones are below).
2. **GoDaddy** → *Domain Portfolio* → `beansprout.ink` → **DNS → Manage Zones /
   Manage DNS**. Add:

   | Type | Name/Host | Value | Priority |
   |---|---|---|---|
   | `MX` | `@` | `mx1.improvmx.com` | 10 |
   | `MX` | `@` | `mx2.improvmx.com` | 20 |
   | `TXT` | `@` | `v=spf1 include:spf.improvmx.com ~all` | — |

3. **Remove GoDaddy's default MX records** at `@` (the ones pointing to
   `*.secureserver.net`) — otherwise mail routes to GoDaddy instead of ImprovMX.
   ⚠ First confirm no *current* email relies on them; the v1 **website** uses
   A/CNAME, not MX, so removing default MX is normally safe here.
4. Back in ImprovMX, hit **verify**, then send a test email to
   `hello@beansprout.ink` from your phone — it should land in Gmail within a minute.

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

In Cloudflare, set these as **Worker secrets** (`wrangler secret put <NAME>` from
`apps/functions/`, or the dashboard → Worker → Settings → Variables) — these are
the only config touchpoints, no code change:

| Key | Value | Why |
|---|---|---|
| `ARTIST_EMAIL` | The artist's **Gmail** address | Where enquiries land. Use the raw Gmail (no extra forwarding hop = most reliable delivery). Once Step 1 is confirmed, `hello@beansprout.ink` works too. |
| `FROM_EMAIL` | `roxy@beansprout.ink` | The app's verified sending identity. Kept different from `ARTIST_EMAIL` so the notification isn't from==to. |

The enquiry function already sets `reply_to` to the **customer's** address, so when
the artist hits Reply in Gmail it goes straight to the customer — and Step 2 makes that
reply go out as `roxy@beansprout.ink`. No app change needed.

## DNS sanity checks (avoid the common foot-guns)

- **Only one SPF record per name.** GoDaddy often ships a *default* SPF `TXT` at
  `@` (e.g. `v=spf1 include:secureserver.net -all`). **Edit that existing record**
  to the ImprovMX one above rather than adding a second — two SPF records at `@`
  break both. Resend puts its own SPF on the `send.beansprout.ink` subdomain (not
  the root), so it won't clash with ImprovMX's root SPF.
- **Add one DMARC record** at `_dmarc.beansprout.ink`
  (`v=DMARC1; p=none; rua=mailto:hello@beansprout.ink` to start, then tighten to
  `quarantine`/`reject` once you've confirmed Resend + Gmail-send-as both pass).
- **Use Resend's records verbatim** from its dashboard for the sending/DKIM side —
  don't hand-write them.
- **Don't delete the v1 MX records** if the v1 site still uses the domain for mail.

## What's in the repo vs. what's external

- **Repo / config:** `ARTIST_EMAIL`, `FROM_EMAIL` (this doc + `.env.example` +
  `ENQUIRY-SETUP.md`). All site contact links already use `hello@beansprout.ink`.
- **External (can't be done from the repo):** the ImprovMX account, the Gmail
  "Send mail as", and the DNS records — all live in the ImprovMX / Gmail / GoDaddy
  accounts.
