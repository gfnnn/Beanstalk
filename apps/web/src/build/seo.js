// Core SEO helpers — site-wide structure that should stay identical across every
// page, kept in one place so it never drifts. Two consumers, both wired up in
// vite.config.js (dev + build):
//
//   injectSeoHead(html) — per-page <head> completion (canonical + social tags)
//   renderSitemap()     — the XML sitemap, built from ROUTES below
//
// Per-page CONTENT (title, description, og:title/description/url) is still
// authored by hand in each page's <head>; this module only adds the structural
// tags that are derived or constant, so adding a new page gets them for free.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export const SITE_URL = 'https://beansprout.ink'
export const SITE_NAME = 'Beansprout'
export const SITE_LOCALE = 'en_GB'
// Shared social share image (1200×630). The asset itself is still pending — see
// the "IMAGE NEEDED" note in index.html's <head>.
export const OG_IMAGE = `${SITE_URL}/images/og-image.jpg`

// ── Staging vs apex: keep the pre-launch staging site out of search ──────────
// The whole site lives on the GitHub Pages *.github.io URL until the apex
// cut-over, which (per docs/ROADMAP.md → go-live plan, Phase 6) is the moment
// `apps/web/public/CNAME` is added so Pages serves beansprout.ink. We key
// indexability off that exact file: no CNAME → staging → noindex every page;
// CNAME present → the apex build → index normally. That makes this
// self-disarming — adding the CNAME for go-live turns indexing back on by
// itself, so it can never strand the live site on a forgotten noindex. Set
// SITE_ENV=production to force the apex behaviour for a manual/local build.
const CNAME_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/CNAME')

export function isProductionBuild() {
  return process.env.SITE_ENV === 'production' || existsSync(CNAME_PATH)
}

export const ROBOTS_NOINDEX = '<meta name="robots" content="noindex, nofollow">'

/**
 * On a staging build (no apex CNAME), add a site-wide noindex so the GitHub
 * Pages preview can't be indexed before launch. A no-op on the apex build and
 * on any page that already declares its own robots tag (e.g. the confirmation
 * page), so it never doubles up.
 */
export function injectStagingNoindex(html) {
  if (isProductionBuild()) return html
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) return html
  if (!html.includes('</head>')) return html
  return html.replace('</head>', `  ${ROBOTS_NOINDEX}\n</head>`)
}

// Public, indexable routes, highest priority first. Single source of truth for
// the sitemap — keep in sync with the `input` map in vite.config.js when pages
// are added. The post-submit /enquiry-received/ page is deliberately absent
// (it's noindex).
export const ROUTES = [
  { path: '/',            priority: '1.0' },
  { path: '/portfolio/',  priority: '0.9' },
  { path: '/flash/',      priority: '0.9' },
  { path: '/services/',   priority: '0.8' },
  { path: '/enquire/',    priority: '0.8' },
  { path: '/about/',      priority: '0.7' },
  { path: '/visit/',      priority: '0.7' },
  { path: '/faq/',        priority: '0.6' },
  { path: '/aftercare/',  priority: '0.5' },
  { path: '/newsletter/', priority: '0.4' },
  { path: '/privacy/',    priority: '0.2' },
  { path: '/terms/',      priority: '0.2' },
]

const meta = (attr, key, val) =>
  `<meta ${attr}="${key}" content="${val}">`

const firstMatch = (html, re) => html.match(re)?.[1]

/**
 * Add the structural SEO tags a page can't sensibly author by hand:
 *   - <link rel="canonical">  (derived from the page's own og:url)
 *   - og:site_name, og:locale (constant)
 *   - og:image, twitter:card  (defaults, only if the page didn't set its own)
 *   - twitter:title / twitter:description (mirrored from the OpenGraph tags)
 * Only tags that are missing are added, so per-page overrides win. Pages marked
 * noindex (e.g. the enquiry confirmation) are skipped entirely.
 */
export function injectSeoHead(html) {
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) return html

  const ogUrl   = firstMatch(html, /<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)
  const ogTitle = firstMatch(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
  const ogDesc  = firstMatch(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)

  const add = []

  if (ogUrl && !/rel=["']canonical["']/i.test(html)) {
    add.push(`<link rel="canonical" href="${ogUrl}">`)
  }
  if (!/property=["']og:site_name["']/i.test(html)) {
    add.push(meta('property', 'og:site_name', SITE_NAME))
  }
  if (!/property=["']og:locale["']/i.test(html)) {
    add.push(meta('property', 'og:locale', SITE_LOCALE))
  }
  if (!/property=["']og:image["']/i.test(html)) {
    add.push(meta('property', 'og:image', OG_IMAGE))
  }
  if (!/name=["']twitter:card["']/i.test(html)) {
    add.push(meta('name', 'twitter:card', 'summary_large_image'))
  }
  if (ogTitle && !/name=["']twitter:title["']/i.test(html)) {
    add.push(meta('name', 'twitter:title', ogTitle))
  }
  if (ogDesc && !/name=["']twitter:description["']/i.test(html)) {
    add.push(meta('name', 'twitter:description', ogDesc))
  }

  if (!add.length) return html
  return html.replace('</head>', `  ${add.join('\n  ')}\n</head>`)
}

/** Render the XML sitemap from ROUTES. lastmod is the build date. */
export function renderSitemap(routes = ROUTES, site = SITE_URL) {
  const lastmod = new Date().toISOString().slice(0, 10)
  const urls = routes
    .map(
      ({ path, priority }) =>
        `  <url>\n    <loc>${site}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
