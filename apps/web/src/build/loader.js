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
// small sprig mark, then fade it out once the page is genuinely ready
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

import { MARK_PATH, MARK_TIGHT_VIEWBOX, MARK_FILL_RULE } from './favicon.js'

// The inline-critical stylesheet. Palette custom properties (--bg, --moss,
// --ink-rgb) are injected into the same <head> by the palette plugin, so they
// resolve here; each still carries a hard-coded fallback so the overlay is never
// the wrong colour even if that block is missing (e.g. a hand-rendered page).
export const LOADER_STYLE = `<style id="page-loader-css">
#page-loader{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#F7F1E3;background:var(--bg,#F7F1E3);opacity:1;visibility:visible;transition:opacity .45s ease,visibility .45s ease;animation:pl-failsafe 1ms linear 6s forwards}
html.page-loaded #page-loader{opacity:0;visibility:hidden;pointer-events:none}
#page-loader .pl-sprig{width:36px;height:60px;color:#4A5D3F;color:var(--moss,#4A5D3F)}
#page-loader .pl-sprig path{fill:currentColor}
#page-loader .pl-word{font-family:'JetBrains Mono',monospace;font-family:var(--mono,'JetBrains Mono',monospace);font-size:11px;letter-spacing:.3em;text-transform:lowercase;color:#5b574d;color:rgba(var(--ink-rgb),.5)}
@media (prefers-reduced-motion:no-preference){
#page-loader .pl-sprig{animation:pl-draw 1.1s cubic-bezier(.22,.61,.36,1) both,pl-breathe 3.2s ease-in-out 1.25s infinite}
#page-loader .pl-word{animation:pl-word-in .7s ease-out .5s both,pl-pulse 3.2s ease-in-out 1.25s infinite}
}
@media (prefers-reduced-motion:reduce){#page-loader{transition:none}}
@keyframes pl-draw{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes pl-word-in{from{opacity:0;transform:translateY(6px)}to{opacity:.4;transform:none}}
@keyframes pl-breathe{0%,100%{opacity:1}50%{opacity:.82}}
@keyframes pl-pulse{0%,100%{opacity:.4}50%{opacity:.72}}
@keyframes pl-failsafe{to{opacity:0;visibility:hidden;pointer-events:none}}
</style>`

// The overlay itself. role="status" + aria-label announces "Loading" once; the
// sprig is the brand mark — the traced vector from src/build/favicon.js, inlined
// (the overlay covers the very first paint, so it can't reference a network
// asset) and filled with currentColor, so it follows the palette's --moss like
// the rest of the site.
//
// It plays a single INK-RISE draw on load — a clip-path wipe from the base up
// (pl-draw), as if the calligraphy is being painted — then settles into a gentle
// COMPOSITOR-only opacity breathe; the word fades up under it. This is the shared
// brand-mark "rise" vocabulary (see the nav logo + confirmation mark in
// atmosphere.css). Note the mark is ONE filled path, so the hero sprig's
// per-stroke self-ink (stroke-dashoffset) can't apply here at all. An earlier
// per-PATH staggered stroke-draw was tried and reverted: stroke-dashoffset is a
// main-thread property AND, staggered across paths, rendered mid-draw
// inconsistently on a quick cover (the "two leaves, no stem" flash — a delayed
// path with only `forwards` fill showing its default DRAWN state during the
// delay). A clip-path inset on the single path sidesteps both: it's a single
// MONOTONIC reveal with no partial-state inconsistency, and the cream cover hides
// any first-frame cost until it lifts. Reduced motion: shown complete, no draw.
export const LOADER_MARKUP = `<div id="page-loader" role="status" aria-label="Loading">
  <svg class="pl-sprig" viewBox="${MARK_TIGHT_VIEWBOX}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="${MARK_PATH}" fill-rule="${MARK_FILL_RULE}"/>
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
