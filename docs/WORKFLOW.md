# Workflow — design discovery → delivery

How a feature travels from **thinking** to **shipped** across two Claude surfaces, so design
discovery can run in parallel (often on mobile) and hand off cleanly to delivery. The split:

- **Claude Project** (claude.ai, mobile/web) — the *design* surface. Go deep on a request, read
  the relevant repo parts, **challenge the design** for correctness, best practice and this repo's
  scope discipline, and produce a tight **feature brief**. No code is written here.
- **Claude Code** (this repo — web session or CI) — the *delivery* surface. Pick up the brief and
  ship a tested, secure feature on the `develop → main` flow.

The brief is the contract between them. Architecture lives in [`CLAUDE.md`](../CLAUDE.md); the
branch/release runbook in [`BRANCHING.md`](./BRANCHING.md); launch state + backlog in
[`ROADMAP.md`](./ROADMAP.md).

## The two surfaces

| | **Claude Project** (design) | **Claude Code** (delivery) |
|---|---|---|
| Where | claude.ai, mobile/web | this repo (web session / CI / local) |
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

### 2. Project knowledge (what to attach)

Add these repo files so the Project reasons from current reality (re-upload when they change, or
connect the GitHub repo if you use that integration):

- [`CLAUDE.md`](../CLAUDE.md) — architecture, build pipeline, guardrails (the most important one).
- [`docs/ROADMAP.md`](./ROADMAP.md) — what's shipped, launch state, backlog priorities.
- [`docs/BRANCHING.md`](./BRANCHING.md) — the develop→main flow the brief feeds into.
- This file (`docs/WORKFLOW.md`) — the handover model + brief template.
- The **relevant feature doc** for the thing under discussion (e.g. `PAYMENTS.md`, `MEDIA.md`,
  `MOTION.md`, `DATA-COMPLIANCE.md`) — attach per-topic, not all at once.

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

1. **Paste the brief** into a new Claude Code session and run **`/deliver`** (the brief as its
   argument). The command runs the delivery loop: read `CLAUDE.md` + the relevant docs, explore the
   affected code, **re-query the design** where the brief is ambiguous or fights best practice
   (delegating a deep look to the `design-reviewer` subagent when useful), plan, implement on a
   `feat/*` branch off `develop`, then `npm test` + `npm run build` + `npm run lint`, a security
   pass, and prepare the PR into `develop` with the brief as the body.
2. **Mind the web-session realities** (full detail in `CLAUDE.md` → *Working in a Claude Code web
   session*): the unit suites run in the sandbox, but the **E2E/visual check cannot** — that gate
   is the PR's E2E workflow plus a local/human review, not a skipped sandbox run. Remote-ref
   surgery (branch deletion, rebasing others' branches) also can't happen from a web session.
3. **Land it** per [`BRANCHING.md`](./BRANCHING.md): squash-merge the feature PR into `develop`,
   exercise it on staging, and batch it into the next `develop → main` release.
