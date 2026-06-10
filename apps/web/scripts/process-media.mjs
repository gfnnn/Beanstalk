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
//   --allow-upscale          accept a master smaller than the largest tier
//                            (default: hard error — an upscale ships blurry)
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { activePalette } from '../src/build/palette.js'

// Pin the libvips thread pool: AVIF output bytes vary with the worker count, so
// the default (= CPU cores) makes the same master re-encode byte-DIFFERENT on a
// different machine/runner spec — churning every committed .avif in the next
// sync PR. One thread keeps re-runs byte-identical everywhere ("the crop is
// deterministic" promise in MEDIA.md). This is offline tooling; the speed cost
// doesn't matter.
sharp.concurrency(1)

// Transparent masters (line-art flash PNGs): JPEG has no alpha, and sharp's
// default flattens onto black. Flatten onto the site background so the JPG
// fallback tier matches what the AVIF/WebP tiers show over the page.
const JPG_BACKGROUND = activePalette.colors.bg

// Per-lane recipe. Widths + the <img> base tier MUST match the renderer's srcset
// (portfolio-tiles.js → -400/-800/-1200, base -800.jpg; flash-cards.js →
// -300/-600/-900, base -600.jpg). Keep these in lockstep with those files.
// `jpgWidths` trims the JPG tiers to the ones a renderer actually references —
// flash builds its srcset from AVIF/WebP only, with JPG just as the -600 <img>
// fallback, so -300/-900 JPGs would be dead committed bytes. `publicBase` is the
// site path the data files reference (printed in the report / written to data).
const LANES = {
  // Masters arrive already framed by the artist (pre-edited before upload), so both
  // lanes are a plain centre cover-crop to the lane aspect — portfolio 3:4, flash 1:1.
  portfolio: { widths: [400, 800, 1200], aspect: 3 / 4, position: 'centre', publicBase: '/images/tattoos' },
  flash:     { widths: [300, 600, 900],  aspect: 1,     position: 'centre', publicBase: '/images/flash', jpgWidths: [600] },
}

// Encoder settings — quality tuned for photos; effort high since this is offline.
const ENCODERS = {
  avif: { ext: 'avif', opts: { quality: 50, effort: 6 } },
  webp: { ext: 'webp', opts: { quality: 72, effort: 6 } },
  jpg:  { ext: 'jpg',  opts: { quality: 80, mozjpeg: true } },
}

function parseArgs(argv) {
  const args = { lane: null, out: null, src: null, name: null, manifest: null, crop: true, sharpen: true, allowUpscale: false }
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
      case '--allow-upscale': args.allowUpscale = true; break
      default: throw new Error(`Unknown arg: ${a}`)
    }
  }
  return args
}

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`

// Aspect drift the centre cover-crop will silently trim before we warn about it.
// Masters are meant to arrive pre-framed to the lane aspect; a couple of percent
// is export rounding, more than that means real edges (possibly ink) get shaved.
const ASPECT_TOLERANCE = 0.02

// Produce every tier×format for one master. Returns the per-output rows so the
// caller can print a single aligned table for the whole batch.
async function processOne({ src, name, lane, outDir, crop, sharpen, allowUpscale = false }) {
  const recipe = LANES[lane]
  const input = await readFile(src)
  // metadata() reads the input header, so its width/height IGNORE the EXIF
  // orientation that .rotate() applies later — a portrait phone/camera master
  // reports swapped dims there. `autoOrient` carries the post-orientation size.
  const meta = await sharp(input).metadata()
  const swapped = (meta.orientation || 1) >= 5
  const srcW = meta.autoOrient?.width ?? (swapped ? meta.height : meta.width)
  const srcH = meta.autoOrient?.height ?? (swapped ? meta.width : meta.height)

  const warnings = []
  if (crop) {
    // Never upscale silently: a master below the largest tier would interpolate
    // up and ship blurry while the report prints clean-looking dimensions. The
    // fix is a bigger export; --allow-upscale exists for deliberate exceptions.
    const minW = Math.max(...recipe.widths)
    const minH = Math.round(minW / recipe.aspect)
    if ((srcW < minW || srcH < minH) && !allowUpscale) {
      throw new Error(
        `${name}: master is ${srcW}×${srcH} — smaller than the largest ${lane} tier ` +
        `(needs ≥ ${minW}×${minH}). Export it bigger, or pass --allow-upscale to accept a blurry upscale.`,
      )
    }
    // The crop never hunts for the subject, so an off-aspect master loses edges.
    const drift = Math.abs(srcW / srcH - recipe.aspect) / recipe.aspect
    if (drift > ASPECT_TOLERANCE) {
      warnings.push(
        `${name}: master is ${srcW}×${srcH} (${(srcW / srcH).toFixed(3)}), not the ${lane} aspect ` +
        `(${recipe.aspect.toFixed(3)}) — the centre crop will trim ${drift > 0.10 ? 'a LOT of' : 'some'} edge. ` +
        're-frame at source if that clips the ink.',
      )
    }
  }

  const rows = []
  for (const width of recipe.widths) {
    // Base pipeline: apply EXIF rotation, then crop. Default is a centre cover-crop
    // to the lane aspect (masters are pre-framed by the artist); --no-crop just
    // downscales by width keeping the source aspect.
    const make = () => {
      let pipe = sharp(input).rotate()
      if (crop) {
        const height = Math.round(width / recipe.aspect)
        pipe = pipe.resize(width, height, { fit: 'cover', position: recipe.position, kernel: 'lanczos3' })
      } else {
        pipe = pipe.resize({ width, kernel: 'lanczos3' })
      }
      // Sharpen only when we're actually shrinking (downscale softens; upscaling
      // a small export to a bigger tier should NOT be sharpened — it amplifies).
      if (sharpen && width < srcW) pipe = pipe.sharpen({ sigma: 0.8 })
      return pipe
    }

    for (const enc of Object.values(ENCODERS)) {
      // Skip JPG tiers no renderer references (see LANES.jpgWidths).
      if (enc.ext === 'jpg' && recipe.jpgWidths && !recipe.jpgWidths.includes(width)) continue
      const file = path.join(outDir, `${name}-${width}.${enc.ext}`)
      const pipe = enc.ext === 'jpg' ? make().flatten({ background: JPG_BACKGROUND }) : make()
      const buf = await pipe[enc.ext === 'jpg' ? 'jpeg' : enc.ext](enc.opts).toBuffer()
      await writeFile(file, buf)
      const probe = await sharp(buf).metadata()
      rows.push({ name, width, ext: enc.ext, w: probe.width, h: probe.height, bytes: buf.length })
    }
  }
  return { name, srcW, srcH, rows, warnings }
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
    results.push(await processOne({ src: srcAbs, name: job.name, lane: args.lane, outDir, crop: args.crop, sharpen: args.sharpen, allowUpscale: args.allowUpscale }))
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
    for (const w of r.warnings || []) console.log(`    ⚠ ${w}`)
    const base = r.rows.find(x => x.width === baseTier && x.ext === 'jpg')
    if (base) console.log(`    → data:  img:'${LANES[lane].publicBase}/${r.name}'  w:${base.w}  h:${base.h}\n`)
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
