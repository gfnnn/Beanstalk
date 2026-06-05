# Beanstalk — Beansprout.ink 2.0

An npm-workspaces monorepo for the Beansprout tattoo studio site and its form/email backend.

## Workspaces

| Path             | Package                  | What it is                                       | Deploys to       |
| ---------------- | ------------------------ | ------------------------------------------------ | ---------------- |
| `apps/web`       | `@beansprout/web`        | Vite multi-page marketing site (frontend)        | GitHub Pages     |
| `apps/functions` | `@beansprout/functions`  | Cloudflare Worker (+ D1) forms/email app (backend) | Cloudflare Workers |

The two parts deploy **independently**: the GitHub Pages workflow is path-filtered to
`apps/web/**`, and the Worker deploys from `apps/functions` via `wrangler deploy`
(`wrangler.toml`). Personal data is stored in **Cloudflare D1** (SQLite).

## Quick start

```bash
npm install            # install all workspaces
npm run dev            # Vite dev server for the site (apps/web)
npm run build          # build the site → apps/web/dist
npm test               # run both workspaces' test suites
npm run test:web       # site tests only
npm run test:functions # functions tests only

npm run preview:branch -- <branch>  # fetch a branch, install, and run its dev server (one command)
```

## Docs

- `CLAUDE.md` — architecture and conventions (start here)
- `docs/ROADMAP.md` — outstanding work, open decisions, and go-live blockers
- `docs/ENQUIRY-SETUP.md` — enquiry / flash-claim form + email setup
- `docs/NEWSLETTER-SETUP.md` — newsletter (Resend Audience) setup
- `.env.example` — environment variables (copy to `.env` for local work)
