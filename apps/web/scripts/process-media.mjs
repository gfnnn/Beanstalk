#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// process-media.mjs — turn tattoo master photos into the responsive tiers the
// portfolio / flash renderers expect.
// ─────────────────────────────────────────────────────────────────────────────
// The site is data-driven (src/data/pieces.js, src/data/flash.js) and the
// renderers (src/build/portfolio-tiles.js, src/build/flash-cards.js) build a
// <picture> srcset from a *base path with no extension*, e.g. "/images/tattoos/koi":
//
//   portfolio  →  <base>-400 / -800 / -1200  in .avif/.webp/.jpg   (3:4 portrait)
//   flash      →  <base>-300 / -600 / -900    in .avif/.webp/.jpg   (1:1 square)
//
// This script produces exactly those files from a master image, doing the things
// you want on every still:
//   • auto-rotate from EXIF orientation, then drop the orientation tag
//   • strip ALL metadata (privacy — removes GPS/camera; and a few bytes)
//   • centre cover-crop to the lane's aspect (portfolio 3:4, flash 1:1)
//   • sharpen when downscaling (camera masters are large; downscale softens)
//   • emit avif + webp + jpg at each width
//   • print every output's width,height + byte size so you can paste w,h into the
//     data file and sanity-check the budget
//
// Masters are expected to arrive ALREADY FRAMED by the artist (pre-edited before
// upload), so the crop is a plain centre cover-crop to the lane aspect — there is
// no automated subject detection / re-centring on the tattoo.
//
// Usage
//   Single:
//     node scripts/process-media.mjs --lane portfolio --out public/images/tattoos \
//       --src /path/master.jpg --name koi
//   Batch (manifest = JSON array of { "src": "...", "name": "koi" }):
//     node scripts/process-media.mjs --lane flash --out public/images/flash \
//       --manifest /path/batch.json
//
// Flags
//   --lane portfolio|flash   (required) sets the widths + crop aspect
//   --out  <dir>             (required) output directory (created if missing)
//   --src <file> --name <b>  single input → <out>/<b>-<w>.<ext>
//   --manifest <file.json>   batch: [{ src, name }, ...]
//   --no-crop                downscale by width but keep the source aspect ratio
//                            (used when migrating already-cropped exports so we
//                             don't shave or upscale them into a new aspect)
//   --no-sharpen             skip the downscale sharpen pass
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

// Per-lane recipe. Widths + the <img> base tier MUST match the renderer's srcset
// (portfolio-tiles.js → -400/-800/-1200, base -800.jpg; flash-cards.js →
// -300/-600/-900, base -600.jpg). Keep these in lockstep with those files.
const LANES = {
  // Masters arrive already framed by the artist (pre-edited before upload), so both
  // lanes are a plain centre cover-crop to the lane aspect — portfolio 3:4, flash 1:1.
  portfolio: { widths: [400, 800, 1200], aspect: 3 / 4, position: 'centre' },
  flash:     { widths: [300, 600, 900],  aspect: 1,     position: 'centre' },
}

// Encoder settings — quality tuned for photos; effort high since this is offline.
const ENCODERS = {
  avif: { ext: 'avif', opts: { quality: 50, effort: 6 } },
  webp: { ext: 'webp', opts: { quality: 72, effort: 6 } },
  jpg:  { ext: 'jpg',  opts: { quality: 80, mozjpeg: true } },
}

function parseArgs(argv) {
  const args = { lane: null, out: null, src: null, name: null, manifest: null, crop: true, sharpen: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--lane': args.lane = argv[++i]; break
      case '--out': args.out = argv[++i]; break
      case '--src': args.src = argv[++i]; break
      case '--name': args.name = argv[++i]; break
      case '--manifest': args.manifest = argv[++i]; break
      case '--no-crop': args.crop = false; break
      case '--no-sharpen': args.sharpen = false; break
      default: throw new Error(`Unknown arg: ${a}`)
    }
  }
  return args
}

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`

// Produce every tier×format for one master. Returns the per-output rows so the
// caller can print a single aligned table for the whole batch.
async function processOne({ src, name, lane, outDir, crop, sharpen }) {
  const recipe = LANES[lane]
  const input = await readFile(src)
  const meta = await sharp(input).rotate().metadata() // rotate() so meta w/h is post-orientation
  const srcW = meta.width
  const srcH = meta.height

  const rows = []
  for (const width of recipe.widths) {
    // Base pipeline: apply EXIF rotation, then crop. Default is a centre cover-crop
    // to the lane aspect (masters are pre-framed by the artist); --no-crop just
    // downscales by width keeping the source aspect.
    let height
    const make = () => {
      let pipe = sharp(input).rotate()
      if (crop) {
        height = Math.round(width / recipe.aspect)
        pipe = pipe.resize(width, height, { fit: 'cover', position: recipe.position, kernel: 'lanczos3' })
      } else {
        height = Math.round((srcH / srcW) * width)
        pipe = pipe.resize({ width, kernel: 'lanczos3' })
      }
      // Sharpen only when we're actually shrinking (downscale softens; upscaling
      // a small export to a bigger tier should NOT be sharpened — it amplifies).
      if (sharpen && width < srcW) pipe = pipe.sharpen({ sigma: 0.8 })
      return pipe
    }

    for (const enc of Object.values(ENCODERS)) {
      const file = path.join(outDir, `${name}-${width}.${enc.ext}`)
      const buf = await make()[enc.ext === 'jpg' ? 'jpeg' : enc.ext](enc.opts).toBuffer()
      await writeFile(file, buf)
      const probe = await sharp(buf).metadata()
      rows.push({ name, width, ext: enc.ext, w: probe.width, h: probe.height, bytes: buf.length })
    }
  }
  return { name, srcW, srcH, rows }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.lane || !LANES[args.lane]) throw new Error(`--lane must be one of: ${Object.keys(LANES).join(', ')}`)
  if (!args.out) throw new Error('--out <dir> is required')

  let jobs
  if (args.manifest) {
    jobs = JSON.parse(await readFile(args.manifest, 'utf8'))
  } else if (args.src && args.name) {
    jobs = [{ src: args.src, name: args.name }]
  } else {
    throw new Error('provide either --manifest <file> or --src <file> --name <basename>')
  }

  const outDir = path.resolve(args.out)
  await mkdir(outDir, { recursive: true })

  const results = []
  for (const job of jobs) {
    const srcAbs = path.resolve(job.src)
    await stat(srcAbs) // fail loudly if a master is missing
    results.push(await processOne({ src: srcAbs, name: job.name, lane: args.lane, outDir, crop: args.crop, sharpen: args.sharpen }))
  }

  printReport(results, args.lane, outDir)
}

// One aligned report for a whole run: each output's w×h + byte size, the data-file
// `base` line to paste (the no-extension path + the intrinsic w,h of the <img> tier —
// portfolio -800, flash -600), and the batch totals for a quick budget sanity check.
// Exported so the Dropbox collector (sync-dropbox-media.mjs) prints identically.
export function printReport(results, lane, outDir) {
  const baseTier = lane === 'flash' ? 600 : 800
  console.log(`\nlane=${lane}${outDir ? `  out=${outDir}` : ''}\n`)
  for (const r of results) {
    console.log(`■ ${r.name}   (master ${r.srcW}×${r.srcH})`)
    for (const row of r.rows) {
      console.log(`    ${row.name}-${String(row.width).padEnd(4)} ${row.ext.padEnd(4)}  ${String(row.w).padStart(4)}×${String(row.h).toString().padEnd(4)}  ${kb(row.bytes).padStart(9)}`)
    }
    const base = r.rows.find(x => x.width === baseTier && x.ext === 'jpg')
    if (base) console.log(`    → data:  img:'/.../${r.name}'  w:${base.w}  h:${base.h}\n`)
  }
  const allRows = results.flatMap(r => r.rows)
  const total = allRows.reduce((s, r) => s + r.bytes, 0)
  console.log(`${results.length} image(s), ${allRows.length} files, ${kb(total)} total\n`)
}

// Reusable pieces for the Dropbox collector — the lane recipes and the single-master
// processor. Imported there so the masters fetched from Dropbox go through the EXACT
// same crop/encode pipeline (and report) as a hand-run batch.
export { LANES, processOne }

// Run as a CLI only when invoked directly (`node scripts/process-media.mjs …`).
// When another module imports this file (the Dropbox collector), main() must NOT
// fire — importing has no side effects.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main().catch(err => { console.error(err.message); process.exit(1) })
