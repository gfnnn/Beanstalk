# Beansprout — v2 (Beanstalk repo)

Static marketing site for the Beansprout tattoo studio. Plain HTML pages bundled by
**Vite** (no framework): styling in modular CSS under `src/styles/`, behaviour in ES
modules under `src/js/modules/` wired through `src/js/main.js`. Design tokens live in
`src/styles/variables.css`.

## Git workflow — keep `main` clean

`main` is the **deploy branch**: every push triggers a GitHub Pages build *and* a
Netlify build. So `main` must only ever receive reviewed, self-contained commits —
never work-in-progress.

1. **Branch before you build.** `git switch -c feat/<thing>` off an up-to-date `main`.
   Never commit directly on `main`.
2. **Stage only what the task touches.** Use explicit paths (`git add path/…`), never
   `git add -A`. If unrelated changes are already sitting in the tree, commit or stash
   them on their own branch first so they don't get swept into your commit.
3. **One PR per change, squash-merge, delete the branch.**
   `gh pr create` → review the diff → `gh pr merge --squash --delete-branch`. This
   leaves `main` with one tidy commit per feature and no stale branches.
4. **Never rewrite published history.** No force-pushes to `main`.

Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.

## Deploy guardrail — do NOT switch the apex domain

`beansprout.ink` (apex) is intentionally still served by the **v1** repo
(`gfnnn/beansprout`). This v2 repo publishes only to the staging mirror
**beansprout.netlify.app** (Netlify) and GitHub Pages. **Do not point the apex at v2**
— and don't add apex A-records for Pages — until the copy and real images are
finalised. Netlify also hosts the enquiry/flash email function (Resend).

## Design system — don't drift

Warm earthy palette (cream `#F7F1E3`, moss `#4A5D3F`, clay `#C45A3E`, ink `#2C2A24`)
with Fraunces (serif display) / Karla (sans body) / JetBrains Mono (labels). Reuse the
shared nav, footer, button, and JS-module patterns across pages. Placeholder copy is
marked `<!-- COPY: -->`; image placeholders carry shoot briefs in HTML comments.
