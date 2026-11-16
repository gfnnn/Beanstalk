// @vitest-environment jsdom
//
// Accessibility invariants for every shipped page. The site already meets a strong
// baseline by hand; this pins it down so a new page (or an edit to an existing one)
// can't silently regress it. We assert the structural, automatable a11y floor that
// doesn't need a real browser — landmark/heading structure, a working skip-link,
// language + viewport, and alt-text presence on images. The richer browser-only
// checks (focus order, colour contrast, motion) stay with the Playwright/axe tier.
//
// It runs over the AUTHORED page HTML (the *.html files Vite serves) plus a
// rendered per-piece page (those are generated, so they're checked via the
// renderer), so both the static pages and the generated ones are held to the bar.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'
import { renderPiecePage, piecePagesData } from '../src/build/piece-page.js'
import { pieces } from '../src/data/pieces.js'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Directories under apps/web that are not pages (build inputs, assets, tooling).
const NON_PAGE_DIRS = new Set([
  'src', 'public', 'tests', 'e2e', 'scripts', 'dist', 'node_modules', 'coverage',
])

// Discover the authored HTML pages: the root index.html + 404.html, and every
// page folder's index.html. Mirrors how Vite's `input` map is built, but derived
// from the filesystem so a newly-added page is covered automatically.
function findPages() {
  const out = []
  for (const name of ['index.html', '404.html']) {
    const f = join(WEB_ROOT, name)
    if (existsSync(f)) out.push(f)
  }
  for (const entry of readdirSync(WEB_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || NON_PAGE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
    const f = join(WEB_ROOT, entry.name, 'index.html')
    if (existsSync(f)) out.push(f)
  }
  return out
}

const parse = html => new DOMParser().parseFromString(html, 'text/html')

// The shared assertion bundle — run against both authored and generated pages.
function assertA11yBaseline(doc, label) {
  // Language is declared, so assistive tech pronounces content correctly.
  expect(doc.documentElement.getAttribute('lang'), `${label}: <html lang>`).toBeTruthy()

  // A responsive viewport (no fixed-width zoom trap on mobile).
  expect(doc.querySelector('meta[name="viewport"]'), `${label}: viewport meta`).toBeTruthy()

  // A non-empty document title.
  expect(doc.querySelector('title')?.textContent?.trim(), `${label}: <title>`).toBeTruthy()

  // Exactly one <h1> — a single top-level heading per page.
  expect(doc.querySelectorAll('h1').length, `${label}: exactly one <h1>`).toBe(1)

  // A skip link whose target actually exists and is the main landmark, so a
  // keyboard user can jump past the nav. (A skip-link to a missing id is a
  // silent no-op — the exact regression this guards.)
  const skip = doc.querySelector('a.skip-link')
  expect(skip, `${label}: skip-link present`).toBeTruthy()
  const href = skip.getAttribute('href') || ''
  expect(href.startsWith('#'), `${label}: skip-link is an in-page anchor`).toBe(true)
  const target = doc.getElementById(href.slice(1))
  expect(target, `${label}: skip-link target #${href.slice(1)} exists`).toBeTruthy()
  const focusable = target.tagName === 'MAIN' || target.getAttribute('tabindex') === '-1'
  expect(focusable, `${label}: skip-link target is the main landmark / focusable`).toBe(true)

  // Every <img> carries an alt attribute (may be "" for decorative — the WCAG
  // requirement is presence, so screen readers don't read out the file name).
  for (const img of doc.querySelectorAll('img')) {
    expect(img.hasAttribute('alt'), `${label}: <img src="${img.getAttribute('src')}"> has alt`).toBe(true)
  }

  // Content sits inside a landmark (axe `region`): the portfolio load-more and
  // the FAQ CTA live in <main>; the mobile sticky bar is its own <aside>.
  for (const sel of ['.load-more', '.faq-cta']) {
    for (const el of doc.querySelectorAll(sel)) {
      expect(el.closest('main'), `${label}: ${sel} is inside <main>`).toBeTruthy()
    }
  }
  const cta = doc.getElementById('mobile-cta')
  if (cta) {
    expect(cta.tagName, `${label}: #mobile-cta is an <aside> landmark`).toBe('ASIDE')
    expect(cta.getAttribute('aria-label'), `${label}: #mobile-cta is labelled`).toBeTruthy()
  }

  // Every page header is the two-column shape the CSS lays out:
  // .page-header-left (eyebrow + h1) and .page-header-right (descriptor).
  for (const header of doc.querySelectorAll('header.page-header')) {
    const kids = [...header.children].map(c => c.className)
    expect(kids, `${label}: page-header children`).toEqual(['page-header-left', 'page-header-right'])
    expect(header.querySelector('.page-header-left h1'), `${label}: h1 in page-header-left`).toBeTruthy()
  }

  // A button can't take role="listitem" (axe `aria-allowed-role`): the list
  // item must be a wrapper around it.
  expect(doc.querySelectorAll('button[role="listitem"], a[href][role="listitem"]').length,
    `${label}: no interactive element re-roled as a listitem`).toBe(0)

  // Headings never skip a level on the way down (axe `heading-order`).
  let prev = 0
  for (const h of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const level = Number(h.tagName[1])
    expect(level <= prev + 1, `${label}: <${h.tagName.toLowerCase()}> "${h.textContent.trim()}" follows h${prev}`).toBe(true)
    prev = level
  }
}

describe('a11y baseline — authored pages', () => {
  const pages = findPages()

  it('finds the page set (sanity: the homepage is in it)', () => {
    expect(pages.some(p => p === join(WEB_ROOT, 'index.html'))).toBe(true)
    expect(pages.length).toBeGreaterThan(5)
  })

  it.each(pages.map(p => [relative(WEB_ROOT, p), p]))('%s', (label, file) => {
    assertA11yBaseline(parse(readFileSync(file, 'utf8')), label)
  })
})

describe('a11y baseline — generated per-piece page', () => {
  it('a rendered piece page meets the same bar', () => {
    const { piece, prev, next } = piecePagesData(pieces)[0]
    const html = renderPiecePage(piece, { prev, next })
    assertA11yBaseline(parse(html), `piece:${piece.slug}`)
  })
})
