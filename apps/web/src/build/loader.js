// ─────────────────────────────────────────────────────────────────────────────
// Build-time: the full-page preloader (overlay + its inline-critical CSS)
// ─────────────────────────────────────────────────────────────────────────────
// Why this exists: both the Google-Fonts stylesheet and the bundled main.css are
// render-blocking, and the fonts ship `display=swap`. On a slow connection (the
// reported iPad case) that means a blank hold, then content paints in fallback
// fonts and visibly reflows when Fraunces/Karla swap in — and in the Vite dev
// server, where CSS is injected by JS, it's a full flash of unstyled content. The
// motion.css FOUC guard only covers the GSAP *entrance* elements, not whole-page
// CSS/font arrival.
//
// Fix: cover every page from the very first paint with a cream overlay carrying a
// small self-inking sprig, then fade it out once the page is genuinely ready
// (src/js/modules/loader.js dismisses it on document.fonts.ready). The styling is
// INLINE-CRITICAL in <head> on purpose — it must apply before main.css loads — and
// is CSP-safe because style-src allows 'unsafe-inline' (src/build/security.js).
// No inline <script> is used (script-src is 'self'); the bundle does the dismissal,
// and a pure-CSS failsafe animation reveals the page if that bundle never runs.
//
// Wired site-wide by the `beansprout-page-loader` plugin in vite.config.js (dev +
// build) for the normal pages, and emitted directly into the per-piece pages by
// src/build/piece-page.js (which bypass Vite's HTML transforms). Both inserts are
// idempotent — see injectPageLoader's guards.

// The inline-critical stylesheet. Palette custom properties (--bg, --moss,
// --ink-rgb) are injected into the same <head> by the palette plugin, so they
// resolve here; each still carries a hard-coded fallback so the overlay is never
// the wrong colour even if that block is missing (e.g. a hand-rendered page).
export const LOADER_STYLE = `<style id="page-loader-css">
#page-loader{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#F7F1E3;background:var(--bg,#F7F1E3);opacity:1;visibility:visible;transition:opacity .55s cubic-bezier(.33,1,.68,1),visibility .55s linear;animation:pl-failsafe 1ms linear 6s forwards}
html.page-loaded #page-loader{opacity:0;visibility:hidden;pointer-events:none}
#page-loader .pl-sprig{width:42px;height:60px;color:#4A5D3F;color:var(--moss,#4A5D3F)}
#page-loader .pl-sprig path{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:0}
#page-loader .pl-word{font-family:'JetBrains Mono',monospace;font-family:var(--mono,'JetBrains Mono',monospace);font-size:11px;letter-spacing:.3em;text-transform:lowercase;color:#5b574d;color:rgba(var(--ink-rgb),.5)}
@media (prefers-reduced-motion:no-preference){
#page-loader .pl-sprig path{animation:pl-draw 1.9s ease-in-out infinite}
#page-loader .pl-sprig .pl-d2{animation-delay:.18s}
#page-loader .pl-sprig .pl-d3{animation-delay:.34s}
#page-loader .pl-word{animation:pl-pulse 1.9s ease-in-out infinite}
}
@media (prefers-reduced-motion:reduce){#page-loader{transition:none}}
@keyframes pl-draw{0%{stroke-dashoffset:1;opacity:.25}40%{stroke-dashoffset:0;opacity:1}72%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:1;opacity:.25}}
@keyframes pl-pulse{0%,100%{opacity:.4}50%{opacity:.8}}
@keyframes pl-failsafe{to{opacity:0;visibility:hidden;pointer-events:none}}
</style>`

// The overlay itself. role="status" + aria-label announces "Loading" once; the
// sprig is a self-inking botanical that echoes the hero sprout motif. Each path
// carries pathLength="1" so stroke-dashoffset 1→0 draws it regardless of length.
export const LOADER_MARKUP = `<div id="page-loader" role="status" aria-label="Loading">
  <svg class="pl-sprig" viewBox="0 0 42 60" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path class="pl-d1" pathLength="1" d="M21 58 C21 46 21 34 21 19"/>
    <path class="pl-d2" pathLength="1" d="M21 36 C11 35 5 27 6 17 C16 18 21 25 21 36 Z"/>
    <path class="pl-d3" pathLength="1" d="M21 28 C31 27 37 20 36 11 C26 12 21 18 21 28 Z"/>
  </svg>
  <span class="pl-word" aria-hidden="true">beansprout</span>
</div>`

/**
 * Add the preloader to a full HTML document: the critical <style> just before
 * </head>, and the overlay markup immediately after the opening <body>. Both are
 * guarded so a second pass (or a piece page that already rendered its own) never
 * doubles up. Function replacers are used so any `$` in the inserted strings isn't
 * treated as a regex back-reference.
 */
export function injectPageLoader(html) {
  if (!html.includes('id="page-loader-css"') && html.includes('</head>')) {
    html = html.replace('</head>', () => `  ${LOADER_STYLE}\n</head>`)
  }
  if (!html.includes('id="page-loader"') && /<body[^>]*>/.test(html)) {
    html = html.replace(/<body[^>]*>/, m => `${m}\n${LOADER_MARKUP}`)
  }
  return html
}
