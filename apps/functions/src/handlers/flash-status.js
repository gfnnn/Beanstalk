// src/handlers/flash-status.js
// ─────────────────────────────────────────────────────────────────────────────
// Read-only endpoint the flash grid calls on load to reflect LIVE availability.
// The grid ships as static HTML (status baked in at build), so without this a
// piece claimed since the last build would still look available. Returns the map
// of claimed/pending piece ids written by the enquiry function's flash claims.
//
//   GET → 200 { claims: { "<piece-id>": "pending" | "claimed", … } }
//
// No secrets, no writes. CORS + the D1-backed state are shared with the other
// functions (see ../lib). Fails safe to an empty map.
// ─────────────────────────────────────────────────────────────────────────────
import { corsFor, replyWith } from '../lib/http.js'
import { getFlashClaims } from '../lib/db.js'

export async function handler(event, env = {}) {
  const cors  = corsFor(event)
  const reply = replyWith(cors)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' }
  if (event.httpMethod !== 'GET')     return reply(405, { error: 'Method not allowed.' })

  const claims = await getFlashClaims(env)
  return reply(200, { claims })
}
