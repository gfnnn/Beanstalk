#!/usr/bin/env node
// preview-branch.mjs — pull a branch's latest and run the dev server, in one command.
//
// This is the "look at it on my own machine" helper: from a LOCAL clone (not a web
// session), it fetches a branch, checks it out, fast-forwards to the remote tip,
// installs dependencies, and starts the Vite dev server so you can browse the work.
//
//   npm run preview:branch -- <branch>            # fetch + switch + pull + install + dev
//   npm run preview:branch                        # same, for the branch you're already on
//   npm run preview:branch -- <branch> --no-serve # do everything except start the server
//
// Fails safe: it uses `git switch` and `git pull --ff-only`, so it never discards
// uncommitted local work or forces a surprise merge — if either can't proceed cleanly
// it stops with the git error rather than guessing.
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const noServe = args.includes('--no-serve') || process.env.PREVIEW_NO_SERVE === '1'
const branchArg = args.find((a) => !a.startsWith('-'))
// npm is a .cmd shim on Windows; git is a plain binary everywhere. Node ≥18.20/
// 20.12/22.x refuses to spawn .bat/.cmd without a shell (the CVE-2024-27980
// mitigation), so the npm shim needs `shell: true` there — none of our args
// contain spaces, so shell joining is safe. git stays shell-less on every OS.
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const spawnOpts = (cmd, extra) =>
  ({ ...extra, shell: cmd === npmBin && process.platform === 'win32' })

function capture(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, spawnOpts(cmd, { encoding: 'utf8' }))
  return (r.stdout || '').trim()
}

function run(cmd, cmdArgs) {
  const printable = [cmd, ...cmdArgs].join(' ')
  console.log(`\n$ ${printable}`)
  const r = spawnSync(cmd, cmdArgs, spawnOpts(cmd, { stdio: 'inherit' }))
  if (r.status !== 0) {
    console.error(`\n✗ \`${printable}\` failed (exit ${r.status ?? '?'}). Stopping.`)
    process.exit(r.status ?? 1)
  }
}

if (capture('git', ['rev-parse', '--is-inside-work-tree']) !== 'true') {
  console.error('✗ Not inside a git repository — run this from your clone of the repo.')
  process.exit(1)
}

const current = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
const branch = branchArg || current
console.log(`Previewing branch: ${branch}${branch === current ? ' (already checked out)' : ''}`)

// 1. Fetch just that branch from origin.
run('git', ['fetch', 'origin', branch])

// 2. Switch to it — create a local tracking branch the first time we see it.
if (branch !== current) {
  const haveLocal = capture('git', ['branch', '--list', branch]) !== ''
  run('git', haveLocal ? ['switch', branch] : ['switch', '-c', branch, '--track', `origin/${branch}`])
}

// 3. Fast-forward to the remote tip (no merge commits; stops if the branch diverged).
run('git', ['pull', '--ff-only', 'origin', branch])

// 4. Install (idempotent and quick when already up to date).
run(npmBin, ['install', '--no-audit', '--no-fund'])

// 5. Serve — or stop here if the caller only wanted the checkout prepared.
if (noServe) {
  console.log('\n✓ Checked out and installed (--no-serve). Start it with:  npm run dev')
  process.exit(0)
}
console.log('\n▶ Starting the Vite dev server → http://localhost:5173  (Ctrl-C to stop)')
run(npmBin, ['run', 'dev'])
