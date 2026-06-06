# Beansprout — beansprout.ink

This is the home of the **Beansprout** tattoo website — the booking shop-window for
the artist's fine-line, botanical and custom tattoo work at Tiny Knives in Winchester.
It's two pieces working together: the **website people see**, and a small
**behind-the-scenes helper** that takes enquiries and turns them into an email in the
artist's inbox.

> **Heads-up:** the site isn't pointed at `beansprout.ink` yet — that address still shows
> the old (v1) site. This v2 lives on a preview link until the planned switch-over. The
> step-by-step go-live plan is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## For the artist — what this is, in plain English

Think of this project as **your website plus a tiny robot receptionist.**

- **The website** is everything a visitor sees: your portfolio, flash designs, prices,
  the about page, the studio details, and the forms. It's fast, works on phones, and is
  built to feel calm and on-brand.
- **The "receptionist"** is the part you never see. When someone fills in the enquiry
  form, claims a flash piece, or joins the newsletter, it quietly does the right thing —
  emails you the enquiry (with their reference photos attached), holds a flash piece so
  two people can't claim it at once, and adds newsletter sign-ups to your mailing list.

You don't have to run or babysit any of it. It looks after itself, and it costs **£0 a
month** to run (it sits inside the free tiers of the services it uses).

### What's on the website

| Page | What it's for |
| --- | --- |
| **Home** | The first impression — hero, a taste of your work, what you do, kind words. |
| **Portfolio** | Your gallery of healed work, filterable by style, each piece on its own shareable page. |
| **Flash** | The current flash drop — ready-to-go designs people can claim. |
| **Services** | What you offer and roughly what it costs. |
| **About** | Your story and how you work. |
| **Contact & visit** | Where the studio is, hours, how to find it, a map. |
| **FAQ / Aftercare** | The questions you'd otherwise answer over and over, and healing guidance. |
| **Enquire** | The main booking form — a gentle, step-by-step way for someone to send their idea + photos. |
| **Newsletter** | Sign-ups for your mailing list. |
| **Privacy / Terms** | The legal bits (data, deposits, cancellations). |

### What happens when someone enquires

1. They fill in the enquiry form (or claim a flash piece) on the site.
2. Within seconds you get an **email** with their details laid out and their **photos
   attached**. Hitting *Reply* writes straight back to them — no copying addresses.
3. A copy of every enquiry is also stored safely (in case an email ever goes astray),
   so nothing is lost.

Your data is treated carefully: there are **no tracking or advertising cookies**, and
people's personal details (including any health info they share) are kept securely and
only as long as needed. The full plain-SQL "look up / delete someone's data" routine
lives in [`docs/DATA-COMPLIANCE.md`](docs/DATA-COMPLIANCE.md).

### Making changes to the site

Most of the wording and images are **content** — and the plan is to give you a simple
editor to change them yourself after launch (see [`docs/CMS.md`](docs/CMS.md)). Until
that's built, changes (new portfolio pieces, prices, copy, photos) are made by a
developer through the normal process. If you want something changed, the quickest route
is to note **which page** and **what you'd like it to say/show**, and hand that over —
it's a small job each time.

The remaining "before we go live" checklist (your prices, the ICO registration number,
your real logo, flash photos, opening hours) is tracked in
[`docs/ROADMAP.md`](docs/ROADMAP.md) → *Phase 4*.

---

## For developers

An **npm-workspaces monorepo** with two independently-deployed parts.

| Path             | Package                  | What it is                                       | Deploys to         |
| ---------------- | ------------------------ | ------------------------------------------------ | ------------------ |
| `apps/web`       | `@beansprout/web`        | Vite multi-page marketing site (frontend)        | GitHub Pages       |
| `apps/functions` | `@beansprout/functions`  | Cloudflare Worker (+ D1) forms/email app (backend) | Cloudflare Workers |

The two parts deploy **independently**: the GitHub Pages workflow is path-filtered to
`apps/web/**`, and the Worker deploys from `apps/functions` via Cloudflare Workers Builds
(`wrangler.toml`). Personal data is stored in **Cloudflare D1** (SQLite). Email is sent
via **Resend**. Start with [`CLAUDE.md`](CLAUDE.md) for architecture and conventions.

### Quick start

```bash
npm install            # install all workspaces
npm run dev            # Vite dev server for the site (apps/web)
npm run build          # build the site → apps/web/dist
npm run preview        # serve the built site locally
npm test               # run both workspaces' test suites
npm run test:web       # site tests only
npm run test:functions # functions tests only
npm run test:e2e       # Playwright browser tier (skips cleanly without Chromium)

npm run preview:branch -- <branch>  # fetch a branch, install, and run its dev server (one command)
```

### Branching

`develop` integrates (and deploys staging); `main` releases to production via a batched
`develop → main` PR. Full runbook in [`docs/BRANCHING.md`](docs/BRANCHING.md).

### Docs

- [`CLAUDE.md`](CLAUDE.md) — architecture and conventions (**start here**)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — outstanding work, open decisions, and the go-live plan
- [`docs/BRANCHING.md`](docs/BRANCHING.md) — branch/release model
- [`docs/ENQUIRY-SETUP.md`](docs/ENQUIRY-SETUP.md) — enquiry / flash-claim form + email setup
- [`docs/NEWSLETTER-SETUP.md`](docs/NEWSLETTER-SETUP.md) — newsletter (Resend Audience) setup
- [`docs/EMAIL-DOMAIN-SETUP.md`](docs/EMAIL-DOMAIN-SETUP.md) — sending domain + inbox forwarding (Resend / DNS)
- [`docs/DATA-COMPLIANCE.md`](docs/DATA-COMPLIANCE.md) — GDPR retention / erasure runbook + D1 backup (Time Travel)
- [`docs/MEDIA.md`](docs/MEDIA.md) — portfolio/flash image pipeline + hero video/GIF serving
- [`docs/MOTION.md`](docs/MOTION.md) — the loader / entrance / page-transition motion system
- [`docs/PAYMENTS-PLAN.md`](docs/PAYMENTS-PLAN.md) — deposits / flash-purchase plan (PayPal + Monzo, not yet built)
- [`docs/SCHEDULING.md`](docs/SCHEDULING.md) — appointment-booking plan (not yet built)
- [`docs/CMS.md`](docs/CMS.md) — content-CMS plan (planned, post-launch)
- [`.env.example`](.env.example) — environment variables (copy to `.env` for local work)
</content>
</invoke>
