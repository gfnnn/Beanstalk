// Build-time renderer tests — src/build/portfolio-tiles.js & flash-cards.js.
// These are pure (data in → HTML string out), so they're cheap to pin down and
// they guard the static markup that ships for SEO/LCP/no-JS. We assert structure
// and security-relevant behaviour (escaping, lazy/eager loading, status gating)
// rather than exact byte-for-byte HTML, so cosmetic tweaks don't break the suite.
import { describe, it, expect } from 'vitest'
import { renderPortfolioTiles } from '../src/build/portfolio-tiles.js'
import { renderFlashCards, renderFlashDrop, renderFlashSeason } from '../src/build/flash-cards.js'
import { renderReplyTime } from '../src/build/business.js'
import { renderNewsletterInline } from '../src/build/newsletter-inline.js'
import { renderPiecePage, piecePagesData } from '../src/build/piece-page.js'
import { renderTestimonials } from '../src/build/testimonials.js'
import { testimonials } from '../src/data/testimonials.js'
import { renderSpecialisms, piecesForStyle } from '../src/build/specialisms.js'
import {
  renderStatus, renderNotices,
  renderHeroEyebrow, renderHeroHeadline, renderHeroBody,
  renderHeroMediaTag, renderVideoCredit,
} from '../src/build/homepage.js'
import { renderHeroMedia } from '../src/build/media.js'
import { pieces } from '../src/data/pieces.js'
import { flash } from '../src/data/flash.js'
import { homepage } from '../src/data/homepage.js'
import { media } from '../src/data/media.js'

describe('renderPortfolioTiles', () => {
  const withImage = {
    slug: 's1', title: 'Foxglove', subject: 'foxglove', styles: ['fine-line', 'dotwork'],
    placement: 'forearm', date: '2026-03-01', tone: 't-moss', glyph: 'sprig',
    img: '/images/tattoos/foxglove', w: 800, h: 1000,
  }
  const placeholderPiece = {
    slug: 's2', title: 'Moth', subject: 'moth', styles: ['blackwork'],
    placement: 'wrist', date: '2026-01-01', tone: 't-ink', glyph: 'moth',
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
    expect(html).toContain('<svg')
  })

  it('serves an extensioned img (a final web export) as a single <img>, no srcset tiers', () => {
    // HAS_EXT routing: "/…/Koi.webp" is served as-is — these are artist exports,
    // not masters to derive 400/800/1200 tiers from — but still sized + lazy/eager.
    const single = { ...withImage, img: '/images/tattoos/Koi.webp' }
    const html = renderPortfolioTiles([single])
    expect(html).not.toContain('<picture>')
    expect(html).toContain('src="/images/tattoos/Koi.webp"')
    expect(html).not.toContain('srcset')
    expect(html).toContain('width="800"')
    expect(html).toContain('height="1000"')
    expect(html).toContain('fetchpriority="high"')   // first tile → eager LCP slot

    // Past the eager window it lazy-loads like the responsive path.
    const many = Array.from({ length: 5 }, (_, i) => ({ ...single, slug: `e${i}`, date: `2026-01-0${i + 1}` }))
    const lazy = renderPortfolioTiles(many)
    expect(lazy).toContain('loading="lazy"')
  })

  it('sorts tiles by `date` descending (newest first)', () => {
    const html = renderPortfolioTiles([placeholderPiece, withImage]) // 2026-01-01, then 2026-03-01
    expect(html.indexOf('/portfolio/s1/')).toBeLessThan(html.indexOf('/portfolio/s2/'))
  })

  it('marks only the first four tiles eager for LCP, lazy thereafter', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...withImage, slug: `p${i}`, date: `2026-01-0${i + 1}` }))
    const html = renderPortfolioTiles(many)
    expect(html.match(/fetchpriority="high"/g)).toHaveLength(4)
    expect(html).toContain('loading="lazy"')
  })

  it('joins multiple styles into the data-style filter attribute', () => {
    const html = renderPortfolioTiles([withImage])
    expect(html).toContain('data-style="fine-line dotwork"')
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

  it('exposes the piece id on the card (so live claim state can target it)', () => {
    const html = renderFlashCards([{ ...base, status: 'available' }])
    expect(html).toContain('class="flash-card" data-id="f1"')
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

describe('renderFlashDrop (current-drop number for the page eyebrow)', () => {
  it('returns the highest `drop` value present (the current drop)', () => {
    expect(renderFlashDrop([{ drop: 11 }, { drop: 13 }, { drop: 12 }])).toBe('13')
  })

  it('matches the real data and the client\'s current-drop definition', () => {
    expect(renderFlashDrop(flash)).toBe(String(Math.max(...flash.map(f => f.drop))))
  })

  it('returns an empty string for empty data (no NaN/-Infinity in the markup)', () => {
    expect(renderFlashDrop([])).toBe('')
    expect(renderFlashDrop()).toBe('')
  })
})

describe('renderFlashSeason (current-drop season label for the page eyebrow)', () => {
  it('returns the authored season text, trimmed', () => {
    expect(renderFlashSeason('Summer 2026')).toBe('Summer 2026')
    expect(renderFlashSeason('  Winter 2027  ')).toBe('Winter 2027')
  })

  it('escapes HTML so the data can never inject markup', () => {
    expect(renderFlashSeason('Spring & <b>2026</b>')).toBe('Spring &amp; &lt;b&gt;2026&lt;/b&gt;')
  })

  it('returns an empty string for blank/missing input', () => {
    expect(renderFlashSeason('')).toBe('')
    expect(renderFlashSeason('   ')).toBe('')
    expect(renderFlashSeason()).toBe('')
    expect(renderFlashSeason(null)).toBe('')
  })
})

describe('renderReplyTime (enquiry reply-time phrase, shared by enquire + received)', () => {
  it('returns the authored reply-time phrase, trimmed', () => {
    expect(renderReplyTime('within 3 days')).toBe('within 3 days')
    expect(renderReplyTime('  in 2–3 working days  ')).toBe('in 2–3 working days')
  })

  it('escapes HTML so the data can never inject markup', () => {
    expect(renderReplyTime('within <b>3</b> & 4 days')).toBe('within &lt;b&gt;3&lt;/b&gt; &amp; 4 days')
  })

  it('returns an empty string for blank/missing input', () => {
    expect(renderReplyTime('')).toBe('')
    expect(renderReplyTime('   ')).toBe('')
    expect(renderReplyTime()).toBe('')
    expect(renderReplyTime(null)).toBe('')
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

  it('escapes the hero eyebrow and body', () => {
    expect(renderHeroEyebrow({ eyebrow: 'a & b' })).toBe('a &amp; b')
    expect(renderHeroBody({ body: 'a <script>x</script> b' })).not.toContain('<script>')
  })
})

describe('renderHeroMediaTag (click-through studio tag overlaid on the hero)', () => {
  it('links to /visit/ with the escaped authored label', () => {
    const html = renderHeroMediaTag({ mediaTag: 'Tiny Knives · Leeds' })
    expect(html).toBe('<a href="/visit/" class="hero-media-tag-link">Tiny Knives · Leeds</a>')
  })

  it('escapes the label to prevent markup injection', () => {
    expect(renderHeroMediaTag({ mediaTag: '<b>x</b>' })).toContain('&lt;b&gt;')
  })
})

describe('renderVideoCredit (hero media credit line)', () => {
  it('returns nothing until show is true (no video/credit yet)', () => {
    expect(renderVideoCredit({ show: false, name: 'A' })).toBe('')
    expect(renderVideoCredit()).toBe('')
  })

  it('renders a plain-text name when no url is set', () => {
    const html = renderVideoCredit({ show: true, label: 'Film by', name: 'Sam Reed' })
    expect(html).toContain('<span class="video-credit-label">Film by</span>')
    expect(html).toContain('<span class="video-credit-name">Sam Reed</span>')
    expect(html).not.toContain('<a')
  })

  it('links the name out (new tab, rel-safe) when a url is set, omitting the empty label span', () => {
    const html = renderVideoCredit({ show: true, name: 'Sam Reed', url: 'https://sam.example' })
    expect(html).toContain('href="https://sam.example"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('video-credit-label') // no label → no label span
  })

  it('escapes the name and url', () => {
    const html = renderVideoCredit({ show: true, name: '<b>x</b>', url: 'https://x/"onmouseover="y' })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&quot;onmouseover=')
  })
})

describe('renderHeroMedia (the one shared hero component — both pages)', () => {
  it('falls back to each page placeholder when off, per variant', () => {
    // homepage variant
    expect(renderHeroMedia({ show: false }, { variant: 'hero' })).toContain('class="video-placeholder"')
    expect(renderHeroMedia()).toContain('class="video-placeholder"') // defaults to hero
    // About variant
    expect(renderHeroMedia({ show: false }, { variant: 'about' })).toContain('class="portrait-placeholder"')
    // no real media leaks in while off
    expect(renderHeroMedia({ show: false, kind: 'video' }, { variant: 'about' })).not.toContain('<video')
  })

  it('renders a muted, looping, inline <video> with NO autoplay when on', () => {
    const html = renderHeroMedia({
      show: true, kind: 'video', poster: '/videos/hero-poster.jpg', alt: 'Hands at work',
      sources: [
        { src: '/videos/hero.webm', type: 'video/webm' },
        { src: '/videos/hero.mp4',  type: 'video/mp4'  },
      ],
    })
    expect(html).toContain('<video class="media-clip"')
    expect(html).toContain('muted')
    expect(html).toContain('loop')
    expect(html).toContain('playsinline')
    expect(html).toContain('data-media') // JS owns playback
    expect(html).not.toContain('autoplay') // poster shows for no-JS / reduced-motion
    expect(html).toContain('poster="/videos/hero-poster.jpg"')
    expect(html).toContain('aria-label="Hands at work"')
    expect(html).toContain('<source src="/videos/hero.webm" type="video/webm">')
    expect(html).toContain('<source src="/videos/hero.mp4" type="video/mp4">')
    expect(html).not.toContain('class="video-placeholder"')
  })

  it('emits identical clip markup regardless of variant (same functionality)', () => {
    const slot = {
      show: true, kind: 'video', poster: '/videos/x-poster.jpg', alt: 'x',
      sources: [{ src: '/videos/x.mp4', type: 'video/mp4' }],
    }
    expect(renderHeroMedia(slot, { variant: 'hero' }))
      .toBe(renderHeroMedia(slot, { variant: 'about' }))
  })

  it('renders a lazy GIF <img> (with the poster for reduced-motion swap) for kind:gif', () => {
    const html = renderHeroMedia({
      show: true, kind: 'gif', gif: '/videos/hero.gif',
      poster: '/videos/hero-poster.jpg', alt: 'Hands at work',
    })
    expect(html).toContain('<img class="media-clip"')
    expect(html).toContain('src="/videos/hero.gif"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('data-media-gif')
    expect(html).toContain('data-poster="/videos/hero-poster.jpg"')
    expect(html).not.toContain('<video')
  })

  it('overlays an optional caption (used by the About hero), omitted when unset', () => {
    const base = {
      show: true, kind: 'video', alt: 'Artist at work',
      sources: [{ src: '/videos/about-hero.mp4', type: 'video/mp4' }],
    }
    const withCap = renderHeroMedia({ ...base, caption: 'Tiny Knives · Winchester' }, { variant: 'about' })
    expect(withCap).toContain('<span class="media-caption">Tiny Knives · Winchester</span>')
    expect(renderHeroMedia(base, { variant: 'about' })).not.toContain('media-caption')
  })

  it('escapes the slot fields', () => {
    const html = renderHeroMedia({
      show: true, kind: 'video', alt: '<b>x</b>', poster: 'p"onerror="y', caption: '<i>c</i>',
      sources: [{ src: 'a"b', type: 'video/mp4' }],
    })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&quot;onerror=')
    expect(html).toContain('&lt;i&gt;c&lt;/i&gt;') // caption escaped
  })
})

describe('media data (src/data/media.js)', () => {
  it('ships with both hero clips OFF so the pages render their placeholders until assets land', () => {
    expect(media.hero.show).toBe(false)
    expect(media.aboutHero.show).toBe(false)
  })

  it('points every clip at /videos/ (the public/ folder copied to the site root)', () => {
    const paths = [
      ...media.hero.sources.map(s => s.src), media.hero.poster, media.hero.gif,
      ...media.aboutHero.sources.map(s => s.src),
      media.aboutHero.poster, media.aboutHero.gif,
    ]
    paths.forEach(p => expect(p.startsWith('/videos/')).toBe(true))
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
    styles: ['fine-line', 'dotwork'], placement: 'arm', date: '2026-03-01',
    tone: 't-moss', glyph: 'sprig', img: '/images/tattoos/foxglove', w: 800, h: 1000,
  }
  const exportImage = { ...withImage, slug: 'koi', title: 'Koi', img: '/images/tattoos/Koi.webp' }
  const placeholder = {
    slug: 'luna-moth', title: 'Luna moth', subject: 'luna moth', styles: ['black-grey'],
    placement: 'arm', date: '2026-01-01', tone: 't-ink', glyph: 'moth', img: null, w: null, h: null,
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

  it('builds a multi-size <picture> + OG image for a no-extension base path', () => {
    const html = renderPiecePage(withImage)
    expect(html).toContain('<picture>')
    expect(html).toContain('/images/tattoos/foxglove-1200.jpg')
    expect(html).toContain('content="https://beansprout.ink/images/tattoos/foxglove-1200.jpg"')
  })

  it('marks the detail image (the LCP element) high-priority', () => {
    expect(renderPiecePage(withImage)).toContain('fetchpriority="high"')   // <picture> path
    expect(renderPiecePage(exportImage)).toContain('fetchpriority="high"') // single-export path
    // The placeholder is a styled div, not an LCP image — no priority hint there.
    expect(renderPiecePage(placeholder)).not.toContain('fetchpriority')
  })

  it('gives the share image a descriptive alt (piece-specific, brand default for placeholders)', () => {
    const withPhoto = renderPiecePage(withImage)
    const alt = 'Fine line tattoo of foxglove sprig on Arm'
    expect(withPhoto).toContain(`<meta property="og:image:alt" content="${alt}">`)
    expect(withPhoto).toContain(`<meta name="twitter:image:alt" content="${alt}">`)
    // No photo → the brand default alt (matches the og:image fallback).
    expect(renderPiecePage(placeholder)).toContain('property="og:image:alt"')
  })

  it('serves an extension-bearing export as-is (no broken -1200.jpg suffix)', () => {
    const html = renderPiecePage(exportImage)
    expect(html).not.toContain('<picture>')                         // single export, no srcset
    expect(html).toContain('<img src="/images/tattoos/Koi.webp"')
    expect(html).not.toContain('Koi.webp-1200.jpg')                 // the bug we fixed
    expect(html).toContain('content="https://beansprout.ink/images/tattoos/Koi.webp"') // og:image as-is
  })

  it('shows style + placement tags and the enquiry / back CTAs', () => {
    const html = renderPiecePage(withImage)
    expect(html).toContain('>Fine line<')
    expect(html).toContain('>Dotwork<')
    expect(html).toContain('>Arm<')
    expect(html).toContain('href="/enquire/"')
    expect(html).toContain('href="/portfolio/"')
  })

  it('wires the prev/next pager when neighbours are given', () => {
    const html = renderPiecePage(withImage, { prev: placeholder, next: null })
    expect(html).toContain('href="/portfolio/luna-moth/"')      // prev link
    expect(html).toContain('piece-pager-link is-empty')          // empty next slot
  })

  it('escapes "<" in the JSON-LD block (a title cannot terminate the script element)', () => {
    const hostile = { ...withImage, title: 'Fine line </script><img src=x onerror=alert(1)> study' }
    const html = renderPiecePage(hostile)
    const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]
    expect(ld).not.toContain('</script>')                 // can't break out of the element
    expect(ld).toContain('\\u003c/script>')               // <-escaped instead
    expect(JSON.parse(ld).itemListElement[2].name).toBe(hostile.title) // still valid JSON, value intact
  })

  it('escapes the img base path in srcset like the src attribute (no half-escaped output)', () => {
    const odd = { ...withImage, img: '/images/tattoos/mouse&hare' }
    const html = renderPiecePage(odd)
    expect(html).toContain('srcset="/images/tattoos/mouse&amp;hare-400.avif 400w')
    expect(html).not.toMatch(/srcset="[^"]*mouse&hare/) // raw & never reaches an attribute
  })
})

describe('renderTestimonials', () => {
  it('renders one figure per testimonial with quote + credit', () => {
    const html = renderTestimonials([{ quote: 'Loved it', name: 'M. H.', piece: 'Fine line study' }])
    expect(html.match(/class="testimonial"/g)).toHaveLength(1)
    expect(html).toContain('<blockquote class="quote-text">Loved it</blockquote>')
    expect(html).toContain('M. H. · Fine line study')
  })

  it('omits the piece descriptor when not given', () => {
    const html = renderTestimonials([{ quote: 'Great', name: 'A. B.' }])
    expect(html).toContain('class="quote-credit">A. B.</figcaption>')
    expect(html).not.toContain(' · ')
  })

  it('escapes the quote, name and piece (no markup injection)', () => {
    const html = renderTestimonials([{ quote: '<script>x</script>', name: 'A & B', piece: '<i>p</i>' }])
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
  })

  it('renders nothing for an empty list', () => {
    expect(renderTestimonials([])).toBe('')
  })

  it('renders the real testimonials data without throwing, one figure each', () => {
    const html = renderTestimonials(testimonials)
    // testimonials may legitimately be empty until real client quotes are added,
    // in which case nothing renders — match() returns null, so default to [].
    expect(html.match(/class="testimonial"/g) ?? []).toHaveLength(testimonials.length)
  })
})

describe('renderSpecialisms (homepage "What I do" cards)', () => {
  const sample = [
    { slug: 'newest-fl', title: 'Newest', subject: 'a sprig', styles: ['fine-line'],            placement: 'forearm', date: '2026-05-15', img: '/images/tattoos/Newest.webp', w: 700, h: 930 },
    { slug: 'older-fl',  title: 'Older',  subject: 'a leaf',  styles: ['fine-line', 'dotwork'], placement: 'leg',     date: '2025-01-01', img: '/images/tattoos/Older.webp',  w: 700, h: 930 },
    { slug: 'no-photo',  title: 'Pending', subject: 'a moth', styles: ['fine-line'],            placement: 'wrist',   date: '2026-06-01', img: null, w: null, h: null },
    { slug: 'bw',        title: 'Tiger',  subject: 'a tiger', styles: ['black-grey'],           placement: 'forearm', date: '2025-03-11', img: '/images/tattoos/Tiger.webp', w: 700, h: 930 },
  ]

  it('renders one card per configured specialism with "0X / 0Y" numbering', () => {
    const html = renderSpecialisms(sample, [{ style: 'fine-line' }, { style: 'black-grey' }])
    expect(html.match(/class="specialism-card"/g)).toHaveLength(2)
    expect(html).toContain('01 / 02')
    expect(html).toContain('02 / 02')
    expect(html).toContain('data-num="01"')
  })

  it('titles + deep-links each card from its style token (label is the single source of truth)', () => {
    const html = renderSpecialisms(sample, [{ style: 'black-grey', em: 'soft' }])
    expect(html).toContain('<h3 class="specialism-title">Black &amp; grey <em>soft</em></h3>')
    expect(html).toContain('href="/portfolio/?style=black-grey"')
    expect(html).toContain('Browse black &amp; grey work')
  })

  it('pulls preview thumbnails from matching pieces, newest first, skipping photoless pieces', () => {
    const html = renderSpecialisms(sample, [{ style: 'fine-line' }])
    // newest fine-line piece appears before the older one…
    expect(html.indexOf('/portfolio/newest-fl/')).toBeLessThan(html.indexOf('/portfolio/older-fl/'))
    // …and the img-less piece is never previewed (no broken thumbnail)
    expect(html).not.toContain('/portfolio/no-photo/')
    expect(html).toContain('src="/images/tattoos/Newest.webp"')
  })

  it('escapes author copy in the body to prevent markup injection', () => {
    const html = renderSpecialisms(sample, [{ style: 'fine-line', body: '<script>x</script>' }])
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders the real homepage specialisms against the real catalogue without throwing', () => {
    const html = renderSpecialisms(pieces, homepage.specialisms)
    // count card openings regardless of any modifier class (e.g. --fill)
    expect(html.match(/class="specialism-card[ "]/g)).toHaveLength(homepage.specialisms.length)
    // every configured style surfaces at least one real preview from the catalogue
    expect(html).not.toContain('src=""')
  })

  it('treats a `fill` entry as a tablet-only balance tile, outside the numbering', () => {
    const html = renderSpecialisms(sample, [
      { style: 'fine-line' },
      { style: 'black-grey' },
      { style: 'fine-line', fill: true },
    ])
    // modifier class present exactly once; numbered cards keep the bare class
    expect(html.match(/class="specialism-card--fill"|specialism-card specialism-card--fill/g)).toHaveLength(1)
    // numbered cards count only the non-fill entries (denominator stays 02)
    expect(html).toContain('01 / 02')
    expect(html).toContain('02 / 02')
    expect(html).not.toContain('/ 03')
    // the fill card reads "Also" rather than a running number
    expect(html).toContain('>Also<')
  })

  it('piecesForStyle caps the selection (default three previews per card)', () => {
    expect(piecesForStyle(pieces, 'fine-line').length).toBeLessThanOrEqual(3)
    expect(piecesForStyle(pieces, 'fine-line').every(p => p.img && p.styles.includes('fine-line'))).toBe(true)
  })

  it('piecesForStyle skips slugs in the exclude set', () => {
    const all = piecesForStyle(sample, 'fine-line')
    const exclude = new Set([all[0].slug])
    expect(piecesForStyle(sample, 'fine-line', 3, exclude).map(p => p.slug)).not.toContain(all[0].slug)
  })

  it('never previews the same piece twice across cards (a multi-style piece is de-duplicated)', () => {
    // `older-fl` carries both fine-line and dotwork — it must appear on only one card.
    const html = renderSpecialisms(sample, [{ style: 'fine-line' }, { style: 'dotwork' }])
    expect(html.match(/\/portfolio\/older-fl\//g)).toHaveLength(1)
  })

  it('de-duplicates against the real catalogue (no repeated thumbnail across the specialism row)', () => {
    const html = renderSpecialisms(pieces, homepage.specialisms)
    const srcs = [...html.matchAll(/<img src="([^"]+)"/g)].map(m => m[1])
    expect(new Set(srcs).size).toBe(srcs.length)
  })
})

describe('piecePagesData', () => {
  const data = [
    { slug: 'a', date: '2026-01-01' }, { slug: 'b', date: '2026-03-01' }, { slug: 'c', date: '2026-02-01' },
  ]
  it('orders newest-first by date and links each piece to its neighbours', () => {
    const out = piecePagesData(data)
    expect(out.map(d => d.piece.slug)).toEqual(['b', 'c', 'a']) // Mar, Feb, Jan
    expect(out[0].prev).toBeNull()              // newest has no newer
    expect(out[0].next.slug).toBe('c')
    expect(out[2].next).toBeNull()              // oldest has no older
    expect(out[2].prev.slug).toBe('c')
  })

  it('is stable for pieces sharing a date (keeps source order)', () => {
    const same = [{ slug: 'x', date: '2026-05-15' }, { slug: 'y', date: '2026-05-15' }]
    expect(piecePagesData(same).map(d => d.piece.slug)).toEqual(['x', 'y'])
  })
})
