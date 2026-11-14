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
// src/js/modules/media.js. `set` carries the sources/poster (the slot itself, or
// its `portrait` block); `cls` lets the homepage emit a landscape + portrait pair
// that CSS swaps by breakpoint — a display:none clip is never observed/played.
function videoEl(slot, set = slot, cls = 'media-clip') {
  const sources = (set.sources || [])
    .filter(s => s?.src)
    .map(s => `<source src="${esc(s.src)}" type="${esc(s.type || '')}">`)
    .join('')
  return `<video class="${cls}" muted loop playsinline preload="none" `
    + `poster="${esc(set.poster)}" aria-label="${esc(slot.alt)}" data-media>`
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
// A still photo in the same frame (kind: 'image') — for launching without a clip.
// `img` is a no-extension base path following the portfolio's multi-size
// convention (<img>-400/-800/-1200 in avif/webp/jpg). The homepage hero is the
// page's largest paint, so it loads eagerly at high priority; the About frame
// sits lower and stays lazy.
function imageEl(slot, { eager = false } = {}) {
  const base = esc(slot.img)
  const srcset = ext => [400, 800, 1200].map(w => `${base}-${w}.${ext} ${w}w`).join(', ')
  const sizes = esc(slot.sizes || '100vw')
  const dims = slot.w && slot.h ? ` width="${esc(slot.w)}" height="${esc(slot.h)}"` : ''
  const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'
  return `<picture>`
    + `<source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">`
    + `<source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}">`
    + `<img class="media-clip" src="${base}-1200.jpg" srcset="${srcset('jpg')}" sizes="${sizes}"${dims} `
    + `alt="${esc(slot.alt)}" ${load} decoding="async">`
    + `</picture>`
}

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
  if (slot?.show && slot.kind === 'image') {
    const caption = slot.caption
      ? `\n    <span class="media-caption">${esc(slot.caption)}</span>`
      : ''
    return imageEl(slot, { eager: variant === 'hero' }) + caption
  }
  if (slot?.show) {
    // A portrait clip (homepage mobile only) makes the landscape one the
    // desktop-only sibling; without it the lone landscape clip covers both, so
    // the markup is byte-identical to before (About never sets `portrait`).
    const hasPortrait = slot.kind !== 'gif' && slot.portrait?.sources?.length
    const clip = slot.kind === 'gif'
      ? gifEl(slot)
      : videoEl(slot, slot, hasPortrait ? 'media-clip media-clip--landscape' : 'media-clip')
    const portraitClip = hasPortrait
      ? videoEl(slot, slot.portrait, 'media-clip media-clip--portrait')
      : ''
    const caption = slot.caption
      ? `\n    <span class="media-caption">${esc(slot.caption)}</span>`
      : ''
    return clip + portraitClip + caption
  }
  return PLACEHOLDERS[variant] || ''
}
