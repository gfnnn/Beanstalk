// src/handlers/failed-digest.js
// ─────────────────────────────────────────────────────────────────────────────
// Daily cron (wrangler.toml → [triggers]). Enquiries and flash claims are stored
// in D1 before the notification email is sent, so a Resend failure never loses
// one — but nobody would know it was there. This emails the artist a short list
// of any submission whose notification didn't go out, so she can reply by hand.
//
// If this send fails too (Resend still down), the rows stay unreported and are
// retried on the next run. Sends nothing when there is nothing to report.
// ─────────────────────────────────────────────────────────────────────────────
import { escHtml as esc } from '../lib/http.js'
import { listUnsentSubmissions, markSubmissionsReported } from '../lib/db.js'

const PENDING_GRACE_MS = 15 * 60_000   // a send in flight isn't "lost" yet

export async function failedDigest(env = {}, now = Date.now()) {
  const { RESEND_API_KEY, ARTIST_EMAIL, FROM_EMAIL } = env
  if (!RESEND_API_KEY || !ARTIST_EMAIL || !FROM_EMAIL) {
    console.error('failed-digest: email env vars missing — the forms cannot send either')
    return { reported: 0 }
  }
  const rows = await listUnsentSubmissions(env, new Date(now - PENDING_GRACE_MS).toISOString())
  if (!rows.length) return { reported: 0 }

  const line = r => `${r.kind === 'flash' ? 'Flash claim' : 'Enquiry'} from ${r.email || 'unknown address'}, received ${r.received_at}`
  const intro = `${rows.length} form submission${rows.length > 1 ? 's' : ''} did not reach your inbox. ` +
    'They are saved, but the notification email failed, so please contact these people directly:'
  const outro = 'The full details are in the submissions table (see docs/DATA-COMPLIANCE.md). ' +
    'If this keeps happening, check the Resend dashboard for the sending domain and API key.'
  const from = FROM_EMAIL.includes('<') ? FROM_EMAIL : `Beansprout <${FROM_EMAIL}>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [ARTIST_EMAIL],
        subject: `Action needed — ${rows.length} submission${rows.length > 1 ? 's' : ''} did not reach you`,
        html: `<p>${esc(intro)}</p><ul>${rows.map(r => `<li>${esc(line(r))}</li>`).join('')}</ul><p>${esc(outro)}</p>`,
        text: `${intro}\n\n${rows.map(r => `- ${line(r)}`).join('\n')}\n\n${outro}`,
      }),
    })
    if (!res.ok) {
      console.error('failed-digest: Resend error', res.status, await res.text().catch(() => ''))
      return { reported: 0 }
    }
  } catch (err) {
    console.error('failed-digest: send failed', err?.message || err)
    return { reported: 0 }
  }
  await markSubmissionsReported(env, rows.map(r => r.id))
  return { reported: rows.length }
}
