// src/build/flash-gate.js — holding /flash/ back until the drop is real.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyFlashGate, stripFlashLinks } from '../src/build/flash-gate.js'
import { renderRobots } from '../src/build/seo.js'
import { renderPiecePage, piecePagesData } from '../src/build/piece-page.js'
import { pieces } from '../src/data/pieces.js'
import { flash, live } from '../src/data/flash.js'

const WEB = process.cwd()
const pages = ['index.html', '404.html', ...readdirSync(WEB)
  .filter(d => existsSync(resolve(WEB, d, 'index.html')) && !['dist', 'node_modules'].includes(d))
  .map(d => `${d}/index.html`)]

describe('flash gate', () => {
  it('is a no-op when the drop is live', () => {
    const html = '<head></head><li><a href="/flash/">Flash</a></li>'
    expect(applyFlashGate(html, { live: true, isFlashPage: true })).toBe(html)
  })

  it.each(pages)('leaves no link to /flash/ on %s', (file) => {
    const out = stripFlashLinks(readFileSync(resolve(WEB, file), 'utf8'))
    expect(out).not.toMatch(/href="\/flash\/"/)
  })

  it('leaves no link to /flash/ on a generated piece page', () => {
    const { piece, prev, next } = piecePagesData(pieces)[0]
    expect(stripFlashLinks(renderPiecePage(piece, { prev, next }))).not.toMatch(/href="\/flash\/"/)
  })

  it('redirects the flash page itself and marks it noindex, once', () => {
    const out = applyFlashGate('<html><head><title>x</title></head></html>', { live: false, isFlashPage: true })
    expect(out).toContain('<meta http-equiv="refresh" content="0; url=/portfolio/">')
    expect(out).toContain('noindex')
    expect(applyFlashGate(out, { live: false, isFlashPage: true })).toBe(out)
  })

  it('can add /flash/ to the production robots.txt', () => {
    expect(renderRobots({ production: true, disallow: ['/flash/'] })).toContain('Disallow: /flash/')
    expect(renderRobots({ production: true })).not.toContain('/flash/')
  })

  it('stays closed while any flash piece is still a placeholder without a photo', () => {
    if (flash.some(p => !p.img)) expect(live, 'flash.js `live` must be false until every piece has a real photo').toBe(false)
  })
})
