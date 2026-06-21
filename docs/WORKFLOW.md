# Workflow — design discovery → delivery

How a feature travels from **thinking** to **shipped** across two Claude surfaces, so design
discovery can run in parallel (often on mobile) and hand off cleanly to delivery. The split:

- **Claude Project** (claude.ai, mobile/web) — the *design* surface. Go deep on a request, read
  the relevant repo parts, **challenge the design** for correctness, best practice and this repo's
  scope discipline, and produce a tight **feature brief**. No code is written here.
- **Claude Code** (this repo) — the *delivery* surface. Pick up the brief and ship a tested,
  secure feature on the `develop → main` flow. It runs in two modes — a **full local session**
  (a real machine like this one: a shell, full git, an installable browser) or a **constrained
  web/mobile session** (an ephemeral cloud sandbox) — and the mode, not the task, decides what you
  can actually run; see [Where to run what](#where-to-run-what-local-session-vs-web-session) below.

The brief is the contract between them. Architecture lives in [`CLAUDE.md`](../CLAUDE.md); the
branch/release runbook in [`BRANCHING.md`](./BRANCHING.md); launch state + backlog in
[`ROADMAP.md`](./ROADMAP.md).

## The two surfaces

| | **Claude Project** (design) | **Claude Code** (delivery) |
|---|---|---|
| Where | claude.ai, mobile/web | this repo — a **full local session**, a web/mobile session, or CI |
| Job | explore intent, review the codebase, **query/pressure-test the design**, write the brief | branch, build, test, secure, PR into `develop` |
| Writes code? | **No** — decisions only | Yes — on a `feat/*` branch off `develop` |
| Output | a **feature brief** (template below) | a green PR into `develop`, brief as the PR body |

Use the Project to figure out *what* and *why*; use Code to deliver *how*. Several briefs can be
in flight at once — keep delivery to ~2–3 live branches (see `CLAUDE.md` → *Working on several
features at once*).

## Set up the Claude Project (one-time)

On claude.ai → **Projects → New project**. Two things to configure:

### 1. Custom instructions (paste this in)

> You are my **design-discovery partner** for the Beansprout v2 site (the *Beanstalk* repo — a
> lean marketing site for a one-artist tattoo studio, plus a small Cloudflare Worker for
> forms/email/payments). We work out *what* to build and *why*; the actual code is delivered
> separately by Claude Code. In this Project you do **not** write code — you produce a **feature
> brief** that Claude Code can execute.
>
> For every request:
> 1. **Go deep before answering.** Read the relevant repo parts in the Project knowledge
>    (`CLAUDE.md`, `docs/ROADMAP.md`, `docs/BRANCHING.md`, the relevant feature doc) and ground
>    your reasoning in how this codebase actually works — its data→build pipeline, the
>    Worker/D1/Resend backend, the design system, the develop→main flow.
> 2. **Query and challenge the design.** Actively ask me the questions that change the outcome;
>    point out where an idea fights best practice, security/privacy, accessibility, or the repo's
>    **scope discipline** (this is a one-artist business — smallest thing that genuinely helps; no
>    new dependency/build step/doc without a named reason; never build a feature's code ahead of
>    the real need it serves). Push back rather than agree by default.
> 3. **Resolve, then write the brief.** Once the decisions are settled, output the brief in the
>    template below — settled decisions, open questions left for Code, scope **and non-goals**,
>    owner split (👤 me / 🛠 code), acceptance criteria, security/privacy notes, and which docs to
>    update. Keep it tight: durable decisions, not a file-by-file build spec.
>
> Match effort to a one-artist business. Flag when a request would cross a scope-discipline line
> instead of quietly building past it.

### 2. Project knowledge (connect the repo)

**Connect this GitHub repo to the Project** (Project → knowledge → add the GitHub repo) so it reasons
from the **live files** — they stay current on every push, with nothing to re-upload. That's the whole
setup; the docs it leans on are:

- [`CLAUDE.md`](../CLAUDE.md) — architecture, build pipeline, guardrails (the most important one).
- [`docs/ROADMAP.md`](./ROADMAP.md) — what's shipped, launch state, backlog priorities.
- [`docs/BRANCHING.md`](./BRANCHING.md) — the develop→main flow the brief feeds into.
- This file (`docs/WORKFLOW.md`) — the handover model + brief template.
- The **relevant feature doc** for the thing under discussion (e.g. `PAYMENTS.md`, `MEDIA.md`,
  `MOTION.md`, `DATA-COMPLIANCE.md`).

(No GitHub connection? Upload those files instead — and re-upload them when they change.)

## The feature brief (the handover artifact)

Briefs are **ephemeral** — the Project produces one, you paste it into a Claude Code session, and
it becomes the **PR description**. They are *not* committed to the repo (no transient planning
files — see `CLAUDE.md` scope discipline). Copy this template:

```markdown
# Brief: <one-line outcome>

**Why now:** <the problem / need this serves — 1–3 sentences>

**Settled decisions:**
- <decision the Project and I agreed on>
- ...

**Open questions for Code:** <things to resolve during delivery, or "none">

**Scope:** <what's in>
**Non-goals:** <what's deliberately out — the scope-discipline guard>

**Owners:** 👤 <values/accounts I must supply first> · 🛠 <what Code builds>

**Affected areas:** <apps/web | apps/functions | docs — and roughly which parts>

**Acceptance criteria / how to verify:**
- <observable check 1 — e.g. "npm test green", "X renders on /flash">
- ...

**Security & privacy:** <inputs trusted? PII? rate limits? CORS/CSP? or "none">

**Docs to update:** <ROADMAP tick-list entry, feature doc, etc. — or "none">
```

## Handing off to Claude Code

The loop is **PR-driven**: from build, the change always goes up to a PR + CI, Claude actively
monitors and reacts, does a final review, and hands it to you — **your merge is the gate**.

1. **Paste the brief** into a new Claude Code session and run **`/deliver`** (the brief as its
   argument). The command runs the delivery loop: read `CLAUDE.md` + the relevant docs, explore the
   affected code, **re-query the design** where the brief is ambiguous or fights best practice
   (delegating a deep look to the `design-reviewer` subagent when useful), plan, implement on a
   `feat/*` branch off `develop`, run `npm test` + `npm run build` + `npm run lint` and a security
   pass, then **open the PR into `develop`** with the brief as the body.
2. **It watches and reacts.** `/deliver` subscribes to the PR's activity and monitors CI + review
   comments, **pushing fixes when the fix is clear** (asking you only when it's ambiguous or
   architectural) until every check is green. Watching is the **standing default** — you've
   pre-authorised it, so it won't ask each time.
3. **Mind the web-session realities** (full detail in `CLAUDE.md` → *Working in a Claude Code web
   session*): the unit suites run in the sandbox, but the **E2E/visual check cannot** — that gate
   is the PR's E2E workflow plus a local/human review, not a skipped sandbox run. Remote-ref
   surgery (branch deletion, rebasing others' branches) also can't happen from a web session.
4. **Final review + your merge gate.** Once CI is green, `/deliver` runs **`/code-review`** (plus
   **`/security-review`** when the Worker / forms / payments / security surface is touched), folds in
   what it finds, then hands you the PR with a summary. **You confirm any final changes and do the
   squash-merge** into `develop` (or tell Claude to) — it never self-merges. From there it batches
   into the next `develop → main` release per [`BRANCHING.md`](./BRANCHING.md).

## Where to run what (local session vs web session)

Delivery runs in one of two Claude Code modes, and the **mode — not the task — decides what's
actually exercisable**. A **full local session** (this kind of environment: a real machine with a
shell, full git, and a browser you can install) can run everything end-to-end. A **web/mobile
session** is an ephemeral cloud sandbox — ideal for kicking off `/deliver` and the unit loop, but it
has no display and the git proxy only lets it touch its own branch. Match the action to the surface:

| Action | Full local session (this) | Web/mobile session |
|---|---|---|
| `/deliver`, edit code, open the PR | ✅ | ✅ |
| `npm test` (both Vitest suites) + `npm run build` + `npm run lint` | ✅ | ✅ |
| **E2E / Playwright** (`npm run test:e2e`, needs Chromium) | ✅ install + run | ⏭️ skips cleanly — the PR's E2E job is the gate |
| **Pre-PR visual check** (dev server + eyes on the page, screenshots) | ✅ | ❌ no display → hand to the E2E job + human review |
| **Branch / ref cleanup** (the Backlog-hygiene prune, rebasing others' branches) | ✅ | ❌ proxy 403s on remote-ref deletion |
| **Run the Worker for real** (`wrangler dev` + `apps/functions/.dev.vars`, local D1) | ✅ | ❌ |
| **Review a branch locally** (`npm run preview:branch -- <branch>`) | ✅ | — local-only helper |
| **Content / media scripts** (`npm run media:dropbox`, `process-media.mjs` / `process-video.mjs`, `master-metadata.mjs`, `npm run smoke`) | ✅ | ⚠️ network-gated, run locally |

So the rhythm is: do the **build + unit loop + PR** from whichever surface is to hand — a web/mobile
session is fine, and is the whole point of the PR-driven loop — but bring the **browser-bound checks**
(E2E, the visual check), **ref surgery** (branch cleanup, cross-branch rebases), **the real Worker**,
and **the media/Dropbox scripts** back to a **full local session like this one**. The exhaustive
web-session ground rules — *why* E2E skips, why the proxy 403s, exactly where the browser coverage
really runs — live in [`CLAUDE.md`](../CLAUDE.md) → *Working in a Claude Code web session*; this table
is just the routing on top of them.
