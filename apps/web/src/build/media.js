// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderer: media.js → the page HERO clip (homepage + About)
// ─────────────────────────────────────────────────────────────────────────────
// Imported by vite.config.js. The generated-grids plugin swaps this into the
// `homepage:hero-media` and `about:hero-media` markers (dev + build), so a real
// client clip ships as static HTML. Edit the data in src/data/media.js, not
// here — this function only turns a slot into markup.
//
// ONE shared component, used by BOTH heroes. renderHeroMedia() emits identical
// markup for the homepage hero and the About hero — they differ only by which
// placeholder shows while the clip is off (`variant`), and the CSS frame they sit
// in (sized by the parent: `.hero-media` / `.portrait-wrap`). A slot renders one
// of two ways:
//   • show:false → its page's ORIGINAL placeholder (the gradient frames on the
//     pages today), so nothing changes visually until a clip is switched on;
//   • show:true  → the real clip — a muted looping <video> (kind:'video') or an
//     animated <img> (kind:'gif'), both tagged `.media-clip`.
//
// Playback is progressive-enhancement: the <video> ships WITHOUT `autoplay`, so
// no-JS and reduced-motion visitors see only the poster. src/js/modules/media.js
// starts a clip when it scrolls into view (motion allowed) and pauses it
// off-screen. The poster is therefore both the LCP image and the still fallback.
import { esc } from './html.js'

// The active <video>: muted/looping/inline, no autoplay (the JS owns playback),
// preload:none so the bytes stay off the critical path. data-media tags it for
// src/js/modules/media.js.
function videoEl(slot) {
  const sources = (slot.sources || [])
    .filter(s => s?.src)
    .map(s => `<source src="${esc(s.src)}" type="${esc(s.type || '')}">`)
    .join('')
  return `<video class="media-clip" muted loop playsinline preload="none" `
    + `poster="${esc(slot.poster)}" aria-label="${esc(slot.alt)}" data-media>`
    + `${sources}</video>`
}

// The active GIF as an <img>. data-poster (when a still is supplied) lets the JS
// swap to a static frame under reduced motion — a GIF can't otherwise be paused.
function gifEl(slot) {
  const poster = slot.poster ? ` data-poster="${esc(slot.poster)}"` : ''
  return `<img class="media-clip" src="${esc(slot.gif)}" alt="${esc(slot.alt)}" `
    + `loading="lazy" decoding="async" data-media-gif${poster}>`
}

// The placeholders shown until each hero's clip is switched on — the exact frames
// that are on the pages today, so the off state is byte-identical.
const PLACEHOLDERS = {
  hero: `<div class="video-placeholder" role="img" aria-label="Tattooing process, hands at work">
      <div class="video-placeholder-inner">
        <svg width="56" height="56" viewBox="0 0 64 64" fill="none"
             stroke="rgba(var(--cream-rgb), 0.45)" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M24 52L24 36L20 30L20 22Q20 18 24 18L40 18Q44 18 44 22L44 30L40 36L40 52Z"/>
          <path d="M28 18L28 12L36 12L36 18"/>
          <circle cx="32" cy="56" r="4"/>
          <path d="M28 36L36 36"/>
          <path d="M26 42L38 42"/>
        </svg>
        <p class="video-placeholder-label">Hero clip · set media.hero in src/data/media.js</p>
      </div>
    </div>`,
  about: `<div class="portrait-placeholder" role="img" aria-label="Artist portrait placeholder">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
           stroke="rgba(var(--cream-rgb), 0.4)" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="32" cy="24" r="12"/>
        <path d="M8 56c0-13.3 10.7-24 24-24s24 10.7 24 24"/>
      </svg>
      <span class="portrait-caption">Tiny Knives · Winchester</span>
    </div>`,
}

// The one hero-media component, shared by both pages. `variant` only picks the
// placeholder for the off state; the live clip is rendered identically either way.
export function renderHeroMedia(slot = {}, { variant = 'hero' } = {}) {
  if (slot?.show) {
    const clip = slot.kind === 'gif' ? gifEl(slot) : videoEl(slot)
    const caption = slot.caption
      ? `\n    <span class="media-caption">${esc(slot.caption)}</span>`
      : ''
    return clip + caption
  }
  return PLACEHOLDERS[variant] || ''
}
