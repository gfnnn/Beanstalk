// ─────────────────────────────────────────────────────────────────────────────
// Flash gate — hold the /flash/ page back until there is a real drop to show
// ─────────────────────────────────────────────────────────────────────────────
// While `live` in src/data/flash.js is false the flash sheet is placeholder
// designs with placeholder prices, so it must not be reachable: these helpers
// take the "Flash" link out of every nav, drawer and footer, and turn the page
// itself into an instant redirect to the portfolio (noindex, so it is never
// listed). vite.config.js applies them to every page, and also drops /flash/ from
// the sitemap and disallows it in robots.txt. Flip `live` to true and rebuild to
// bring the page and its links back — nothing else needs editing.

// The three shapes the link takes: nav + footer list items, and the drawer's bare
// anchor. Matched exactly so no other mention of flash is touched.
const LIST_LINK   = /[ \t]*<li><a href="\/flash\/">Flash<\/a><\/li>\n?/g
const DRAWER_LINK = /[ \t]*<a href="\/flash\/">Flash<\/a>\n?/g

export function stripFlashLinks(html) {
  return html.replace(LIST_LINK, '').replace(DRAWER_LINK, '')
}

export const FLASH_REDIRECT =
  '<meta http-equiv="refresh" content="0; url=/portfolio/">\n' +
  '  <meta name="robots" content="noindex, nofollow">'

// Applied to every page. `isFlashPage` marks the /flash/ document itself.
export function applyFlashGate(html, { live, isFlashPage = false } = {}) {
  if (live) return html
  let out = stripFlashLinks(html)
  if (isFlashPage && !out.includes('http-equiv="refresh"')) {
    out = out.replace(/<head>/i, m => `${m}\n  ${FLASH_REDIRECT}`)
  }
  return out
}
