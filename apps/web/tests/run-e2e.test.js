// Tests for scripts/run-e2e.mjs — the guard in front of the Playwright tier.
// Its contract is the difference between "skipped" and "silently green": with no
// Chromium binary it must skip cleanly (exit 0) on a dev machine or sandbox, but
// REFUSE to skip in CI, where a missing browser means the install step broke and
// exit 0 would turn the whole E2E gate into a no-op on every PR.
//
// The script is run for real as a child process, with PLAYWRIGHT_BROWSERS_PATH
// pointed at an empty directory so Playwright resolves a binary that isn't there.
// (The "binary present" branch just execs `playwright test` — that's the E2E run
// itself, so it isn't repeated here.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/run-e2e.mjs', import.meta.url))
const webRoot = path.dirname(path.dirname(script))

let emptyBrowsers
beforeAll(() => { emptyBrowsers = mkdtempSync(path.join(os.tmpdir(), 'no-browsers-')) })
afterAll(() => { rmSync(emptyBrowsers, { recursive: true, force: true }) })

function run(extraEnv) {
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: emptyBrowsers, ...extraEnv }
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k]
  return spawnSync(process.execPath, [script], { cwd: webRoot, env, encoding: 'utf8', timeout: 30_000 })
}

describe('run-e2e.mjs with no Chromium installed', () => {
  it('skips cleanly (exit 0) outside CI and says how to install the browser', () => {
    const r = run({ CI: undefined })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Skipping Playwright E2E')
    expect(r.stdout).toContain('npx playwright install chromium')
  }, 40_000)

  it('fails (exit 1) in CI rather than skipping the gate', () => {
    const r = run({ CI: 'true' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('refusing to skip the E2E gate')
    expect(r.stdout).not.toContain('Skipping Playwright E2E')
  }, 40_000)
})
