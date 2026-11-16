---
description: "Security rules for GitHub Actions workflows"
paths:
  - ".github/workflows/**"
---

# CI / GitHub Actions security

The repo ships five workflows (`.github/workflows/`) and **no AI/agent action** — keep it
that way unless there's a clear reason, and follow these rules if that changes. (The Worker
deploys via **Cloudflare Workers Builds** — Git-connected on Cloudflare's side, holding its
own scoped API token there — so there is intentionally no Cloudflare token in GitHub.)

- **Least-privilege tokens.** `test.yml` and `e2e.yml` both run with `permissions:
  contents: read` — don't widen them. `deploy-web.yml` declares `id-token: write` **on
  purpose**: it's GitHub's own OIDC, required by `actions/deploy-pages@v5` to verify the
  Pages artifact. It is *not* an Anthropic/Claude token exchange, and the workflow only
  triggers on `push` to `main` and manual `workflow_dispatch` — never on
  attacker-controllable input — so there's no injection path. Leave it as-is.
  `media-sync.yml` is the one workflow holding write scope (`contents: write` +
  `pull-requests: write`, to push a branch and open the Dropbox-sync PR), but it's
  **`workflow_dispatch`-only** — a collaborator clicks "Run workflow", never an automatic
  trigger — the same safe model as `deploy-web.yml`'s manual/push-to-`main` triggers, so
  the elevated scope can't be reached by untrusted input.
- **Never run a workflow's privileged half on untrusted input.** Don't trigger build/deploy
  or any token-bearing job from `pull_request_target`, `issue_comment`, `issues`, or
  `workflow_run`. Untrusted-PR CI stays read-only (as `test.yml` is).
- **If you ever adopt `anthropics/claude-code-action`** (or any AI-in-CI action): pin it to a
  commit SHA (not a floating tag) at **v1.0.94 or later**, never set
  `allowed_non_write_users: "*"`, keep it off issue/PR/comment triggers (or require a
  human-actor check), and scope its secrets to only the Anthropic API key + `GITHUB_TOKEN`.
  A 2025 disclosure (CVE-class supply-chain bug, fixed in v1.0.94) let an external attacker
  bypass the write-access gate via a `[bot]` GitHub App, prompt-inject through a crafted
  issue, and exfiltrate OIDC/secret tokens — the above settings are the guardrails against it.
- **The human PR-review gate on `main` is part of the security model**, not just hygiene —
  every deploy flows through a reviewed release PR. Preserve it.
