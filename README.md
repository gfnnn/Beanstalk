# Beanstalk — Beansprout.ink 2.0

An npm-workspaces monorepo for the Beansprout tattoo studio site and its form/email backend.

## Workspaces

| Path             | Package                  | What it is                                   | Deploys to      |
| ---------------- | ------------------------ | -------------------------------------------- | --------------- |
| `apps/web`       | `@beansprout/web`        | Vite multi-page marketing site (frontend)    | GitHub Pages    |
| `apps/functions` | `@beansprout/functions`  | Netlify serverless forms/email app (backend) | Netlify         |

The two parts deploy **independently** and are each gated so only relevant changes ship:
the GitHub Pages workflow is path-filtered to `apps/web/**`, and Netlify's build is scoped
to `apps/functions` via the `base` directory in `netlify.toml`.

## Quick start

```bash
npm install            # install all workspaces
npm run dev            # Vite dev server for the site (apps/web)
npm run build          # build the site → apps/web/dist
npm test               # run both workspaces' test suites
npm run test:web       # site tests only
npm run test:functions # functions tests only
```

## Docs

- `CLAUDE.md` — architecture and conventions (start here)
- `docs/ENQUIRY-SETUP.md` — enquiry / flash-claim form + email setup
- `docs/NEWSLETTER-SETUP.md` — newsletter (Resend Audience) setup
- `.env.example` — environment variables (copy to `.env` for local work)
