// ─────────────────────────────────────────────────────────────────────────────
// Build-time: the cross-document View Transition OPT-IN, inlined into <head>
// ─────────────────────────────────────────────────────────────────────────────
// Just the opt-in — `@view-transition { navigation: auto }`. The actual
// ::view-transition-* animations stay in styles/components/atmosphere.css (they
// run at transition time, by when main.css is loaded).
//
// Why inline, not left in atmosphere.css: a cross-document View Transition only
// plays if the inbound page is KNOWN to be opting in by the time the browser arms
// the transition (around `pagereveal`, before the first render). Left in
// atmosphere.css, the opt-in sits one fetch-hop deep behind main.css's `@import`
// waterfall — so on a slow inbound render the browser can reach its render
// deadline before the opt-in is parsed, skip the transition, and hard-cut instead
// of cross-fading (the `AbortError: Transition was skipped` the loader swallows).
// Inlined in <head> it's parsed from the first bytes, before any stylesheet fetch,
// so the transition is armed as early as possible. CSP-safe via
// `style-src 'unsafe-inline'` (src/build/security.js).
//
// Injected site-wide by the `viewTransition` plugin in vite.config.js (dev AND
// build); the per-piece pages bypass that transform and carry their own copy via
// src/build/piece-page.js. The `id` doubles as the idempotency guard.
export const VIEW_TRANSITION_STYLE =
  `<style id="vt-optin">@view-transition{navigation:auto}</style>`

/**
 * Insert the opt-in just before </head>. Guarded so a second pass (or a piece page
 * that already rendered its own) never doubles up, and a fragment with no head is
 * left untouched. A function replacer keeps any `$` literal-safe (none here, but
 * consistent with injectPageLoader).
 */
export function injectViewTransition(html) {
  if (html.includes('id="vt-optin"') || !html.includes('</head>')) return html
  return html.replace('</head>', () => `  ${VIEW_TRANSITION_STYLE}\n</head>`)
}
