// @vitest-environment jsdom
// modules/map.js — the /visit/ Google map must never load until the visitor asks.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initMap } from '../src/js/modules/map.js'

const SRC = 'https://maps.google.com/maps?q=studio&output=embed'
beforeEach(() => {
  document.body.innerHTML = `
    <div id="studio-map" data-map-src="${SRC}" data-map-title="Studio map">
      <button type="button" id="map-load">Show the map</button>
    </div>`
})

describe('click-to-load studio map', () => {
  it('creates no iframe on init', () => {
    initMap()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('swaps the placeholder for the titled embed on click', () => {
    initMap()
    document.getElementById('map-load').click()
    const frame = document.querySelector('#studio-map iframe')
    expect(frame.getAttribute('src')).toBe(SRC)
    expect(frame.title).toBe('Studio map')
    expect(document.getElementById('map-load')).toBeNull()
  })

  it('no-ops on pages without the map block', () => {
    document.body.innerHTML = ''
    expect(() => initMap()).not.toThrow()
  })

  it('the visit page ships no Google iframe in its markup', () => {
    const html = readFileSync(resolve(process.cwd(), 'visit/index.html'), 'utf8')
    expect(html).not.toMatch(/<iframe/i)
    expect(html).toContain('id="map-load"')
  })
})
