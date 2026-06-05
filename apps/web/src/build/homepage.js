// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderers: homepage.js → nav status "light", studio notices, hero copy
// ─────────────────────────────────────────────────────────────────────────────
// Imported by vite.config.js. The generated-grids plugin swaps these into the
// homepage markers in both dev and build. Edit the copy in src/data/homepage.js,
// not here — these functions only turn that data into markup.
import { esc } from './html.js'

const TONES = new Set(['moss', 'clay', 'faint'])
const tone = t => (TONES.has(t) ? t : 'moss')

// The nav "light" — the live status pill shared by every page. `center` is the
// mobile-drawer variant. Returns '' when status.show is false (pill removed).
export function renderStatus(status = {}, { center = false } = {}) {
  if (!status || !status.show) return ''
  const style = center ? ' style="justify-content:center"' : ''
  return `<span class="status-pill ${tone(status.tone)}"${style}>${esc(status.label)}</span>`
}

// The toggleable bars under the hero text. Only show:true items render; if none
// do, the whole block (and its top border) is omitted so there's no empty frame.
// `html` is intentionally raw (author-controlled copy may include a link).
export function renderNotices(notices = []) {
  const items = (notices || []).filter(n => n && n.show)
  if (!items.length) return ''
  const rows = items.map(n => `
      <div class="notice-item">
        <span class="notice-dot ${tone(n.tone)}" aria-hidden="true"></span>
        <span class="notice-label">${esc(n.label)}</span>
        <span>${n.html ?? ''}</span>
      </div>`).join('')
  return `<div class="studio-notices" aria-label="Studio updates">${rows}
    </div>`
}

// Hero copy — plain text, escaped. The H1 keeps its "plain<br><em>italic</em>" shape.
export function renderHeroEyebrow(hero = {})  { return esc(hero.eyebrow) }
export function renderHeroHeadline(hero = {}) { return `${esc(hero.headLead)}<br><em>${esc(hero.headEm)}</em>` }
export function renderHeroBody(hero = {})     { return esc(hero.body) }

// The studio tag overlaid on the hero media. It's a click-through to /visit/
// (location, map, hours) — the label text stays authored in homepage.js.
export function renderHeroMediaTag(hero = {}) {
  return `<a href="/visit/" class="hero-media-tag-link">${esc(hero.mediaTag)}</a>`
}

// Credit line for whoever shot the hero video, overlaid on the media column.
// Returns '' until `videoCredit.show` is true (no video/credit yet). When a `url`
// is set the name links out (new tab, rel-safe); otherwise it's plain text.
export function renderVideoCredit(credit = {}) {
  if (!credit || !credit.show) return ''
  const label = credit.label ? `<span class="video-credit-label">${esc(credit.label)}</span> ` : ''
  const name  = credit.url
    ? `<a class="video-credit-name" href="${esc(credit.url)}" target="_blank" rel="noopener noreferrer">${esc(credit.name)}</a>`
    : `<span class="video-credit-name">${esc(credit.name)}</span>`
  return `<span class="hero-video-credit">${label}${name}</span>`
}
