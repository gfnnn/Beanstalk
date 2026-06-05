#!/bin/bash
# SessionStart hook — prepares a Claude Code on the web session so the agent lands
# in a *working* repo: dependencies installed, so the first `npm test` / `npm run
# build` just works instead of failing on a missing node_modules.
#
# Runs in the remote (web) container only — a developer's local machine manages its
# own node_modules and isn't touched. Synchronous (no async JSON banner below): the
# session waits for the install to finish, so there's no race where the agent runs a
# command before the dependencies exist.
set -euo pipefail

# No-op outside the remote web environment (e.g. a developer running Claude locally).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# npm workspaces: a single install at the root hoists both apps/web and
# apps/functions into the root node_modules. `npm install` (not `npm ci`) so a
# resumed session reuses the cached container layer instead of a clean reinstall.
echo "[session-start] installing workspace dependencies (npm install)…"
npm install --no-audit --no-fund

# NB: the Playwright E2E browser binary is deliberately NOT downloaded here.
# cdn.playwright.dev is outside the web sandbox's network allowlist (the download
# 403s), so the E2E tier is CI/local-only — see CLAUDE.md → "Tests in a web session".
echo "[session-start] dependencies ready."
