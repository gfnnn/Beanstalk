// src/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker entry point — one Worker, three routes, replacing the three
// Netlify functions. Each route's logic lives in ../handlers and keeps the simple
// `(event, env) → { statusCode, headers, body }` shape; this shell adapts the
// Workers Request/Response to that and back.
//
//   POST /enquiry       enquiry + flash-claim forms
//   POST /newsletter    newsletter signup
//   GET  /flash-status  live flash availability
//
// Bindings/vars come from wrangler.toml + Worker secrets (RESEND_API_KEY, …) and
// the D1 database (`DB`). See docs/ENQUIRY-SETUP.md for setup.
// ─────────────────────────────────────────────────────────────────────────────
import { toEvent } from './lib/http.js'
import { handler as enquiry } from './handlers/enquiry.js'
import { handler as newsletter } from './handlers/newsletter.js'
import { handler as flashStatus } from './handlers/flash-status.js'

const ROUTES = {
  '/enquiry': enquiry,
  '/newsletter': newsletter,
  '/flash-status': flashStatus,
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
    const handler = ROUTES[path]
    if (!handler) {
      return new Response(JSON.stringify({ error: 'Not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const event = await toEvent(request)
    const res = await handler(event, env)
    // 204 (and any empty-body reply) must have a null body, per the Fetch spec.
    return new Response(res.body || null, { status: res.statusCode, headers: res.headers })
  },
}
