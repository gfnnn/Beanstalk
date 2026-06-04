#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// data-admin.mjs — offline GDPR runbook for the Netlify Blobs data stores.
// ─────────────────────────────────────────────────────────────────────────────
// The "do the least to be compliant" erasure + retention path (see
// docs/DATA-COMPLIANCE.md). It is a LOCAL operator tool, run by hand against the
// live Blobs stores — deliberately NOT a deployed endpoint, so it adds zero new
// public attack surface. It gives us a working way to honour a UK-GDPR access /
// erasure request and to prune data past its retention window.
//
// The stores hold personal (and special-category) data:
//   • submissions       — enquiries + flash claims  { fields:{email,…}, receivedAt, … }
//   • newsletter-consent— the consent ledger        { email, consentedAt, … }
//   • flash-claims       — piece-id → status map (NOT personal; reservation only)
//
// ── Auth ─────────────────────────────────────────────────────────────────────
// Runs in Blobs "manual mode", so it needs a site id + a Netlify API token:
//   NETLIFY_SITE_ID   = Netlify → Site configuration → General → Site ID
//   NETLIFY_API_TOKEN = Netlify → User settings → Applications → personal token
// (NETLIFY_AUTH_TOKEN is accepted as an alias.) Never commit these.
//
// ── Usage ────────────────────────────────────────────────────────────────────
//   node apps/functions/scripts/data-admin.mjs list [submissions|consent|flash]
//   node apps/functions/scripts/data-admin.mjs get <store> <key>
//   node apps/functions/scripts/data-admin.mjs find <email>      # access request
//   node apps/functions/scripts/data-admin.mjs delete <store> <key>   # erasure
//   node apps/functions/scripts/data-admin.mjs prune [--days N] [--apply]
//
// `prune` and `delete` DRY-RUN by default; pass --apply (prune) or --yes (delete)
// to actually write. Always `find`/`list` first to confirm the key.
// ─────────────────────────────────────────────────────────────────────────────
import { getStore } from '@netlify/blobs'

// Privacy page promises enquiries that don't lead to a booking are kept "up to
// 12 months". That is the default retention window for the submissions store.
export const RETENTION_DAYS_DEFAULT = 365

export const STORES = {
  submissions: { name: 'submissions',        personal: true,  tsField: 'receivedAt'  },
  consent:     { name: 'newsletter-consent', personal: true,  tsField: 'consentedAt' },
  flash:       { name: 'flash-claims',       personal: false, tsField: null          },
}

// ── Pure helpers (unit-tested in tests/data-admin.test.js) ───────────────────

// The email a record concerns, wherever it lives in the two record shapes.
export function recordEmail(record) {
  if (!record || typeof record !== 'object') return ''
  return String(record.email || record.fields?.email || '').trim().toLowerCase()
}

// The record's timestamp (ISO string) — submissions use receivedAt, consent uses
// consentedAt. Falls back to the timestamp embedded in the blob key if absent.
export function recordTimestamp(record, key = '') {
  const iso = record?.receivedAt || record?.consentedAt
  if (iso) return iso
  // keys look like `enquiry/2026-06-04T12-30-00-000Z-ab12cd` or `2026-…-email`
  const m = String(key).match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z` : null
}

// Age in whole days, or null if the timestamp can't be read (never auto-pruned).
export function ageDays(record, key, now = Date.now()) {
  const iso = recordTimestamp(record, key)
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000)
}

// True when a record is older than the retention window (and datable).
export function isExpired(record, key, days, now = Date.now()) {
  const age = ageDays(record, key, now)
  return age != null && age > days
}

// One-line summary for `list` / `find` output.
export function summarise(key, record) {
  const email = recordEmail(record) || '—'
  const ts = recordTimestamp(record, key) || '?'
  const extra = record?.kind ? `kind=${record.kind} email=${record.emailStatus || '?'}`
              : record?.consentVersion ? `consent v${record.consentVersion}`
              : ''
  return `${ts}  ${key}\n    ${email}  ${extra}`.trimEnd()
}

// ── Blobs plumbing ───────────────────────────────────────────────────────────

function connect(storeKey) {
  const cfg = STORES[storeKey]
  if (!cfg) die(`Unknown store "${storeKey}". One of: ${Object.keys(STORES).join(', ')}`)
  const siteID = process.env.NETLIFY_SITE_ID
  const token  = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN
  if (!siteID || !token) {
    die('Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN (see the header of this file).')
  }
  return getStore({ name: cfg.name, siteID, token })
}

async function listKeys(store) {
  // @netlify/blobs list() resolves to { blobs:[{key}], directories:[] } and
  // auto-paginates internally; fine at studio volume.
  const { blobs } = await store.list()
  return blobs.map(b => b.key)
}

async function eachRecord(store, fn) {
  for (const key of await listKeys(store)) {
    const record = await store.get(key, { type: 'json' }).catch(() => null)
    await fn(key, record)
  }
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdList(storeKey = 'submissions') {
  const store = connect(storeKey)
  let n = 0
  await eachRecord(store, (key, record) => { console.log(summarise(key, record)); n++ })
  console.log(`\n${n} record(s) in "${STORES[storeKey].name}".`)
}

async function cmdGet(storeKey, key) {
  if (!storeKey || !key) die('usage: get <store> <key>')
  const record = await connect(storeKey).get(key, { type: 'json' })
  console.log(JSON.stringify(record, null, 2))
}

// Subject-access helper: an erasure/access request arrives as an email address,
// so scan the two personal stores for every record that concerns it.
async function cmdFind(email) {
  if (!email) die('usage: find <email>')
  const needle = email.trim().toLowerCase()
  for (const k of ['submissions', 'consent']) {
    const store = connect(k)
    console.log(`\n# ${STORES[k].name}`)
    await eachRecord(store, (key, record) => {
      if (recordEmail(record) === needle) console.log(`  delete ${k} ${key}`)
    })
  }
  console.log('\nReview, then run the `delete` lines above with --yes to erase.')
}

async function cmdDelete(storeKey, key, apply) {
  if (!storeKey || !key) die('usage: delete <store> <key> [--yes]')
  const store = connect(storeKey)
  const record = await store.get(key, { type: 'json' }).catch(() => null)
  console.log(summarise(key, record))
  if (!apply) return console.log('\nDRY RUN — re-run with --yes to erase this record.')
  await store.delete(key)
  console.log(`\nErased ${storeKey}/${key}.`)
}

async function cmdPrune(days, apply) {
  const store = connect('submissions')
  const now = Date.now()
  const doomed = []
  await eachRecord(store, (key, record) => {
    if (isExpired(record, key, days, now)) doomed.push(key)
  })
  doomed.forEach(k => console.log(`  ${apply ? 'deleting' : 'would delete'} ${k}`))
  console.log(`\n${doomed.length} record(s) older than ${days} days.`)
  if (!apply) return console.log('DRY RUN — re-run with --apply to delete them.')
  for (const key of doomed) await store.delete(key)
  console.log(`Deleted ${doomed.length} record(s).`)
  console.log('NOTE: records for tattoos actually carried out may need a longer,')
  console.log('insurer/LA-mandated retention — keep those out of this store or skip them.')
}

function die(msg) { console.error(msg); process.exit(1) }

const HELP = `data-admin — GDPR runbook for the Beansprout Blobs stores

  list [submissions|consent|flash]   list records (default submissions)
  get <store> <key>                  print one record as JSON
  find <email>                       find a person's records across stores
  delete <store> <key> [--yes]       erase one record (dry-run without --yes)
  prune [--days N] [--apply]         delete submissions older than N (default ${RETENTION_DAYS_DEFAULT})

Auth: set NETLIFY_SITE_ID and NETLIFY_API_TOKEN. See docs/DATA-COMPLIANCE.md.`

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const flag = (name) => rest.includes(name)
  const opt  = (name, d) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : d }
  const pos  = rest.filter(a => !a.startsWith('--') && a !== opt('--days'))

  switch (cmd) {
    case 'list':   return cmdList(pos[0])
    case 'get':    return cmdGet(pos[0], pos[1])
    case 'find':   return cmdFind(pos[0])
    case 'delete': return cmdDelete(pos[0], pos[1], flag('--yes'))
    case 'prune':  return cmdPrune(Number(opt('--days', RETENTION_DAYS_DEFAULT)), flag('--apply'))
    default:       console.log(HELP); if (cmd) process.exitCode = 1
  }
}

// Only run the CLI when invoked directly, so tests can import the pure helpers.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => die(err?.message || String(err)))
}
