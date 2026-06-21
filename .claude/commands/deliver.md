---
description: Deliver a feature from a design brief — deep review, query the design, then build it tested and secure on the develop flow
argument-hint: <paste the feature brief, or describe the feature>
---

You are delivering a feature for the **Beansprout v2** site (the *Beanstalk* repo). The design was
worked out in a Claude Project; your job is expert, on-point delivery on the `develop → main` flow.
Read `CLAUDE.md` and `docs/WORKFLOW.md` first — they govern everything below.

The brief (or feature request):

$ARGUMENTS

Run this loop. Don't skip the thinking steps just because the brief looks complete.

1. **Ground yourself.** Read `CLAUDE.md` (architecture, build pipeline, **scope discipline**, the
   git workflow) and the feature doc(s) the brief touches (`docs/ROADMAP.md` plus e.g. `PAYMENTS.md`,
   `MEDIA.md`, `MOTION.md`, `DATA-COMPLIANCE.md`). Explore the affected code — find the existing
   functions, data files, renderers, handlers and patterns to **reuse** rather than reinvent.

2. **Query the design.** Where the brief is ambiguous, conflicts with how the codebase actually
   works, or fights best practice / security / accessibility / the lean baseline, **ask me with
   `AskUserQuestion`** before building — don't guess. For anything non-trivial, delegate a deep look
   to the **`design-reviewer`** subagent (read-only critique against the codebase, scope discipline,
   security and best practice) and fold its findings in. Flag any scope-discipline breach (new
   dependency / build step / doc, or code built ahead of a real need) instead of quietly shipping it.

3. **Plan, then build.** Branch off an up-to-date `develop` (`git switch -c feat/<thing>
   origin/develop`) — never commit on `develop`/`main` directly. Stage only what the task touches
   (explicit paths, never `git add -A`). Follow the repo's patterns: edit data files, not generated
   markup; one `modules/<name>.js` per behaviour; centralised palette/SEO/security; fail-safe Worker
   storage; trust no client-supplied MIME/amount.

4. **Test and secure.** Run `npm test` (both suites) and `npm run build`; `npm run lint` clean. Add
   or extend tests for what you changed — and if it touches a browser-only path (enquiry form,
   lightbox, mobile nav, flash modal), add/extend an `apps/web/e2e/` spec (the sandbox `test:e2e`
   only skips — the PR's E2E job is the real gate). Do a security pass: input validation, PII/GDPR,
   rate limits, CORS/CSP, secrets never in the repo.

5. **Open the PR.** `git push -u origin feat/<thing>` and open the PR into `develop` with the brief
   as the body. State plainly that the sandbox can't run the visual/E2E check — that's left to the
   PR's E2E workflow + the user's review. This is the default now: open it, don't wait to be asked.

6. **Monitor and react until green.** `subscribe_pr_activity` for the PR, then watch CI + review
   comments. On a CI failure or a clear review ask, **diagnose and push the fix** (autofix when
   confident); use `AskUserQuestion` only when the fix is ambiguous, architectural, or could be done
   several ways. Re-check CI state proactively — a success isn't always delivered as a webhook event.
   Loop until every check is green.

7. **Final review, then hand over.** Once green, run **`/code-review`** on the diff (and also
   **`/security-review`** when the change touches the Worker / forms / payments / any security
   surface); address what it finds, looping back through 4–6 if you push fixes. Then hand the PR to me
   with a tight summary + the green status. **Do not merge** — confirming any final changes and
   merging is my call.

Respect the web-session limits in `CLAUDE.md` (no browser/visual check, no remote-ref surgery) and
match effort to a one-artist business: the smallest thing that genuinely helps.
