#!/usr/bin/env node
// smoke-test.mjs — post-deploy health check for a Beansprout deployment.
//
// A standalone, dependency-free probe (plain Node + global fetch, Node ≥22) you
// point at a live site + Worker to assert the deploy is wired and safe. It is the
// automatable, reusable half of the launch runbook (docs/CUTOVER.md → Phase 3) —
// the human acceptance round-trip (real enquiry email, deliverability) stays manual
// (docs/ROADMAP.md → "the end-to-end email test, run b"). Run it on the apex at
// cutover AND on every release to main thereafter.
//
//   node scripts/smoke-test.mjs                         # apex + production Worker
//   node scripts/smoke-test.mjs https://beansprout.ink
//   node scripts/smoke-test.mjs https://<x>.pages.dev --worker https://<w>.workers.dev
//   npm run smoke -- https://beansprout.ink
//
// It asserts:
//   • key pages return 200 over HTTPS (no http downgrade)
//   • the site CSP + Referrer-Policy <meta> tags are present (Pages serves the
//     policy as <meta>, not a header — see apps/web/src/build/security.js)
//   • on the apex, the page is NOT a noindex staging build (a cutover footgun)
//   • the Worker's JSON security response headers are set (nosniff / default-src
//     'none' / no-referrer — apps/functions/src/lib/http.js)
//   • GET /flash-status is 200 with a claims map
//   • POST /checkout returns 503 (payments stay dark through launch)
//   • POST /enquiry and /newsletter accept a request (200) — via the HONEYPOT path,
//     so the probe seeds NO D1 PII and sends NO email (see the note on those checks)
//
// Exits non-zero if any check fails (0 = all pass, 1 = failure, 2 = bad usage).

const DEFAULT_SITE = 'https://beansprout.ink'
const DEFAULT_WORKER = 'https://beansprout-forms.harrisonfisher1990.workers.dev'
const TIMEOUT_MS = 15000

// Key indexable pages — kept in step with ROUTES in apps/web/src/build/seo.js.
const PAGES = [
  '/', '/portfolio/', '/flash/', '/services/', '/enquire/', '/about/',
  '/visit/', '/faq/', '/aftercare/', '/newsletter/', '/privacy/', '/terms/',
]

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { site: '', worker: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--worker') out.worker = argv[++i] || ''
    else if (a.startsWith('--worker=')) out.worker = a.slice('--worker='.length)
    else if (a === '-h' || a === '--help') out.help = true
    else if (!a.startsWith('-') && !out.site) out.site = a
  }
  return out
}

function usage() {
  console.log(
    'Usage: node scripts/smoke-test.mjs [siteUrl] [--worker <workerUrl>]\n' +
      `  siteUrl   default ${DEFAULT_SITE}\n` +
      `  --worker  default ${DEFAULT_WORKER}`,
  )
}

// Strip a trailing slash so we can join paths cleanly.
const trimSlash = (u) => u.replace(/\/+$/, '')

async function fetchWithTimeout(url, opts = {}) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { signal: ac.signal, redirect: 'follow', ...opts })
  } finally {
    clearTimeout(t)
  }
}

// ── tiny test harness ────────────────────────────────────────────────────────
const results = []
async function check(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name}`)
  } catch (err) {
    results.push({ name, ok: false, err })
    console.log(`  ✗ ${name}\n      ${err.message}`)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const jsonHeaders = { 'Content-Type': 'application/json' }

// ── checks ───────────────────────────────────────────────────────────────────
async function run() {
  const { site: siteArg, worker: workerArg, help } = parseArgs(process.argv.slice(2))
  if (help) {
    usage()
    process.exit(0)
  }
  const site = trimSlash(siteArg || DEFAULT_SITE)
  const worker = trimSlash(workerArg || DEFAULT_WORKER)

  if (!/^https:\/\//i.test(site)) {
    console.error(`✗ Site URL must be HTTPS (got "${site}"). The security checks are meaningless over plaintext.`)
    process.exit(2)
  }
  if (!/^https:\/\//i.test(worker)) {
    console.error(`✗ Worker URL must be HTTPS (got "${worker}").`)
    process.exit(2)
  }

  const isApex = /^https:\/\/(www\.)?beansprout\.ink$/i.test(site)

  console.log(`\nSmoke-testing\n  site:   ${site}\n  worker: ${worker}\n`)

  // 1. Key pages return 200 over HTTPS, no downgrade. Capture the homepage body
  //    once for the markup assertions below.
  console.log('Pages (200 over HTTPS):')
  let homeHtml = ''
  for (const path of PAGES) {
    const url = site + path
    await check(`GET ${path} → 200`, async () => {
      const res = await fetchWithTimeout(url)
      assert(res.status === 200, `expected 200, got ${res.status}`)
      assert(res.url.startsWith('https://'), `redirected off HTTPS to ${res.url}`)
      if (path === '/') homeHtml = await res.text()
    })
  }

  // 2. Site CSP + Referrer-Policy delivered as <meta> (Pages can't set them as
  //    response headers — see apps/web/src/build/security.js).
  console.log('\nSite security policy (<meta> in HTML):')
  await check('homepage carries a Content-Security-Policy <meta>', () => {
    assert(/http-equiv=["']Content-Security-Policy["']/i.test(homeHtml), 'no CSP <meta> in homepage HTML')
    assert(/default-src 'self'/.test(homeHtml), "CSP <meta> present but missing default-src 'self'")
  })
  await check('homepage carries a Referrer-Policy <meta>', () => {
    assert(/<meta[^>]+name=["']referrer["']/i.test(homeHtml), 'no referrer <meta> in homepage HTML')
  })

  // 3. Cutover footgun: a noindex staging build must never be live on the apex.
  if (isApex) {
    console.log('\nApex indexability (not a staging build):')
    await check('apex homepage is NOT noindex', () => {
      assert(
        !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(homeHtml),
        'apex is serving a noindex staging build — the production CNAME build did not deploy',
      )
    })
  }

  // 4. Worker JSON security response headers + read-only flash-status.
  console.log('\nWorker /flash-status (live availability + JSON security headers):')
  await check('GET /flash-status → 200 with a claims map', async () => {
    const res = await fetchWithTimeout(`${worker}/flash-status`)
    assert(res.status === 200, `expected 200, got ${res.status}`)
    assert(res.headers.get('x-content-type-options') === 'nosniff', 'missing X-Content-Type-Options: nosniff')
    assert(res.headers.get('content-security-policy') === "default-src 'none'", "missing CSP default-src 'none'")
    assert(res.headers.get('referrer-policy') === 'no-referrer', 'missing Referrer-Policy: no-referrer')
    const body = await res.json()
    assert(body && typeof body.claims === 'object', 'response has no claims object')
  })

  // 5. Payments stay dark through launch: /checkout must decline with 503.
  console.log('\nWorker /checkout (payments off → 503):')
  await check('POST /checkout → 503 (PAYMENTS_ENABLED is false)', async () => {
    const res = await fetchWithTimeout(`${worker}/checkout`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ kind: 'flash', piece_id: 'smoke-test', fields: { name: 'SMOKE', email: 'smoke@example.invalid' } }),
    })
    assert(res.status === 503, `expected 503, got ${res.status} — has PAYMENTS_ENABLED been turned on?`)
  })

  // 6 & 7. Enquiry + newsletter happy-path, via the HONEYPOT.
  //   The honeypot (_gotcha) is checked AFTER the handler's env-config guard but
  //   BEFORE any validation, persistence, rate-limit, or Resend send — so a 200
  //   { ok:true } proves the route is live AND the production secrets are
  //   configured (a missing RESEND_API_KEY etc. would 500 first), while writing
  //   NO D1 row and sending NO email. That is exactly the "no real PII, no Stripe
  //   keys" probe the runbook needs on every deploy. The full email round-trip is
  //   the manual acceptance test (ROADMAP → run "b").
  console.log('\nWorker forms (honeypot happy-path — no PII stored, no email sent):')
  await check('POST /enquiry → 200 ok', async () => {
    const res = await fetchWithTimeout(`${worker}/enquiry`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        kind: 'enquiry',
        fields: { first_name: 'SMOKE', last_name: 'TEST', email: 'smoke@example.invalid', _gotcha: 'smoke-test' },
      }),
    })
    assert(res.status === 200, `expected 200, got ${res.status}`)
    const body = await res.json()
    assert(body && body.ok === true, `expected { ok: true }, got ${JSON.stringify(body)}`)
  })
  await check('POST /newsletter → 200 ok', async () => {
    const res = await fetchWithTimeout(`${worker}/newsletter`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ fields: { email: 'smoke@example.invalid', consent: true, _gotcha: 'smoke-test' } }),
    })
    assert(res.status === 200, `expected 200, got ${res.status}`)
    const body = await res.json()
    assert(body && body.ok === true, `expected { ok: true }, got ${JSON.stringify(body)}`)
  })

  // ── summary ─────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length ? '✗' : '✓'} ${results.length - failed.length}/${results.length} checks passed.`)
  if (failed.length) {
    console.log('Failed:')
    for (const f of failed) console.log(`  • ${f.name}`)
    process.exit(1)
  }
  process.exit(0)
}

run().catch((err) => {
  console.error(`\n✗ Smoke test crashed: ${err.stack || err.message}`)
  process.exit(1)
})
