#!/usr/bin/env node
// Guarded entry point for the Playwright E2E tier.
//
// The browser binary is downloaded from cdn.playwright.dev, a host some sandboxes
// (e.g. Claude Code on the web) block — so a bare `playwright test` there dies on
// infrastructure, not on the code, which reads as a pointless red failure. This
// wrapper checks for an installed Chromium first:
//
//   • binary present  → run `playwright test` (forwarding any extra args) as normal.
//   • binary missing  → print a clear note and exit 0 (skip), so the tier is a
//                       no-op where it physically can't run instead of a failure.
//
// CI installs the browser explicitly (`npx playwright install --with-deps chromium`
// in .github/workflows/e2e.yml), so the suite always executes there. Locally, run
// the same install once and this wrapper will pick the browser up.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

let executable = ''
try {
  executable = chromium.executablePath()
} catch {
  // Older API or unresolvable path — treated as "not installed" below.
}

if (!executable || !existsSync(executable)) {
  // The clean skip is for sandboxes/local machines ONLY. In CI the workflow has
  // already run `playwright install` — a missing binary there means the install
  // step was removed/reordered or the browsers path diverged, and exiting 0
  // would turn the whole E2E gate into a silently-green no-op on every PR.
  if (process.env.CI) {
    console.error('✖ Chromium binary missing in CI — refusing to skip the E2E gate.')
    process.exit(1)
  }
  console.log(
    [
      '',
      '⏭  Skipping Playwright E2E: no Chromium binary installed.',
      '   Install it with:  npx playwright install chromium',
      '   (needs network access to cdn.playwright.dev). CI does this automatically;',
      '   web sandboxes block that host, so this tier is CI/local-only — not a failure.',
      '',
    ].join('\n'),
  )
  process.exit(0)
}

const result = spawnSync('playwright', ['test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  // A shell is only needed on Windows, where the npm-installed `playwright` CLI
  // is a .cmd shim (which Node ≥18.20 refuses to spawn shell-less). On POSIX,
  // spawning directly keeps forwarded args intact — under shell:true Node joins
  // args without re-quoting, so e.g. `--grep "two words"` would split in two.
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
