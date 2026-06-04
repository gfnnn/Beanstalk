// Build-time renderer tests — src/build/portfolio-tiles.js & flash-cards.js.
// These are pure (data in → HTML string out), so they're cheap to pin down and
// they guard the static markup that ships for SEO/LCP/no-JS. We assert structure
// and security-relevant behaviour (escaping, lazy/eager loading, status gating)
// rather than exact byte-for-byte HTML, so cosmetic tweaks don't break the suite.
import { describe, it, expect } from 'vitest'
import { renderPortfolioTiles } from '../src/build/portfolio-tiles.js'
import { renderFlashCards } from '../src/build/flash-cards.js'
import { renderNewsletterInline } from '../src/build/newsletter-inline.js'
import { renderPiecePage, piecePagesData } from '../src/build/piece-page.js'
import {
  renderStatus, renderNotices,
  renderHeroHeadline, renderHeroBody,
} from '../src/build/homepage.js'
import { pieces } from '../src/data/pieces.js'
import { flash } from '../src/data/flash.js'

describe('renderPortfolioTiles', () => {
  const withImage = {
    slug: 's1', title: 'Foxglove', subject: 'foxglove', styles: ['fine-line', 'botanical'],
    placement: 'forearm', order: 30, tone: 't-moss', glyph: 'sprig', ph: 300,
    img: '/images/tattoos/foxglove', w: 800, h: 1000,
  }
  const placeholderPiece = {
    slug: 's2', title: 'Moth', subject: 'moth', styles: ['blackwork'],
    placement: 'wrist', order: 10, tone: 't-ink', glyph: 'moth', ph: 260,
    img: null, w: null, h: null,
  }

  it('builds a responsive <picture> (avif/webp + jpg fallback) when img is set', () => {
    const html = renderPortfolioTiles([withImage])
    expect(html).toContain('<picture>')
    expect(html).toContain('type="image/avif"')
    expect(html).toContain('type="image/webp"')
    expect(html).toContain('/images/tattoos/foxglove-800.jpg')
    expect(html).toContain('/images/tattoos/foxglove-400.avif 400w')
    expect(html).toContain('width="800"')
    expect(html).toContain('height="1000"')
  })

  it('renders the line-art placeholder (no <picture>) when img is null', () => {
    const html = renderPortfolioTiles([placeholderPiece])
    expect(html).not.toContain('<picture>')
    expect(html).toContain('class="tile-placeholder t-ink"')
    expect(html).toContain('height: 260px')
    expect(html).toContain('<svg')
  })

  it('sorts tiles by `order` descending (newest first)', () => {
    const html = renderPortfolioTiles([placeholderPiece, withImage]) // order 10, then 30
    expect(html.indexOf('/portfolio/s1/')).toBeLessThan(html.indexOf('/portfolio/s2/'))
  })

  it('marks only the first four tiles eager for LCP, lazy thereafter', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...withImage, slug: `p${i}`, order: 100 - i }))
    const html = renderPortfolioTiles(many)
    expect(html.match(/fetchpriority="high"/g)).toHaveLength(4)
    expect(html).toContain('loading="lazy"')
  })

  it('joins multiple styles into the data-style filter attribute', () => {
    const html = renderPortfolioTiles([withImage])
    expect(html).toContain('data-style="fine-line botanical"')
  })

  it('escapes HTML in title/subject to prevent markup injection', () => {
    const html = renderPortfolioTiles([{ ...placeholderPiece, title: '<script>x</script>', subject: 'a & b' }])
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders the real portfolio data without throwing, one tile per piece', () => {
    const html = renderPortfolioTiles(pieces)
    expect(html.match(/class="masonry-tile/g)).toHaveLength(pieces.length)
  })
})

describe('renderFlashCards', () => {
  const base = {
    id: 'f1', title: 'Sprig', specs: '3in · forearm · fine-line', price: 180, size: 3,
    drop: 12, tone: 'ci-sage', glyph: 'sprig', img: null, w: null, h: null,
  }

  it('renders a live Claim button carrying piece + price for available cards', () => {
    const html = renderFlashCards([{ ...base, status: 'available' }])
    expect(html).toContain('class="claim-btn" data-piece="Sprig" data-price="£180"')
    expect(html).not.toContain('disabled')
    expect(html).toContain('class="card-status available"')
  })

  it('disables the button and labels "Pending deposit" for pending cards', () => {
    const html = renderFlashCards([{ ...base, status: 'pending' }])
    expect(html).toContain('disabled aria-disabled="true"')
    expect(html).toContain('Pending deposit')
    expect(html).toContain('class="card-status pending"')
  })

  it('disables the button and stamps "Claimed" for claimed cards', () => {
    const html = renderFlashCards([{ ...base, status: 'claimed' }])
    expect(html).toContain('disabled aria-disabled="true"')
    expect(html).toContain('class="card-status claimed-status"')
    expect(html).not.toContain('data-piece=') // no live claim affordance
  })

  it('formats price as £ in the card body and exposes sort data-attributes', () => {
    const html = renderFlashCards([{ ...base, status: 'available' }])
    expect(html).toContain('<span class="card-price">£180</span>')
    expect(html).toContain('data-price="180"')
    expect(html).toContain('data-size="3"')
    expect(html).toContain('data-drop="12"')
  })

  it('uses a <picture> when img is set, placeholder otherwise', () => {
    expect(renderFlashCards([{ ...base, status: 'available', img: '/images/flash/sprig', w: 600, h: 600 }]))
      .toContain('/images/flash/sprig-600.jpg')
    expect(renderFlashCards([{ ...base, status: 'available' }]))
      .toContain('class="card-image-placeholder ci-sage"')
  })

  it('escapes HTML in the title', () => {
    const html = renderFlashCards([{ ...base, status: 'available', title: '<b>x</b>' }])
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('renders the real flash data without throwing, one card per item', () => {
    const html = renderFlashCards(flash)
    expect(html.match(/class="flash-card"/g)).toHaveLength(flash.length)
  })
})

describe('renderStatus (nav "light")', () => {
  it('renders the pill with the chosen tone class and label', () => {
    expect(renderStatus({ show: true, label: 'Flash day', tone: 'clay' }))
      .toBe('<span class="status-pill clay">Flash day</span>')
  })

  it('adds the centring style for the mobile-drawer variant', () => {
    expect(renderStatus({ show: true, label: 'Books open', tone: 'moss' }, { center: true }))
      .toContain('style="justify-content:center"')
  })

  it('renders nothing when show is false (pill removed entirely)', () => {
    expect(renderStatus({ show: false, label: 'Books open', tone: 'moss' })).toBe('')
    expect(renderStatus()).toBe('')
  })

  it('falls back to the moss tone for an unknown tone', () => {
    expect(renderStatus({ show: true, label: 'Hi', tone: 'banana' }))
      .toContain('class="status-pill moss"')
  })

  it('escapes the label to prevent markup injection', () => {
    expect(renderStatus({ show: true, label: '<b>x</b>', tone: 'moss' }))
      .toContain('&lt;b&gt;')
  })
})

describe('renderNotices (toggleable hero bars)', () => {
  const moss  = { show: true,  tone: 'moss',  label: 'Bookings',   html: 'Open. <a href="/enquire/">Enquire</a>' }
  const clay  = { show: true,  tone: 'clay',  label: 'Flash day',  html: 'Drop soon.' }
  const hidden = { show: false, tone: 'faint', label: 'Guest spot', html: 'Nope.' }

  it('renders only show:true bars, each with its dot tone and label', () => {
    const html = renderNotices([moss, clay, hidden])
    expect(html.match(/class="notice-item"/g)).toHaveLength(2)
    expect(html).toContain('class="notice-dot moss"')
    expect(html).toContain('class="notice-dot clay"')
    expect(html).not.toContain('Guest spot')
  })

  it('keeps notice html raw so links render', () => {
    expect(renderNotices([moss])).toContain('<a href="/enquire/">Enquire</a>')
  })

  it('omits the whole block when every bar is off (no empty frame)', () => {
    expect(renderNotices([hidden, { ...hidden, label: 'x' }])).toBe('')
    expect(renderNotices([])).toBe('')
    expect(renderNotices()).toBe('')
  })

  it('wraps shown bars in the studio-notices container', () => {
    expect(renderNotices([moss])).toContain('class="studio-notices"')
  })
})

describe('renderHero copy', () => {
  it('keeps the H1 plain + italic shape and escapes both parts', () => {
    expect(renderHeroHeadline({ headLead: 'Quiet', headEm: 'ink & line' }))
      .toBe('Quiet<br><em>ink &amp; line</em>')
  })

  it('escapes the hero body', () => {
    expect(renderHeroBody({ body: 'a <script>x</script> b' })).not.toContain('<script>')
  })
})

describe('renderNewsletterInline', () => {
  const html = renderNewsletterInline()

  it('renders a data-newsletter form the JS module can drive', () => {
    expect(html).toContain('form')
    expect(html).toContain('data-newsletter')
    // email + consent inputs the module validates
    expect(html).toContain('name="email"')
    expect(html).toContain('name="consent"')
    expect(html).toContain('type="submit"')
  })

  it('wires the success panel + feedback hooks the module looks for', () => {
    expect(html).toContain('data-nl-feedback')
    expect(html).toContain('data-nl-success="#nl-band-success"')
    expect(html).toContain('id="nl-band-success"')
    // the "already subscribed" note the module reveals on a 409
    expect(html).toContain('data-already')
  })

  it('includes the honeypot and the consent privacy link', () => {
    expect(html).toContain('name="_gotcha"')
    expect(html).toContain('href="/privacy/"')
  })
})

describe('renderPiecePage', () => {
  const withImage = {
    slug: 'foxglove', title: 'Foxglove', subject: 'foxglove sprig',
    styles: ['fine-line', 'botanical'], placement: 'forearm', order: 30,
    tone: 't-moss', glyph: 'sprig', ph: 340, img: '/images/tattoos/foxglove', w: 800, h: 1000,
  }
  const placeholder = {
    slug: 'luna-moth', title: 'Luna moth', subject: 'luna moth', styles: ['black-grey'],
    placement: 'wrist', order: 10, tone: 't-ink', glyph: 'moth', ph: 260, img: null, w: null, h: null,
  }

  it('renders a full HTML document with per-piece SEO', () => {
    const html = renderPiecePage(placeholder, { cssHref: '/x.css', jsHref: '/x.js' })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Luna moth · Beansprout</title>')
    expect(html).toContain('<link rel="canonical" href="https://beansprout.ink/portfolio/luna-moth/">')
    expect(html).toContain('content="https://beansprout.ink/portfolio/luna-moth/"') // og:url
    expect(html).toContain('"@type":"BreadcrumbList"')
    expect(html).toContain('href="/x.css"')
    expect(html).toContain('src="/x.js"')
  })

  it('uses the placeholder glyph (no <picture>) and default OG image when img is null', () => {
    const html = renderPiecePage(placeholder)
    expect(html).not.toContain('<picture>')
    expect(html).toContain('class="piece-media-ph t-ink"')
    expect(html).toContain('/images/og-image.jpg') // falls back to the site OG image
  })

  it('renders a <picture> and a piece-specific OG image when img is set', () => {
    const html = renderPiecePage(withImage)
    expect(html).toContain('<picture>')
    expect(html).toContain('/images/tattoos/foxglove-1200.jpg')
    expect(html).toContain('content="https://beansprout.ink/images/tattoos/foxglove-1200.jpg"')
  })

  it('shows style + placement tags and the enquiry / back CTAs', () => {
    const html = renderPiecePage(withImage)
    expect(html).toContain('>Fine line<')
    expect(html).toContain('>Botanical<')
    expect(html).toContain('>Forearm<')
    expect(html).toContain('href="/enquire/"')
    expect(html).toContain('href="/portfolio/"')
  })

  it('wires the prev/next pager when neighbours are given', () => {
    const html = renderPiecePage(withImage, { prev: placeholder, next: null })
    expect(html).toContain('href="/portfolio/luna-moth/"')      // prev link
    expect(html).toContain('piece-pager-link is-empty')          // empty next slot
  })
})

describe('piecePagesData', () => {
  const data = [
    { slug: 'a', order: 10 }, { slug: 'b', order: 30 }, { slug: 'c', order: 20 },
  ]
  it('orders newest-first and links each piece to its neighbours', () => {
    const out = piecePagesData(data)
    expect(out.map(d => d.piece.slug)).toEqual(['b', 'c', 'a']) // 30, 20, 10
    expect(out[0].prev).toBeNull()              // newest has no newer
    expect(out[0].next.slug).toBe('c')
    expect(out[2].next).toBeNull()              // oldest has no older
    expect(out[2].prev.slug).toBe('c')
  })
})
