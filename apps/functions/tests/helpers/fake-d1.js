// tests/helpers/fake-d1.js
// ─────────────────────────────────────────────────────────────────────────────
// A tiny in-memory stand-in for the Cloudflare D1 binding, just rich enough to
// run the real src/lib/db.js statements. Dispatching on the (whitespace-
// normalised) SQL string keeps the storage logic — reserve atomicity, the rate
// window/ceiling, fail-safe writes — exercised for real in the handler tests,
// the same way the old suite ran the real logic against an in-memory Blobs Map.
// If db.js gains a new statement, add a branch here.
// ─────────────────────────────────────────────────────────────────────────────

export function makeD1() {
  const data = { submissions: new Map(), consent: new Map(), flash: new Map(), rate: [] }

  function exec(sql, args) {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s.startsWith('INSERT INTO submissions')) {
      const [id, kind, email, received_at, ip, fields, image_count, image_names, skipped, email_status] = args
      const existing = data.submissions.get(id)
      if (existing) { existing.email_status = email_status; return { meta: { changes: 1 } } }
      data.submissions.set(id, { id, kind, email, received_at, ip, fields, image_count, image_names, skipped, email_status })
      return { meta: { changes: 1 } }
    }
    if (s.startsWith('INSERT INTO newsletter_consent')) {
      const [id, email, first_name, consented_at, statement, version, source, ip] = args
      data.consent.set(id, { id, email, first_name, consented_at, statement, version, source, ip })
      return { meta: { changes: 1 } }
    }
    if (s.startsWith('SELECT piece_id, status FROM flash_claims')) {
      return { results: [...data.flash.entries()].map(([piece_id, v]) => ({ piece_id, status: v.status })) }
    }
    if (s.startsWith('INSERT INTO flash_claims')) {
      const [piece_id, updated_at] = args
      if (data.flash.has(piece_id)) return { meta: { changes: 0 } }   // ON CONFLICT DO NOTHING
      data.flash.set(piece_id, { status: 'pending', updated_at })
      return { meta: { changes: 1 } }
    }
    if (s.startsWith('SELECT status FROM flash_claims WHERE piece_id')) {
      const row = data.flash.get(args[0])
      return row ? { status: row.status } : null
    }
    if (s.startsWith('DELETE FROM flash_claims')) {
      const row = data.flash.get(args[0])
      if (row && row.status === 'pending') data.flash.delete(args[0])
      return { meta: { changes: 1 } }
    }
    if (s.startsWith('SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ?1 AND ts >')) {
      const [bucket, ts] = args
      return { n: data.rate.filter(r => r.bucket === bucket && r.ts > ts).length }
    }
    if (s.startsWith('SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ?1')) {
      const [bucket] = args
      return { n: data.rate.filter(r => r.bucket === bucket).length }
    }
    if (s.startsWith('INSERT INTO rate_events')) {
      const [bucket, ts] = args
      data.rate.push({ bucket, ts })
      return { meta: { changes: 1 } }
    }
    if (s.startsWith('DELETE FROM rate_events WHERE bucket LIKE')) {
      const [pattern, ts] = args
      const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$')
      data.rate = data.rate.filter(r => !(re.test(r.bucket) && r.ts < ts))
      return { meta: { changes: 1 } }
    }
    if (s.startsWith('DELETE FROM rate_events')) {
      const [bucket, ts] = args
      data.rate = data.rate.filter(r => !(r.bucket === bucket && r.ts < ts))
      return { meta: { changes: 1 } }
    }
    throw new Error(`FakeD1: unhandled SQL: ${s}`)
  }

  const DB = {
    prepare(sql) {
      let bound = []
      const stmt = {
        bind(...a) { bound = a; return stmt },
        async run() { return exec(sql, bound) },
        async all() { const r = exec(sql, bound); return r && 'results' in r ? r : { results: [] } },
        async first() { const r = exec(sql, bound); return r && 'results' in r ? (r.results[0] ?? null) : r },
      }
      return stmt
    },
    async batch(stmts) { const out = []; for (const st of stmts) out.push(await st.run()); return out },
  }

  return { DB, data }
}

// A binding that throws on every access — exercises the fail-open / fail-safe
// paths (a DB outage must never block a genuine submission).
export function brokenD1() {
  const boom = () => { throw new Error('D1 down') }
  return { prepare: boom, batch: boom }
}

// Convenience: the flash inventory as a plain { piece_id: status } map.
export const flashMap = (data) =>
  Object.fromEntries([...data.flash.entries()].map(([k, v]) => [k, v.status]))
