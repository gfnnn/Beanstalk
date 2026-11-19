# Beanstalk: website and enquiry system for a tattoo artist

[![Tests](https://github.com/gfnnn/beanstalk/actions/workflows/test.yml/badge.svg?branch=develop)](https://github.com/gfnnn/beanstalk/actions/workflows/test.yml)
[![E2E](https://github.com/gfnnn/beanstalk/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/gfnnn/beanstalk/actions/workflows/e2e.yml)
[![Deploy](https://github.com/gfnnn/beanstalk/actions/workflows/deploy-web.yml/badge.svg?branch=main)](https://github.com/gfnnn/beanstalk/actions/workflows/deploy-web.yml)

**Live site: [beansprout.ink](https://beansprout.ink)**

**Status: live.** This is version 2 of the site for Beansprout Tattoo, a
self-employed tattoo artist (Roxy) working from a studio in Winchester. It has been live at
[beansprout.ink](https://beansprout.ink) since 15 November 2026, when it replaced the old
version 1 site.

**An unpaid personal project.** I designed and delivered it for Roxy for free and keep it running; it is
not paid work.

## What it does

- **A fast, mobile-friendly portfolio site:** gallery, prices, FAQ, aftercare and
  contact pages (a flash-designs page is built and opens with the first drop), with the content kept in data files so it can't drift
  between pages.
- **An enquiry system that replaces Instagram DMs:** a step-by-step enquiry form
  (with reference photos) and a flash-claim form. Each submission is stored first, then
  emailed to the artist with the photos attached, so nothing is lost if an email fails.
  A flash design is held the moment it's claimed, so two people can't claim it.
- **Personal data handled carefully:** health details need explicit consent, there's a
  retention and erasure routine for UK GDPR requests, and spam is held back by a
  rate limiter. See [`docs/DATA-COMPLIANCE.md`](docs/DATA-COMPLIANCE.md).
- **Costs nothing to run:** everything sits inside free service tiers.

## How it's built

| Part | What it is | Runs on |
| --- | --- | --- |
| `apps/web` | The website: plain HTML, CSS and JavaScript, built with Vite (no framework) | GitHub Pages |
| `apps/functions` | A small back end that receives the forms, stores them in a database and sends email | Cloudflare Workers, Cloudflare D1 (SQLite), Resend |

Automated checks: over 1,000 unit and integration tests (Vitest), browser tests
(Playwright) and a linter (Biome), run by GitHub Actions on every change. The tests use
fake data and mocked email and database services, so no real enquiries are involved.

## How this was built

Built with Claude Code to my specification. Claude Code writes the code, including the
SQL for the D1 database, and commits are co-authored with it. My part is the discovery,
the requirements and priorities, the design and privacy decisions, and reviewing and
testing every change before it is merged. Hosting, DNS, deployment and merges are done
by me. [`CLAUDE.md`](CLAUDE.md) is the brief the assistant works from.

## My role: running it as a delivery project

I don't write the code by hand. I run the project the way I would run a delivery
project: working out what the artist actually needs, deciding what to build and what
to leave out, briefing the work, checking it, and managing the releases and the launch.

- **Requirements and scope.** Each feature starts as a written brief with decisions,
  non-goals, acceptance criteria and privacy notes. The rule is the smallest thing that
  genuinely helps a one-person business, so bigger ideas (booking, a dashboard, a CMS)
  stay unbuilt until real use calls for them.
- **Working with the artist.** Prices, policies and every line of copy in the artist's
  voice were agreed with her, and each block stays flagged until she approves it (see
  [Artist-copy markers in `CLAUDE.md`](CLAUDE.md#artist-copy-markers)).
- **Change and release control.** Over 260 pull requests merged since May 2026, each
  one tested in CI. Features collect on a staging site and go live in batched,
  reviewed releases ([`docs/BRANCHING.md`](docs/BRANCHING.md)).
- **Launch.** A phased go-live runbook with a go/no-go gate, smoke test and rollback
  plan, used to switch the domain from the old site on 15 November 2026
  ([`docs/CUTOVER.md`](docs/CUTOVER.md)).
- **Privacy and compliance.** UK GDPR built in from the start: data minimisation,
  explicit consent for health details, retention and erasure routines, and analytics
  limited to statistics with an opt-out ([`docs/DATA-COMPLIANCE.md`](docs/DATA-COMPLIANCE.md),
  [`docs/ANALYTICS.md`](docs/ANALYTICS.md)).
- **Running costs.** Hosting, database, email and analytics all sit within free tiers.

## Run it locally

You need Node.js 24 or later.

```bash
npm install     # install everything
npm test        # run the test suites (fake data only)
npm run dev     # the website at http://localhost:5173
```

The forms post to a Cloudflare Worker. To try them without touching the real one, run
the Worker locally with `wrangler dev` (it uses a local, empty database) and point the
site at it by copying [`.env.example`](.env.example) to `apps/web/.env` with the
`http://localhost:8787/...` URLs. Step-by-step notes are in
[`docs/ENQUIRY-SETUP.md`](docs/ENQUIRY-SETUP.md).

Other commands:

```bash
npm run build          # build the site into apps/web/dist
npm run preview        # serve the built site
npm run test:web       # website tests only
npm run test:functions # back-end tests only
npm run test:e2e       # browser tests (skip cleanly if Chromium isn't installed)
npm run lint           # static analysis
```

## Copyright and content

No open-source licence is granted, so all rights are reserved.

- **Code:** © Harrison Fisher. You're welcome to read it.
- **Artwork, tattoo photos, logo and written content** (everything under
  `apps/web/public/` and the copy in `apps/web/src/data/`): © Beansprout Tattoo. They
  are published here with the artist's permission for this site only and may not be
  reused, copied or redistributed.

---

## For the artist: what this is, in plain English

Think of this project as **your website plus a tiny receptionist.**

- **The website** is everything a visitor sees: your portfolio, flash designs, prices,
  the about page, the studio details and the forms.
- **The receptionist** is the part you never see. When someone fills in the enquiry
  form, claims a flash piece or joins the newsletter, it emails you the enquiry (with
  their reference photos attached), holds a flash piece so two people can't claim it,
  and adds newsletter sign-ups to your mailing list.

### What's on the website

| Page | What it's for |
| --- | --- |
| **Home** | The first impression: hero, a taste of your work, what you do, and kind words once there are some to show. |
| **Portfolio** | Your gallery of healed work, filterable by style, each piece on its own shareable page. |
| **Flash** | The current flash drop: ready-to-go designs people can claim. Built, and switched on when the first drop is ready. |
| **Services** | What you offer and roughly what it costs. |
| **About** | Your story and how you work. |
| **Contact and visit** | Where the studio is, hours, how to find it, a map. |
| **FAQ / Aftercare** | The questions you'd otherwise answer over and over, and healing guidance. |
| **Enquire** | The main enquiry form: a step-by-step way to send an idea and photos. |
| **Newsletter** | Sign-ups for your mailing list. |
| **Privacy / Terms** | The legal bits (data, deposits, cancellations). |

### What happens when someone enquires

1. They fill in the enquiry form (or claim a flash piece) on the site.
2. Within seconds you get an **email** with their details and **photos attached**.
   Hitting *Reply* writes straight back to them.
3. A copy of every enquiry is also stored safely, in case an email ever goes astray.

### Making changes to the site

Most of the wording and images are content. To change something, note **which page** and
**what you'd like it to say or show**, and hand that over.

---

## For developers

An **npm-workspaces monorepo** with two parts that deploy independently: the GitHub
Pages workflow only runs for `apps/web/**` changes, and the Worker deploys from
`apps/functions` through Cloudflare Workers Builds. `develop` collects features and
deploys a staging copy; `main` is updated only by batched release PRs
(see [`docs/BRANCHING.md`](docs/BRANCHING.md)).

### Docs

- [`CLAUDE.md`](CLAUDE.md): architecture and conventions (**start here**)
- [`docs/BRANCHING.md`](docs/BRANCHING.md): branch and release model
- [`docs/CUTOVER.md`](docs/CUTOVER.md): the go-live runbook as run on 15 November 2026, and its follow-ups
- [`docs/ENQUIRY-SETUP.md`](docs/ENQUIRY-SETUP.md): enquiry, flash-claim and newsletter forms plus email setup
- [`docs/EMAIL-DOMAIN-SETUP.md`](docs/EMAIL-DOMAIN-SETUP.md): sending domain and inbox forwarding
- [`docs/DATA-COMPLIANCE.md`](docs/DATA-COMPLIANCE.md): UK GDPR retention and erasure runbook, D1 backup
- [`docs/MEDIA.md`](docs/MEDIA.md): portfolio and flash image pipeline, hero video
- [`docs/MOTION.md`](docs/MOTION.md): loader, entrance and page-transition motion
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md): Stripe payments (back end built but switched off)
- [`docs/ANALYTICS.md`](docs/ANALYTICS.md): GA4 analytics (statistics only, with opt-out and Global Privacy Control)
- [`.env.example`](.env.example): environment variables
