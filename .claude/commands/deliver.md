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

5. **Hand back.** Summarise what changed and the verification result. Prepare the PR into `develop`
   with the brief as the body — note plainly that the visual/E2E check can't run from a web session
   and is left to the PR's E2E workflow + a local/human review. **Do not open the PR, push, or
   merge unless I ask.**

Respect the web-session limits in `CLAUDE.md` (no browser/visual check, no remote-ref surgery) and
match effort to a one-artist business: the smallest thing that genuinely helps.
