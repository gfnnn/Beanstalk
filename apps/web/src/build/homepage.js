// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderers: homepage.js → nav status "light", studio notices, hero copy
// ─────────────────────────────────────────────────────────────────────────────
// Imported by vite.config.js. The generated-grids plugin swaps these into the
// homepage markers in both dev and build. Edit the copy in src/data/homepage.js,
// not here — these functions only turn that data into markup.

const TONES = new Set(['moss', 'clay', 'faint'])
const tone = t => (TONES.has(t) ? t : 'moss')

// Escape plain-text fields (labels, hero copy) so they can't inject markup.
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

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
export function renderHeroMediaTag(hero = {}) { return esc(hero.mediaTag) }
