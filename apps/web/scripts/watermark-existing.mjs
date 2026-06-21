#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// watermark-existing.mjs — one-time, in-place watermark of the ALREADY-LIVE tiers
// ─────────────────────────────────────────────────────────────────────────────
// Most of the 54 live portfolio pieces predate the Dropbox flow and their masters
// are gone, so we can't reprocess them from source. Instead this composites the
// SAME brand-mark watermark (src/build/watermark.js) straight onto the committed
// full-res tier files and re-encodes them in place with the SAME encoder opts as
// process-media.mjs — so a legacy image is visually consistent with a freshly
// processed one. It costs one extra encode on an already-optimised file (a small,
// one-time quality hit), which is the accepted trade for covering masterless pieces.
//
// Scope: only the full-res tier per lane (portfolio -1200, flash -900) — the image
// the lightbox / a download actually shows. Thumbnails stay clean.
//
// Idempotent: every file it stamps is recorded in scripts/.watermarked.json and
// skipped on the next run, so re-running can't double-stamp. New Dropbox pieces are
// watermarked at processing time (process-media.mjs), so they never come through
// here — this targets the fixed legacy set and is normally run exactly once.
//
// Usage
//   node scripts/watermark-existing.mjs            # stamp + re-encode in place
//   node scripts/watermark-existing.mjs --dry-run  # list what WOULD be stamped
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { WATERMARK_WIDTH, watermarkSvgBuffer } from '../src/build/watermark.js'
import { ENCODERS, LANES } from './process-media.mjs'

sharp.concurrency(1) // byte-deterministic re-encodes, same as process-media.mjs

const webRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const MANIFEST = path.join(webRoot, 'scripts', '.watermarked.json')

// ext → encoder. ENCODERS is keyed by format; jpg encodes via .jpeg().
const encoderFor = ext => Object.values(ENCODERS).find(e => e.ext === ext)
const encodeMethod = ext => (ext === 'jpg' ? 'jpeg' : ext)

async function loadManifest() {
  try {
    return new Set(JSON.parse(await readFile(MANIFEST, 'utf8')))
  } catch {
    return new Set() // first run — no manifest yet
  }
}

// Every full-res tier file on disk, as repo-relative paths (stable manifest keys).
async function targets() {
  const out = []
  for (const [lane, recipe] of Object.entries(LANES)) {
    const width = WATERMARK_WIDTH[lane]
    const dir = path.join(webRoot, 'public', recipe.publicBase.replace(/^\//, ''))
    let files
    try {
      files = await readdir(dir)
    } catch {
      continue // a lane dir may not exist yet (flash starts empty)
    }
    for (const f of files) {
      const m = f.match(/-(\d+)\.(avif|webp|jpg)$/)
      if (m && Number(m[1]) === width) out.push(path.join(dir, f))
    }
  }
  return out.sort()
}

async function stamp(file) {
  const ext = path.extname(file).slice(1)
  const enc = encoderFor(ext)
  const buf = await readFile(file)
  const meta = await sharp(buf).metadata()
  const lane = file.includes('/flash/') ? 'flash' : 'portfolio'
  const out = await sharp(buf)
    .composite([{ input: watermarkSvgBuffer({ width: meta.width, height: meta.height, lane }), gravity: 'northwest' }])
    [encodeMethod(ext)](enc.opts)
    .toBuffer()
  await writeFile(file, out)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const done = await loadManifest()
  const all = await targets()
  const todo = all.filter(f => !done.has(path.relative(webRoot, f)))

  console.log(`\n${all.length} full-res tier(s) found, ${all.length - todo.length} already stamped, ${todo.length} to do${dryRun ? '  (dry run)' : ''}\n`)
  for (const f of todo) console.log(`  ${dryRun ? 'would stamp' : 'stamp'}  ${path.relative(webRoot, f)}`)
  if (dryRun || !todo.length) return

  for (const f of todo) {
    await stamp(f)
    done.add(path.relative(webRoot, f))
  }
  await writeFile(MANIFEST, `${JSON.stringify([...done].sort(), null, 2)}\n`)
  console.log(`\n✓ stamped ${todo.length} file(s); manifest → ${path.relative(webRoot, MANIFEST)}\n`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
