// Core SEO helpers — site-wide structure that should stay identical across every
// page, kept in one place so it never drifts. Consumers are all wired up in
// vite.config.js (dev + build):
//
//   injectSeoHead(html) — per-page <head> completion (canonical + social tags)
//   injectStagingNoindex(html) — site-wide noindex on a pre-launch staging build
//   renderRobots()      — robots.txt (blanket Disallow on staging)
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
// Shared social share image (1200×630). Currently a generated brand placeholder
// (apps/web/public/images/og-image.jpg) — swap for a real photo before final launch;
// see the note in index.html's <head>.
export const OG_IMAGE = `${SITE_URL}/images/og-image.jpg`
// Alt text for the shared social-card image. Describes the default brand image so
// the link preview is meaningful to screen-reader users on platforms that expose
// og:image:alt / twitter:image:alt (an SEO + accessibility overlap). Per-page
// content that sets its own og:image (e.g. the per-piece pages) authors its own
// matching alt; this is the default for everything that uses the brand image.
export const OG_IMAGE_ALT = 'Beansprout — fine line, botanical and custom tattoo, Winchester.'

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
  // Describe the share image for assistive tech on platforms that surface it.
  // Mirror the same value to twitter:image:alt (X reads its own namespaced tag).
  if (!/property=["']og:image:alt["']/i.test(html)) {
    add.push(meta('property', 'og:image:alt', OG_IMAGE_ALT))
  }
  if (!/name=["']twitter:image:alt["']/i.test(html)) {
    add.push(meta('name', 'twitter:image:alt', OG_IMAGE_ALT))
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

/**
 * Render robots.txt.
 *
 * Production (apex) build: allow crawling, keep the post-submit confirmation out,
 * and point crawlers at the sitemap.
 *
 * Staging build (no apex CNAME — e.g. the GitHub Pages preview or the Cloudflare
 * Pages dev environment built from `develop`): a blanket `Disallow: /` so the
 * pre-launch copy can't be crawled, and — crucially — it never advertises the
 * real production sitemap. Pairs with the site-wide noindex (injectStagingNoindex)
 * and the staging build skipping sitemap.xml entirely, so the dev copy carries no
 * real-life SEO artifacts. Self-disarming: adding the apex CNAME flips this to the
 * production variant, same switch as everything else here.
 */
export function renderRobots({ production = isProductionBuild() } = {}) {
  if (!production) {
    return [
      '# Staging / preview build — keep the pre-launch copy out of search.',
      '# No apex CNAME (or SITE_ENV != production), so block every crawler and',
      '# do not advertise the production sitemap.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n')
  }
  return [
    '# Beansprout — beansprout.ink',
    'User-agent: *',
    'Allow: /',
    '',
    "# Post-submit confirmation — also noindex'd on the page itself.",
    'Disallow: /enquiry-received/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')
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
