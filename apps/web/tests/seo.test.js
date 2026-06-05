// Tests for src/build/seo.js — the site-wide SEO structure injected at build/dev
// by the injectSeoHead + sitemap plugins. These are pure string transforms, so
// they pin down the branching (only-missing-tags-added, per-page overrides win,
// noindex pages skipped, twitter mirrored from OG) that otherwise breaks SEO
// silently with no error.
import { describe, it, expect } from 'vitest'
import {
  injectSeoHead,
  injectStagingNoindex,
  isProductionBuild,
  ROBOTS_NOINDEX,
  renderSitemap,
  ROUTES,
  SITE_URL,
  SITE_NAME,
  SITE_LOCALE,
  OG_IMAGE,
} from '../src/build/seo.js'

// A minimal page head carrying only the hand-authored, per-page content.
const page = (inner) => `<!doctype html><html><head>\n${inner}\n</head><body></body></html>`

describe('injectSeoHead', () => {
  it('derives <link rel="canonical"> from the page\'s own og:url', () => {
    const out = injectSeoHead(page('<meta property="og:url" content="https://beansprout.ink/about/">'))
    expect(out).toContain('<link rel="canonical" href="https://beansprout.ink/about/">')
  })

  it('adds the constant structural tags (site_name, locale, default image, twitter card)', () => {
    const out = injectSeoHead(page('<meta property="og:url" content="https://beansprout.ink/">'))
    expect(out).toContain(`<meta property="og:site_name" content="${SITE_NAME}">`)
    expect(out).toContain(`<meta property="og:locale" content="${SITE_LOCALE}">`)
    expect(out).toContain(`<meta property="og:image" content="${OG_IMAGE}">`)
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image">')
  })

  it('mirrors twitter:title / twitter:description from the OpenGraph tags', () => {
    const out = injectSeoHead(page(
      '<meta property="og:title" content="About Beansprout">\n' +
      '<meta property="og:description" content="Fine-line botanical tattoos.">',
    ))
    expect(out).toContain('<meta name="twitter:title" content="About Beansprout">')
    expect(out).toContain('<meta name="twitter:description" content="Fine-line botanical tattoos.">')
  })

  it('only mirrors twitter tags when the OG source exists', () => {
    const out = injectSeoHead(page('<meta property="og:url" content="https://beansprout.ink/">'))
    expect(out).not.toContain('name="twitter:title"')
    expect(out).not.toContain('name="twitter:description"')
  })

  it('lets a per-page override win (does not duplicate a tag the page already set)', () => {
    const custom = '<meta property="og:image" content="https://beansprout.ink/images/custom.jpg">'
    const out = injectSeoHead(page(custom))
    expect(out).toContain(custom)
    expect(out).not.toContain(`content="${OG_IMAGE}"`)
    // exactly one og:image tag survives
    expect(out.match(/property="og:image"/g)).toHaveLength(1)
  })

  it('does not add a canonical when the page has no og:url to derive it from', () => {
    const out = injectSeoHead(page('<title>No url</title>'))
    expect(out).not.toContain('rel="canonical"')
  })

  it('skips noindex pages entirely (returns the html untouched)', () => {
    const html = page('<meta name="robots" content="noindex, follow">\n<meta property="og:url" content="https://beansprout.ink/enquiry-received/">')
    expect(injectSeoHead(html)).toBe(html)
  })

  it('is idempotent — a second pass adds nothing', () => {
    const once = injectSeoHead(page('<meta property="og:url" content="https://beansprout.ink/">'))
    expect(injectSeoHead(once)).toBe(once)
  })

  it('returns the html unchanged when there is nothing to add', () => {
    // A fully-populated head: every injectable tag already present.
    const full = page([
      '<meta property="og:url" content="https://beansprout.ink/">',
      '<link rel="canonical" href="https://beansprout.ink/">',
      `<meta property="og:site_name" content="${SITE_NAME}">`,
      `<meta property="og:locale" content="${SITE_LOCALE}">`,
      `<meta property="og:image" content="${OG_IMAGE}">`,
      '<meta name="twitter:card" content="summary_large_image">',
    ].join('\n'))
    expect(injectSeoHead(full)).toBe(full)
  })
})

describe('injectStagingNoindex (keep the pre-launch staging site out of search)', () => {
  const ogPage = () => page('<meta property="og:url" content="https://beansprout.ink/about/">')
  const withEnv = (val, fn) => {
    const prev = process.env.SITE_ENV
    if (val === undefined) delete process.env.SITE_ENV
    else process.env.SITE_ENV = val
    try { return fn() } finally {
      if (prev === undefined) delete process.env.SITE_ENV
      else process.env.SITE_ENV = prev
    }
  }

  it('keeps the apex build indexable (SITE_ENV=production)', () => {
    withEnv('production', () => {
      expect(isProductionBuild()).toBe(true)
      expect(injectStagingNoindex(ogPage())).not.toContain('noindex')
    })
  })

  it('adds a site-wide noindex on a staging build (no apex CNAME)', () => {
    withEnv(undefined, () => {
      // Repo invariant pre-launch: no apps/web/public/CNAME → staging build.
      if (isProductionBuild()) return // a CNAME/apex build legitimately wouldn't noindex
      expect(injectStagingNoindex(ogPage())).toContain(ROBOTS_NOINDEX)
    })
  })

  it('never doubles up on a page that already declares robots noindex', () => {
    const html = page('<meta name="robots" content="noindex, follow">')
    expect(injectStagingNoindex(html)).toBe(html)
  })

  it('leaves injectSeoHead itself pure — the SEO injector never adds a robots tag', () => {
    expect(injectSeoHead(ogPage())).not.toContain('robots')
  })
})

describe('renderSitemap', () => {
  const xml = renderSitemap()

  it('is a well-formed urlset with one <loc> per route', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.match(/<url>/g)).toHaveLength(ROUTES.length)
  })

  it('emits absolute URLs and the priority for each route', () => {
    for (const { path, priority } of ROUTES) {
      expect(xml).toContain(`<loc>${SITE_URL}${path}</loc>`)
      expect(xml).toContain(`<priority>${priority}</priority>`)
    }
  })

  it('stamps lastmod with today\'s build date (YYYY-MM-DD)', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(xml).toContain(`<lastmod>${today}</lastmod>`)
  })

  it('honours an injected route list and site (no reliance on module globals)', () => {
    const out = renderSitemap([{ path: '/x/', priority: '0.5' }], 'https://example.test')
    expect(out).toContain('<loc>https://example.test/x/</loc>')
    expect(out.match(/<url>/g)).toHaveLength(1)
  })
})

describe('ROUTES', () => {
  it('does not list the noindex enquiry-received confirmation page', () => {
    expect(ROUTES.some(r => r.path.includes('enquiry-received'))).toBe(false)
  })

  it('lists the homepage at top priority', () => {
    expect(ROUTES[0]).toMatchObject({ path: '/', priority: '1.0' })
  })

  it('has unique paths', () => {
    const paths = ROUTES.map(r => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
