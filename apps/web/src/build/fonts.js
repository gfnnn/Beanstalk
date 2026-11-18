// ─────────────────────────────────────────────────────────────────────────────
// Build-time: preload the self-hosted fonts that every page's first view needs
// ─────────────────────────────────────────────────────────────────────────────
// The fonts are self-hosted: the woff2 files live in public/fonts/ (served at
// /fonts/…) and their @font-face rules are in src/styles/fonts.css.
//
// Without a hint the browser only discovers a font once main.css has arrived AND
// layout has found text that uses it, which is late: the preloader holds the page
// until document.fonts.ready (src/js/modules/loader.js), so late fonts are a late
// page. Preloading starts the two faces behind almost all first-view text — Karla
// (body) and Fraunces roman (headings) — alongside the stylesheet. The other two
// (Fraunces italic, JetBrains Mono) are left to normal discovery: preloading
// everything would only make the four files compete with the CSS for bandwidth.
//
// Measured on throttled slow 4G: the preloads delay first paint by ~0.2s (they
// do compete with main.css) and bring fonts-ready, and so the reveal, forward by
// ~0.3–0.4s. That only pays because the preloader's minimum hold (MIN_SHOW_MS) is
// shorter than the font wait; if that hold is ever lengthened past ~1.2s, the
// preloads stop earning their 0.2s and should go.
//
// `crossorigin` is required even though the files are same-origin: fonts are
// always fetched in CORS mode, and a preload without it is fetched twice.
//
// Wired site-wide by the `beansprout-font-preload` plugin in vite.config.js (dev
// + build), and emitted directly by src/build/piece-page.js for the per-piece
// pages (which bypass Vite's HTML transforms). The insert is idempotent.

export const PRELOADED_FONTS = ['/fonts/karla-latin.woff2', '/fonts/fraunces-latin.woff2']

export const FONT_PRELOADS = PRELOADED_FONTS
  .map(href => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`)
  .join('\n')

/** Add the font preloads just before the first stylesheet link (or </head>). */
export function injectFontPreloads(html) {
  if (html.includes(PRELOADED_FONTS[0])) return html
  const sheet = html.match(/[ \t]*<link\b[^>]*rel="stylesheet"[^>]*>/)
  if (sheet) return html.replace(sheet[0], m => `${FONT_PRELOADS}\n${m}`)
  if (html.includes('</head>')) return html.replace('</head>', () => `${FONT_PRELOADS}\n</head>`)
  return html
}
