// netlify/functions/enquiry.js
// ─────────────────────────────────────────────────────────────────────────────
// Beansprout form handler — serves both the enquiry form and the flash-claim
// form, told apart by `kind` ('enquiry' | 'flash').
//
// Receives JSON  { kind?, fields: {...}, images?: [{ name, type, data(base64) }] }
// validates it, builds a formatted email, and sends it via Resend to the
// artist's inbox (reference images attached, for enquiries).
//
// Required environment variables (Netlify → Site configuration → Environment):
//   RESEND_API_KEY   re_xxxxxxxx           (resend.com → API Keys)
//   ARTIST_EMAIL     inbox that receives submissions
//   FROM_EMAIL       roxy@beansprout.ink   (must be on a Resend-verified domain —
//                    use onboarding@resend.dev only while testing)
//
// Abuse protection (CORS allowlist + Blobs rate limiting) is shared with the
// newsletter function — see ./_shared.js. Otherwise uses the global fetch in
// Netlify's Node runtime; @netlify/blobs is the only dependency.
// ─────────────────────────────────────────────────────────────────────────────
import { corsFor, replyWith, clientIp, rateLimit } from './_shared.js'

// Kept comfortably under Netlify's ~6 MB synchronous request-body cap.
const MAX_IMAGES      = 8
const MAX_TOTAL_BYTES = 5 * 1024 * 1024 // 5 MB of decoded image data

// Per-form definition: required fields, consent boxes, whether images apply,
// the email's section layout, header title, and subject line.
const FORMS = {
  enquiry: {
    required: ['first_name', 'last_name', 'email'],
    consent:  ['policy_accepted', 'age_confirmed', 'deposit_understood'],
    images:   true,
    title:    'New enquiry',
    subject:  f => `New enquiry — ${fullName(f)}` +
      (f.tattoo_type ? ` (${humanize('tattoo_type', f.tattoo_type)})` : ''),
    sections: [
      ['Contact', [
        ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'],
        ['date_of_birth', 'Date of birth'], ['referral_source', 'Heard about us via'],
      ]],
      ['The tattoo', [
        ['tattoo_type', 'Type'], ['idea', 'Idea / description'], ['style[]', 'Style'],
        ['colour', 'Colour'], ['placement', 'Placement'], ['size', 'Size'],
        ['budget', 'Budget'], ['coverup', 'Cover-up?'], ['first_tattoo', 'First tattoo?'],
      ]],
      ['Timing', [
        ['date_from', 'Available from'], ['date_to', 'Available until'], ['days[]', 'Preferred days'],
      ]],
      ['Health & consent', [
        ['allergies', 'Allergies / medical'], ['additional_notes', 'Additional notes'],
        ['photo_permission', 'Photo permission'], ['policy_accepted', 'Accepted studio policy'],
        ['age_confirmed', 'Confirmed 18+'], ['deposit_understood', 'Understands deposit'],
      ]],
    ],
  },
  flash: {
    required: ['name', 'email', 'piece'],
    consent:  [],
    images:   false,
    title:    'Flash claim',
    subject:  f => `Flash claim — ${String(f.piece || 'piece').trim()}` +
      (f.name ? ` — ${String(f.name).trim()}` : ''),
    sections: [
      ['Piece',   [['piece', 'Flash piece'], ['price', 'Price']]],
      ['Contact', [['name', 'Name'], ['email', 'Email']]],
      ['Details', [['placement', 'Placement'], ['available_dates', 'Availability']]],
    ],
  },
}

export async function handler(event) {
  const cors  = corsFor(event)
  const reply = replyWith(cors)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' }
  if (event.httpMethod !== 'POST')    return reply(405, { error: 'Method not allowed.' })

  const { RESEND_API_KEY, ARTIST_EMAIL, FROM_EMAIL } = process.env
  if (!RESEND_API_KEY || !ARTIST_EMAIL || !FROM_EMAIL) {
    console.error('Missing env vars:', {
      RESEND_API_KEY: !!RESEND_API_KEY, ARTIST_EMAIL: !!ARTIST_EMAIL, FROM_EMAIL: !!FROM_EMAIL,
    })
    return reply(500, { error: 'The form isn’t configured yet. Please email us directly in the meantime.' })
  }

  let payload
  try { payload = JSON.parse(event.body || '{}') }
  catch { return reply(400, { error: 'Invalid request.' }) }

  const kind   = payload.kind === 'flash' ? 'flash' : 'enquiry'
  const form   = FORMS[kind]
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {}
  const images = form.images && Array.isArray(payload.images) ? payload.images : []

  // Honeypot — a bot filled the hidden field. Pretend success, send nothing.
  if (String(fields._gotcha || '').trim()) return reply(200, { ok: true })

  // ── Validate ──────────────────────────────────────────────────────────────
  const missing = form.required.filter(k => !String(fields[k] || '').trim())
  if (missing.length) return reply(400, { error: 'Please complete the required fields.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(fields.email))) {
    return reply(400, { error: 'Please enter a valid email address.' })
  }
  if (form.consent.some(k => !fields[k])) {
    return reply(400, { error: 'Please confirm the required consent boxes.' })
  }

  // ── Attachments (enquiries only) ────────────────────────────────────────────
  // Never trust the client's claimed type: sniff each file's magic bytes and keep
  // only real images, renamed to match what the bytes actually are. Unrecognised
  // files are dropped — the enquiry still sends, and the artist is told how many.
  if (images.length > MAX_IMAGES) return reply(400, { error: `Please attach no more than ${MAX_IMAGES} images.` })
  let total = 0
  let skipped = 0
  const attachments = []
  for (const img of images) {
    if (!img || typeof img.data !== 'string' || !img.data) { skipped++; continue }
    const sig = sniffImage(img.data)
    if (!sig) { skipped++; continue }   // not a recognised image → drop it
    total += Math.floor(img.data.length * 3 / 4) // base64 → byte estimate
    attachments.push({ filename: safeName(img.name, sig.ext), content: img.data, content_type: sig.type })
  }
  if (total > MAX_TOTAL_BYTES) {
    return reply(413, { error: 'Your images are too large. Please remove some and try again.' })
  }

  // ── Rate limit — only valid, about-to-send requests count ───────────────────
  const limiter = await rateLimit(clientIp(event), { storeName: 'enquiry-rate' })
  if (!limiter.ok) {
    return reply(429, { error: 'You’ve sent a few messages already. Please email hello@beansprout.ink directly and we’ll pick it up.' })
  }

  // ── Send via Resend ─────────────────────────────────────────────────────────
  const from = FROM_EMAIL.includes('<') ? FROM_EMAIL : `Beansprout <${FROM_EMAIL}>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [ARTIST_EMAIL],
        reply_to: String(fields.email).trim(),
        subject: form.subject(fields),
        html: buildHtml(form, fields, attachments.length, skipped),
        text: buildText(form, fields, attachments.length, skipped),
        ...(attachments.length ? { attachments } : {}),
      }),
    })
    if (!res.ok) {
      console.error('Resend error', res.status, await res.text().catch(() => ''))
      return reply(502, { error: 'We couldn’t send your message just now. Please try again shortly.' })
    }
    await limiter.commit()   // record the successful send against the limits
    return reply(200, { ok: true })
  } catch (err) {
    console.error('Send failed', err)
    return reply(502, { error: 'We couldn’t send your message just now. Please try again shortly.' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email rendering
// ─────────────────────────────────────────────────────────────────────────────

const DAYS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
const CODED = new Set(['tattoo_type', 'colour', 'budget', 'referral_source'])

function fullName(f) {
  return `${String(f.first_name || '').trim()} ${String(f.last_name || '').trim()}`.trim() || 'enquirer'
}

function humanize(key, v) {
  if (key === 'days[]' && DAYS[v]) return DAYS[v]
  return String(v).replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Image type sniffing — a client's claimed MIME can't be trusted, so identify the
// file by its actual magic bytes. Returns { type, ext }, or null if it isn't an
// image we recognise. Covers what the client may send: JPEG/PNG/WebP/GIF and the
// phone-camera ISO formats (HEIC/HEIF/AVIF) that can't always be downscaled.
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

function sniffImage(base64) {
  let b
  try { b = Buffer.from(String(base64).slice(0, 64), 'base64') } catch { return null }
  if (b.length < 12) return null

  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { type: 'image/jpeg', ext: 'jpg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return { type: 'image/png', ext: 'png' }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { type: 'image/gif', ext: 'gif' }
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { type: 'image/webp', ext: 'webp' }

  // ISO base-media (HEIC/HEIF/AVIF): 'ftyp' box at offset 4, brand string at 8–12.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = b.toString('ascii', 8, 12)
    if (HEIC_BRANDS.has(brand)) return { type: 'image/heic', ext: 'heic' }
    if (AVIF_BRANDS.has(brand)) return { type: 'image/avif', ext: 'avif' }
  }
  return null
}

// Safe attachment filename, always ending in the SNIFFED extension — never a
// client-supplied one (no "reference.jpg.exe" reaching the inbox).
function safeName(n, ext) {
  let base = String(n || 'reference').replace(/[^\w.\-]+/g, '_').replace(/\.[^.]*$/, '').slice(-72)
  if (!base || /^_+$/.test(base)) base = 'reference'
  return `${base}.${ext}`
}

// Returns HTML-safe text, or '' if the value is empty / should be skipped.
function formatValue(key, val) {
  if (val == null) return ''
  if (Array.isArray(val)) return val.length ? val.map(v => esc(humanize(key, v))).join(', ') : ''
  const s = String(val).trim()
  if (!s) return ''
  if (s === 'on')  return 'Yes ✓'
  if (s === 'yes') return 'Yes'
  if (s === 'no')  return 'No'
  if (key === 'price' && /^\d+(\.\d{1,2})?$/.test(s)) return `£${s}`
  if (CODED.has(key)) return esc(humanize(key, s))
  return esc(s).replace(/\n/g, '<br>')
}

function buildHtml(form, fields, imageCount, skipped = 0) {
  const sections = form.sections.map(([title, items]) => {
    const rows = items.map(([key, label]) => {
      const v = formatValue(key, fields[key] ?? fields[key.replace('[]', '')])
      if (!v) return ''
      return `<tr>
        <td style="padding:7px 16px 7px 0;vertical-align:top;color:#8E8B81;font-size:13px;width:160px">${esc(label)}</td>
        <td style="padding:7px 0;vertical-align:top;color:#2C2A24;font-size:14px;line-height:1.5">${v}</td>
      </tr>`
    }).filter(Boolean).join('')
    if (!rows) return ''
    return `<h2 style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#4A5D3F;margin:26px 0 6px">${esc(title)}</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>`
  }).filter(Boolean).join('')

  const imgNote = !form.images ? '' : imageCount
    ? `<p style="margin:24px 0 0;padding:12px 16px;background:#EFE8D6;border-radius:8px;font-size:13px;color:#5C5A52">📎 ${imageCount} reference image${imageCount > 1 ? 's' : ''} attached.</p>`
    : `<p style="margin:24px 0 0;font-size:13px;color:#8E8B81">No reference images attached.</p>`

  const skipNote = skipped > 0
    ? `<p style="margin:8px 0 0;font-size:12px;color:#C45A3E">⚠ ${skipped} attached file${skipped > 1 ? 's were' : ' was'} skipped — not a recognised image format. You may want to ask ${esc(String(fields.first_name || 'them'))} to resend.</p>`
    : ''

  const who = esc(String(fields.first_name || fields.name || 'the enquirer'))

  return `<!doctype html><html><body style="margin:0;background:#F7F1E3;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#FBF8EE;border:1px solid rgba(44,42,36,.14);border-radius:12px;overflow:hidden">
    <tr><td style="background:#2C2A24;padding:18px 28px">
      <p style="margin:0;color:#F7F1E3;font-size:18px;font-weight:600">${esc(form.title)} · beansprout<span style="color:#8A9A75">.ink</span></p>
    </td></tr>
    <tr><td style="padding:6px 28px 28px">
      ${sections}
      ${imgNote}
      ${skipNote}
      <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid rgba(44,42,36,.14);font-size:12px;color:#8E8B81">Hit reply to respond directly to ${who}.</p>
    </td></tr>
  </table>
  </body></html>`
}

function buildText(form, fields, imageCount, skipped = 0) {
  const lines = []
  for (const [title, items] of form.sections) {
    const block = items
      .map(([key, label]) => {
        const v = formatValue(key, fields[key] ?? fields[key.replace('[]', '')])
        return v ? `  ${label}: ${v.replace(/<br>/g, '\n    ')}` : ''
      })
      .filter(Boolean)
    if (block.length) lines.push(title.toUpperCase(), ...block, '')
  }
  if (form.images) lines.push(imageCount ? `${imageCount} reference image(s) attached.` : 'No reference images attached.')
  if (skipped > 0) lines.push(`${skipped} attached file(s) skipped — not a recognised image format.`)
  return lines.join('\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
}
