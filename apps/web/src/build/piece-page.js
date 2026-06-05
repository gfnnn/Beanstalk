// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderer: one full HTML page per portfolio piece
// ─────────────────────────────────────────────────────────────────────────────
// The masonry tiles link to /portfolio/<slug>/; this renders those pages so each
// piece is a shareable, individually-rankable URL with per-piece SEO. Driven by
// the same src/data/pieces.js single source of truth.
//
// Wired by the `beansprout-piece-pages` plugin in vite.config.js, which serves
// these in dev (middleware) and emits one HTML file per piece at build. Because
// emitted assets bypass Vite's HTML transforms, this renders the COMPLETE
// document — head/SEO, nav status, the shared nav/footer — itself, reusing the
// same constants/labels as the rest of the site so nothing drifts.
import { GLYPHS, STYLE_LABELS, PLACEMENT_LABELS, altText, dateKey } from './portfolio-tiles.js'
import { esc, HAS_EXT } from './html.js'
import { SITE_URL, SITE_NAME, SITE_LOCALE, OG_IMAGE } from './seo.js'
import { renderStatus } from './homepage.js'
import { renderPaletteStyle, themeColor } from './palette.js'
import { homepage } from '../data/homepage.js'

const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Karla:ital,wght@0,300..800;1,300..800&family=JetBrains+Mono:wght@400;500&display=swap'

const styleLabel = t => STYLE_LABELS[t] || t
const placeLabel = t => PLACEMENT_LABELS[t] || t

// `img` may be a final web export carrying its own extension (e.g. "…/Koi.webp")
// or a base path with no extension (the documented multi-size convention). Mirror
// the grid renderer: serve a single export as-is, build a srcset otherwise.
const ogImagePath = img => (HAS_EXT.test(img) ? img : `${img}-1200.jpg`)

// Detail-page media: the real photo (single export or responsive <picture>), or
// the line-art swatch placeholder (reusing the global tone class) until a photo
// is dropped in.
function media(p) {
  if (p.img) {
    if (HAS_EXT.test(p.img)) {
      return `<img src="${esc(p.img)}" alt="${esc(altText(p))}"
               width="${p.w}" height="${p.h}" decoding="async">`
    }
    const srcset = ext => `${p.img}-400.${ext} 400w, ${p.img}-800.${ext} 800w, ${p.img}-1200.${ext} 1200w`
    const sizes  = '(min-width:900px) 56vw, 100vw'
    return `<picture>
          <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
          <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}">
          <img src="${esc(p.img)}-1200.jpg" alt="${esc(altText(p))}"
               width="${p.w}" height="${p.h}" decoding="async">
        </picture>`
  }
  const glyph = GLYPHS[p.glyph] || GLYPHS.sprig
  return `<div class="piece-media-ph ${p.tone}" role="img" aria-label="${esc(altText(p))} — photo coming soon">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>
        </div>`
}

const pagerLink = (rel, label, piece) => piece
  ? `<a class="piece-pager-link ${rel}" href="/portfolio/${esc(piece.slug)}/"><span class="piece-pager-dir">${label}</span><span class="piece-pager-title">${esc(piece.title)}</span></a>`
  : '<span class="piece-pager-link is-empty" aria-hidden="true"></span>'

/**
 * Render one piece's full HTML document.
 * @param p     the piece record (from pieces.js)
 * @param opts  { prev, next } neighbouring pieces for the pager, and the asset
 *              hrefs to reference (dev `/src/...` vs the hashed build paths).
 */
export function renderPiecePage(p, { prev, next, cssHref = '/src/styles/main.css', jsHref = '/src/js/main.js', securityMeta = '' } = {}) {
  const url     = `${SITE_URL}/portfolio/${p.slug}/`
  const title   = `${p.title} · ${SITE_NAME}`
  const desc    = `${altText(p)} — by ${SITE_NAME} at Tiny Knives, Winchester.`
  const ogImage = p.img ? `${SITE_URL}${ogImagePath(p.img)}` : OG_IMAGE
  const tags    = [...p.styles.map(styleLabel), placeLabel(p.placement)]
    .map(t => `<li class="piece-tag">${esc(t)}</li>`).join('')

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',      item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Portfolio', item: `${SITE_URL}/portfolio/` },
      { '@type': 'ListItem', position: 3, name: p.title,     item: url },
    ],
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${securityMeta ? `${securityMeta}\n` : ''}<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="${SITE_LOCALE}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="theme-color" content="${themeColor}">
${renderPaletteStyle()}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96x96.png" sizes="96x96" type="image/png">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="${cssHref}">
<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
</head>
<body>
<a class="skip-link" href="#maincontent">Skip to main content</a>

<!-- NAV — Portfolio active -->
<nav class="nav" id="main-nav" aria-label="Main navigation">
  <a href="/" aria-label="Beansprout home"><div class="nav-logo-placeholder" aria-hidden="true">logo.svg</div></a>
  <ul class="nav-links" role="list">
    <li><a href="/">Home</a></li>
    <li><a href="/portfolio/" class="active" aria-current="page">Portfolio</a></li>
    <li><a href="/flash/">Flash</a></li>
    <li><a href="/about/">About</a></li>
    <li><a href="/services/">Services</a></li>
    <li><a href="/faq/">FAQ</a></li>
    <li class="nav-more" id="nav-more">
      <button class="nav-more-trigger" aria-expanded="false" aria-controls="nav-dropdown" id="nav-more-btn">More <span class="chevron" aria-hidden="true"></span></button>
      <ul class="nav-dropdown" id="nav-dropdown" role="list">
        <li><a href="/aftercare/">Aftercare</a></li>
        <li><a href="/visit/">Contact &amp; visit</a></li>
        <li><a href="/newsletter/">Newsletter</a></li>
      </ul>
    </li>
  </ul>
  <div class="nav-right">
    ${renderStatus(homepage.status)}
    <a href="/enquire/" class="btn btn-primary btn-sm">Enquire</a>
    <button class="nav-hamburger" id="nav-hamburger" aria-label="Open menu" aria-expanded="false" aria-controls="nav-drawer"><span></span><span></span><span></span></button>
  </div>
</nav>
<div class="nav-drawer" id="nav-drawer" aria-label="Mobile navigation" aria-hidden="true" inert>
  <a href="/">Home</a>
  <a href="/portfolio/" class="active">Portfolio</a>
  <a href="/flash/">Flash</a>
  <a href="/about/">About</a>
  <a href="/services/">Services</a>
  <a href="/faq/">FAQ</a>
  <div class="drawer-secondary">
    <a href="/aftercare/">Aftercare</a>
    <a href="/visit/">Contact &amp; visit</a>
    <a href="/newsletter/">Newsletter</a>
  </div>
  <div class="drawer-bottom">
    ${renderStatus(homepage.status, { center: true })}
    <a href="/enquire/" class="btn btn-primary">Start an enquiry →</a>
  </div>
</div>

<!-- PIECE -->
<main class="piece" id="maincontent" tabindex="-1">
  <nav class="piece-breadcrumb" aria-label="Breadcrumb">
    <a href="/portfolio/">← All work</a>
  </nav>

  <div class="piece-layout">
    <div class="piece-media">${media(p)}</div>
    <div class="piece-detail">
      <p class="page-eyebrow">Portfolio</p>
      <h1 class="piece-title">${esc(p.title)}</h1>
      <ul class="piece-tags" role="list">${tags}</ul>
      <!-- COPY: a sentence or two about this piece — the brief, the story, healed vs fresh. -->
      <p class="piece-note">${esc(altText(p))}.${p.img ? '' : ' A design ready to make yours — enquire to book.'}</p>
      <div class="piece-actions">
        <a href="/enquire/" class="btn btn-primary">Enquire about a piece like this →</a>
        <a href="/portfolio/" class="btn btn-outline">See more work</a>
      </div>
    </div>
  </div>

  <nav class="piece-pager" aria-label="More work">
    ${pagerLink('prev', 'Newer', prev)}
    ${pagerLink('next', 'Older', next)}
  </nav>
</main>

<!-- FOOTER -->
<footer class="footer" role="contentinfo">
  <div class="footer-top">
    <div class="footer-brand">
      <p class="wordmark">beansprout<em>.ink</em></p>
      <p class="tagline">Fine line, botanical and custom tattoo at Tiny Knives, Winchester.</p>
    </div>
    <nav class="footer-col" aria-label="Site links"><h2>Explore</h2><ul>
      <li><a href="/portfolio/">Portfolio</a></li>
      <li><a href="/flash/">Flash</a></li>
      <li><a href="/about/">About</a></li>
      <li><a href="/services/">Pricing</a></li>
      <li><a href="/faq/">FAQ</a></li>
    </ul></nav>
    <nav class="footer-col" aria-label="Visit links"><h2>Visit</h2><ul>
      <li><a href="/visit/">Find me</a></li>
      <li><a href="/aftercare/">Aftercare</a></li>
      <li><a href="/visit/#access">Accessibility</a></li>
      <li><a href="/visit/#hours">Hours</a></li>
    </ul></nav>
    <nav class="footer-col" aria-label="Social links"><h2>Follow</h2><ul>
      <li><a href="https://www.instagram.com/beansprouttattoo" target="_blank" rel="noopener noreferrer">Instagram</a></li>
      <li><a href="/newsletter/">Newsletter</a></li>
      <li><a href="mailto:hello@beansprout.ink">hello@beansprout.ink</a></li>
    </ul></nav>
  </div>
  <div class="footer-bottom">
    <p class="footer-copy">&copy; Beansprout 2026 · Winchester, UK</p>
    <p class="footer-copy"><a href="/privacy/" style="color:inherit">Privacy</a> · <a href="/terms/" style="color:inherit">Terms</a></p>
  </div>
</footer>

<script type="module" src="${jsHref}"></script>
</body>
</html>`
}

// Ordered newest-first by `date`, matching the grid's default sort exactly
// (stable: pieces sharing a date keep pieces.js order), with each piece's
// neighbours resolved for the pager. Returns [{ piece, prev, next }].
export function piecePagesData(pieces) {
  const ordered = pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => dateKey(b.p) - dateKey(a.p) || a.i - b.i)
    .map(o => o.p)
  return ordered.map((piece, i) => ({
    piece,
    prev: ordered[i - 1] || null, // newer
    next: ordered[i + 1] || null, // older
  }))
}
