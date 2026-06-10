// Tests for scripts/process-media.mjs — the sharp tier pipeline, run against the
// REAL sharp (a devDependency; tiny in-memory images keep it fast). These pin the
// behaviours that broke silently before: EXIF-orientation dimensions, the
// no-silent-upscale guard, transparent-PNG flattening for the JPG tier, and the
// flash lane's trimmed JPG tiers.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { processOne, LANES } from '../scripts/process-media.mjs'

let dir
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'pm-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const writeMaster = async (name, buf) => {
  const p = path.join(dir, name)
  await writeFile(p, buf)
  return p
}

// A flat-colour JPEG with an EXIF orientation tag: raw 1200×900 + orientation 6
// (rotate 90°) → logically 900×1200 portrait.
const rotatedJpeg = () => sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 90, g: 110, b: 80 } } })
  .jpeg().withMetadata({ orientation: 6 }).toBuffer()

describe('processOne', () => {
  it('uses post-orientation dimensions for an EXIF-rotated master', async () => {
    const src = await writeMaster('rot.jpg', await rotatedJpeg())
    // crop:false keeps the source aspect — tiers must come out PORTRAIT (the
    // pre-fix bug read the raw header dims and swapped every rotated master).
    const r = await processOne({ src, name: 'rot', lane: 'flash', outDir: dir, crop: false, sharpen: true })
    expect(r.srcW).toBe(900)
    expect(r.srcH).toBe(1200)
    const t300 = r.rows.find(x => x.width === 300 && x.ext === 'webp')
    expect(t300.w).toBe(300)
    expect(t300.h).toBe(400) // 3:4 portrait preserved
  }, 30000)

  it('refuses to upscale a master smaller than the largest tier (unless --allow-upscale)', async () => {
    const small = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 10, g: 10, b: 10 } } }).jpeg().toBuffer()
    const src = await writeMaster('small.jpg', small)
    await expect(processOne({ src, name: 'small', lane: 'portfolio', outDir: dir, crop: true, sharpen: true }))
      .rejects.toThrow(/smaller than the largest portfolio tier.*needs ≥ 1200×1600/s)

    // explicit override still works (deliberate, eyes-open upscale)
    const r = await processOne({ src, name: 'small', lane: 'flash', outDir: dir, crop: true, sharpen: true, allowUpscale: true })
    expect(r.rows.find(x => x.width === 900).w).toBe(900)
  }, 30000)

  it('warns when a master is far off the lane aspect (the centre crop will trim edges)', async () => {
    const square = await sharp({ create: { width: 1600, height: 1600, channels: 3, background: { r: 200, g: 10, b: 10 } } }).jpeg().toBuffer()
    const src = await writeMaster('sq.jpg', square)
    const r = await processOne({ src, name: 'sq', lane: 'portfolio', outDir: dir, crop: true, sharpen: true })
    expect(r.warnings.join(' ')).toMatch(/not the portfolio aspect/)
    // …while an exact-aspect master warns about nothing
    const exact = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 10, g: 200, b: 10 } } }).jpeg().toBuffer()
    const r2 = await processOne({ src: await writeMaster('ok.jpg', exact), name: 'ok', lane: 'portfolio', outDir: dir, crop: true, sharpen: true })
    expect(r2.warnings).toEqual([])
  }, 60000)

  it('flattens a transparent PNG onto the site background for the JPG tier', async () => {
    const transparent = await sharp({ create: { width: 1000, height: 1000, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const src = await writeMaster('ghost.png', transparent)
    await processOne({ src, name: 'ghost', lane: 'flash', outDir: dir, crop: true, sharpen: true })
    const px = await sharp(path.join(dir, 'ghost-600.jpg')).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()
    // cream (#F7F1E3 = 247,241,227), not black — small JPEG tolerance
    expect(Math.abs(px[0] - 247)).toBeLessThan(8)
    expect(Math.abs(px[1] - 241)).toBeLessThan(8)
    expect(Math.abs(px[2] - 227)).toBeLessThan(8)
  }, 30000)

  it('emits JPG only at the flash base tier (no renderer references -300/-900 JPGs)', async () => {
    const master = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 40, g: 50, b: 60 } } }).jpeg().toBuffer()
    const src = await writeMaster('moth.jpg', master)
    const r = await processOne({ src, name: 'moth', lane: 'flash', outDir: dir, crop: true, sharpen: true })
    const files = (await readdir(dir)).filter(f => f.startsWith('moth-'))
    expect(files).toContain('moth-600.jpg')
    expect(files).not.toContain('moth-300.jpg')
    expect(files).not.toContain('moth-900.jpg')
    // AVIF/WebP still cover every width
    for (const w of LANES.flash.widths) {
      expect(files).toContain(`moth-${w}.avif`)
      expect(files).toContain(`moth-${w}.webp`)
    }
    expect(r.rows.filter(x => x.ext === 'jpg').map(x => x.width)).toEqual([600])
  }, 30000)
})
