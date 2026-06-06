# Branching & release model

How code moves from a feature branch to production, set up for **multi-feature testing**
(features integrate and get exercised together on staging) and **batched delivery to prod**
(many features ship in one deliberate release, not one deploy per merge). This is the
go-live-ready flow. The short version lives in [`CLAUDE.md`](../CLAUDE.md) → *Git
workflow*; this file is the full runbook plus the one-time GitHub/Cloudflare setup.

## The two long-lived branches

| Branch     | Role                | Deploys to                                  | Updated by                                  |
|------------|---------------------|---------------------------------------------|---------------------------------------------|
| `develop`  | integration / staging | **Cloudflare Pages** (`*.pages.dev`) + Worker *preview* version | squash-merged **feature PRs** |
| `main`     | release / production  | **GitHub Pages** (apex at go-live) + Worker *deploy* | **release PRs** `develop → main` only |

Everything else is a short-lived `feat/*`, `fix/*`, or `docs/*` branch cut off `develop`.

```
feat/x ─┐
feat/y ─┼─(squash PRs)─▶ develop ──(staging deploy: test together)──▶ release PR ──▶ main ──▶ PROD
feat/z ─┘                   ▲                                          (merge commit)
                            └ rebase your live branches onto develop after each merge
```

## Day-to-day: shipping a feature

1. **Branch off `develop`** (up to date): `git switch -c feat/<thing> origin/develop`
   (or a worktree — see `CLAUDE.md`). Never commit directly on `develop`/`main`.
2. Build it, **visual-check it** (browser proof — see `CLAUDE.md`), `npm test && npm run build`.
3. **PR into `develop`:** `gh pr create --base develop`. CI (the two Vitest matrix jobs)
   must go green. Squash-merge, delete the branch.
4. The push to `develop` redeploys **staging**. Exercise the accumulated features there.
5. **Rebase your other live branches** onto `develop` right after any merge
   (`git fetch && git rebase origin/develop`) so they never drift.

## Cutting a release (batched delivery to prod)

When the work piled up on `develop` is verified on staging and you're ready to ship it as
one batch:

1. **Open a release PR:** `gh pr create --base main --head develop --title "release: <YYYY-MM-DD> <summary>"`.
   The PR body is the changelog — list the features/fixes included in the batch.
2. **Review the combined diff** (everything since the last release) and confirm CI is green.
3. **Merge with a *merge commit*** (not squash) so `main` keeps the per-feature history and
   the release is one identifiable merge. This merge **is** the production deploy:
   GitHub Pages rebuilds (if `apps/web/**` changed) and the Worker `wrangler deploy` runs
   (if functions changed).
4. **`develop` and `main` are now level.** Keep building on `develop` for the next batch.
   (No back-merge needed — a merge-commit release leaves `develop` an ancestor of `main`.)

**Hotfix exception.** A genuine production emergency may branch `fix/*` off `main`, PR
straight into `main`, then merge `main` back into `develop` so the fix isn't lost on the
next release. Use sparingly — the normal path is always through `develop`.

## One-time GitHub setup

### 1. Create the `develop` branch
Already created from `main` as part of this setup. If you ever need to recreate it:
GitHub → branch dropdown → type `develop` → *Create branch `develop` from `main`*.
(Or locally: `git switch -c develop main && git push -u origin develop`.)

### 2. Make `develop` the default branch
**Settings → General → Default branch → switch to `develop`.** This makes new PRs and
"Create branch" default to `develop`, so features can't accidentally target `main`. `main`
stays the release target, reachable explicitly in the release PR.

### 3. Auto-delete merged branches
**Settings → General → Pull Requests → ✅ "Automatically delete head branches".** Highest-
leverage hygiene fix — every squash-merge removes its own head, so the `claude/*`/`feat/*`
pile never forms (a web session can't delete remote refs; the proxy 403s — see `CLAUDE.md`).

### 4. Branch rulesets (Settings → Rules → Rulesets → New branch ruleset)

Two rulesets — strict on `main`, lighter on `develop`. The **required status check names**
are `test (@beansprout/web)` and `test (@beansprout/functions)` (from
`.github/workflows/test.yml`).

#### Ruleset A — `main` (production)
- **Name:** `protect main` · **Enforcement status:** **Active**
- **Bypass list:** add **Repository admin** (so you're never locked out for a real hotfix —
  solo repo). Use it only when genuinely needed.
- **Target branches:** *Add target → Include default branch* won't apply once `develop` is
  default — instead *Add target → Include by pattern →* `main`.
- **Rules — enable:**
  - ✅ **Restrict deletions**
  - ✅ **Block force pushes**
  - ✅ **Require a pull request before merging**
    - Required approvals: **0** (solo — a non-zero count blocks you, since you can't approve
      your own PR; raise it to 1 only once a second reviewer exists).
    - ✅ Require conversation resolution before merging
  - ✅ **Require status checks to pass**
    - ✅ Require branches to be up to date before merging
    - Add checks: `test (@beansprout/web)`, `test (@beansprout/functions)`
  - *(Leave "Require linear history" **OFF** for `main`* — releases land as **merge
    commits**, which a linear-history rule forbids.)*

#### Ruleset B — `develop` (integration)
- **Name:** `protect develop` · **Enforcement status:** **Active**
- **Target branches:** *Add target → Include by pattern →* `develop`
- **Rules — enable:**
  - ✅ **Restrict deletions**
  - ✅ **Block force pushes**
  - ✅ **Require a pull request before merging** (Required approvals: **0**)
  - ✅ **Require status checks to pass** → ✅ up to date → add the same two `test (…)` checks
  - ✅ **Require linear history** *(optional but tidy — feature PRs squash-merge, so `develop`
    stays linear)*

> Feature branches (`feat/*`, `fix/*`) need **no** ruleset — they're disposable.

## One-time Cloudflare setup (staging site for `develop`)

Mirrors how the **Worker** already deploys (Cloudflare-side Git integration), so **no
Cloudflare API token lives in GitHub** — keeping the CI-security posture in `CLAUDE.md`.

1. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.**
2. Pick this repo (`gfnnn/beanstalk`). **Production branch: `develop`.**
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `apps/web/dist`
   - **Root directory:** `/` (monorepo — the single lockfile is at the root)
4. **Environment variables** (Pages project → Settings → Variables) — the build runs on
   Cloudflare, so set the Worker routes here (not in GitHub Actions):
   - `VITE_ENQUIRY_FN_URL`, `VITE_NEWSLETTER_FN_URL`, `VITE_FLASH_STATUS_FN_URL`
     = `https://beansprout-forms.<subdomain>.workers.dev/<route>` (same values as the
     production Pages build's Actions Variables; any left unset fall back to `config.js`).
5. Save → first deploy runs. Staging is then live at `https://<project>.pages.dev` and
   redeploys on every push to `develop`.

> **CORS:** the staging origin (`*.pages.dev`) hits the same Worker. If the forms 403 from
> staging, add that origin to the Worker's CORS allowlist in
> `apps/functions/src/lib/http.js` (the *site* origin allowlist) and redeploy the Worker.

## How this maps to go-live (apex cutover)

Today, `main` → GitHub Pages is the **staging** stand-in (the apex `beansprout.ink` is
still v1 — see the deploy guardrail in `CLAUDE.md`). With this model in place, the only
go-live change is **Phase 6**: point the apex at the `main`/GitHub-Pages site (add
`apps/web/public/CNAME` + DNS). From that moment `main` releases *are* production on the
apex, `develop`'s `*.pages.dev` remains the pre-prod staging site, and nothing about the
day-to-day flow changes. Do **not** make that switch until `ROADMAP.md` Phase 6 clears.
