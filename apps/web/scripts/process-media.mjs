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
//   • cover-crop to the lane's aspect (portfolio 3:4, flash 1:1 centre)
//   • sharpen when downscaling (camera masters are large; downscale softens)
//   • emit avif + webp + jpg at each width
//   • print every output's width,height + byte size so you can paste w,h into the
//     data file and sanity-check the budget
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
import sharp from 'sharp'

// Per-lane recipe. Widths + the <img> base tier MUST match the renderer's srcset
// (portfolio-tiles.js → -400/-800/-1200, base -800.jpg; flash-cards.js →
// -300/-600/-900, base -600.jpg). Keep these in lockstep with those files.
const LANES = {
  // Portfolio masters are casual phone photos where the tattoo is a small part of
  // a frame full of skin + studio background. `smart` finds the tattoo and zooms
  // to it (see focalBox) instead of a fixed centre/cover crop that leaves the ink
  // tiny. Flash is a clean centre square.
  portfolio: { widths: [400, 800, 1200], aspect: 3 / 4, mode: 'smart',  position: 'attention' },
  flash:     { widths: [300, 600, 900],  aspect: 1,      mode: 'cover',  position: 'centre' },
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

// Broad skin test (YCbCr + red-dominant), tolerant across skin tones. Used to
// keep the focal crop on the limb rather than the studio background.
function isSkin(r, g, b) {
  const Y = 0.299 * r + 0.587 * g + 0.114 * b
  const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return Y > 45 && r > g && g > b - 12 && Cb >= 80 && Cb <= 130 && Cr >= 135 && Cr <= 175
}

// Find the tattoo and return a normalised crop box {lx,ty,rx,by} (the downstream
// resize covers it to the exact tier aspect). The signal is colour DEVIATION from
// skin, NOT edges: skin texture, hair and creases are all "edgy" yet match the
// skin tone, so edge-based detection drifts; ink is what differs in colour from
// the limb's skin. Steps: segment skin → keep the largest blob (the limb) →
// hole-fill it → the enclosed pixels that deviate from the limb's skin tone (dark
// lines or colour) are the ink → keep the dominant connected blob(s), dropping
// scattered noise → centre a box on their bbox, sized to the tattoo (small pieces
// zoom in, big pieces aren't cropped in half). Weak/no signal → a centred
// fallback. Detection runs at low res; the box maps back to the full image.
async function focalBox(input, aspect) {
  const AW = 220, PAD = 0.16, MINF = 0.34
  const { data, info } = await sharp(input).rotate().removeAlpha().resize({ width: AW }).raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, ch = info.channels, N = W * H
  if (W < 8 || H < 8) return null

  // Box from a content centre + size: pad it, grow to `aspect`, floor to a minimum
  // (never over-zoom a speck), clamp inside the frame.
  const boxFrom = (ccx, ccy, bw, bh) => {
    let cw = bw * (1 + 2 * PAD), chh = bh * (1 + 2 * PAD)
    if (cw / chh > aspect) chh = cw / aspect; else cw = chh * aspect
    const minW = W * Math.sqrt(MINF), minH = minW / aspect
    if (cw < minW) { cw = minW; chh = minH }
    if (cw > W) { cw = W; chh = cw / aspect }
    if (chh > H) { chh = H; cw = chh * aspect }
    const l = Math.max(0, Math.min(W - cw, ccx - cw / 2))
    const t = Math.max(0, Math.min(H - chh, ccy - chh / 2))
    return { lx: l / W, ty: t / H, rx: (l + cw) / W, by: (t + chh) / H }
  }
  const centre = () => boxFrom(W / 2, H / 2, W * 0.6, H * 0.6)

  const skin = new Uint8Array(N)
  for (let i = 0, p = 0; i < N; i++, p += ch) skin[i] = isSkin(data[p], data[p + 1], data[p + 2]) ? 1 : 0

  // Largest connected skin component = the limb (rejects skin-toned background).
  const lab = new Int32Array(N).fill(-1), stack = new Int32Array(N)
  let bestLab = -1, bestSize = 0, cur = 0
  for (let s = 0; s < N; s++) {
    if (!skin[s] || lab[s] >= 0) continue
    let sp = 0; stack[sp++] = s; lab[s] = cur; let size = 0
    while (sp) {
      const i = stack[--sp]; size++; const x = i % W, y = (i / W) | 0
      if (x > 0 && skin[i-1] && lab[i-1] < 0) { lab[i-1] = cur; stack[sp++] = i-1 }
      if (x < W-1 && skin[i+1] && lab[i+1] < 0) { lab[i+1] = cur; stack[sp++] = i+1 }
      if (y > 0 && skin[i-W] && lab[i-W] < 0) { lab[i-W] = cur; stack[sp++] = i-W }
      if (y < H-1 && skin[i+W] && lab[i+W] < 0) { lab[i+W] = cur; stack[sp++] = i+W }
    }
    if (size > bestSize) { bestSize = size; bestLab = cur }
    cur++
  }
  if (bestLab < 0 || bestSize < N * 0.04) return centre()
  const limb = new Uint8Array(N)
  for (let i = 0; i < N; i++) limb[i] = lab[i] === bestLab ? 1 : 0

  // Hole-fill: flood "outside" from the border over non-limb pixels; the non-limb
  // pixels NOT reached are walled in by the limb = candidate ink.
  const outside = new Uint8Array(N)
  let sp = 0
  const push = i => { if (!limb[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i } }
  for (let x = 0; x < W; x++) { push(x); push((H-1)*W + x) }
  for (let y = 0; y < H; y++) { push(y*W); push(y*W + W-1) }
  while (sp) { const i = stack[--sp], x = i % W, y = (i / W) | 0
    if (x > 0) push(i-1); if (x < W-1) push(i+1); if (y > 0) push(i-W); if (y < H-1) push(i+W) }

  // Ink = enclosed pixels that deviate from the limb's median skin tone.
  const skinLumArr = []
  for (let i = 0, p = 0; i < N; i++, p += ch) if (limb[i]) skinLumArr.push(0.299*data[p]+0.587*data[p+1]+0.114*data[p+2])
  skinLumArr.sort((a, b) => a - b)
  const skinLum = skinLumArr[(skinLumArr.length/2)|0] || 150
  const ink = new Uint8Array(N); let inkCount = 0
  for (let i = 0, p = 0; i < N; i++, p += ch) {
    if (limb[i] || outside[i]) continue
    const Y = 0.299*data[p]+0.587*data[p+1]+0.114*data[p+2]
    const sat = Math.max(data[p],data[p+1],data[p+2]) - Math.min(data[p],data[p+1],data[p+2])
    if (Y < skinLum * 0.88 || sat > 45) { ink[i] = 1; inkCount++ }   // dark line OR colour
  }
  if (inkCount < N * 0.0012) return centre()

  // Connected components of ink; keep the dominant blob(s), drop scattered noise.
  const ilab = new Int32Array(N).fill(-1), comps = []
  for (let s = 0; s < N; s++) {
    if (!ink[s] || ilab[s] >= 0) continue
    let q = 0; stack[q++] = s; ilab[s] = comps.length
    let size = 0, mnx = W, mny = H, mxx = 0, mxy = 0
    while (q) {
      const i = stack[--q], x = i % W, y = (i / W) | 0; size++
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y
      if (x > 0 && ink[i-1] && ilab[i-1] < 0) { ilab[i-1] = comps.length; stack[q++] = i-1 }
      if (x < W-1 && ink[i+1] && ilab[i+1] < 0) { ilab[i+1] = comps.length; stack[q++] = i+1 }
      if (y > 0 && ink[i-W] && ilab[i-W] < 0) { ilab[i-W] = comps.length; stack[q++] = i-W }
      if (y < H-1 && ink[i+W] && ilab[i+W] < 0) { ilab[i+W] = comps.length; stack[q++] = i+W }
    }
    comps.push({ size, mnx, mny, mxx, mxy })
  }
  const maxSize = Math.max(...comps.map(c => c.size))
  const kept = comps.filter(c => c.size >= maxSize * 0.12)  // main subject + comparable parts
  let mnx = W, mny = H, mxx = 0, mxy = 0
  for (const c of kept) { if (c.mnx < mnx) mnx = c.mnx; if (c.mny < mny) mny = c.mny; if (c.mxx > mxx) mxx = c.mxx; if (c.mxy > mxy) mxy = c.mxy }
  return boxFrom((mnx+mxx)/2, (mny+mxy)/2, Math.max(1, mxx-mnx), Math.max(1, mxy-mny))
}

// Produce every tier×format for one master. Returns the per-output rows so the
// caller can print a single aligned table for the whole batch.
async function processOne({ src, name, lane, outDir, crop, sharpen, manualCrop }) {
  const recipe = LANES[lane]
  const input = await readFile(src)
  const meta = await sharp(input).rotate().metadata() // rotate() so meta w/h is post-orientation
  const srcW = meta.width
  const srcH = meta.height

  // For the smart lane, crop every tier to one box. A per-image manual override
  // (crop: { cx, cy, h } — normalised centre + height fraction) always wins, for
  // the handful auto-detection can't nail; otherwise focalBox locates the tattoo
  // (and centre-falls-back itself). The box is grown/covered to the tier aspect.
  let focal = null, focalMethod = 'cover'
  if (crop && recipe.mode === 'smart') {
    let box
    if (manualCrop) {
      let hh = Math.min(1, manualCrop.h) * srcH, ww = hh * recipe.aspect
      // Clamp a too-wide box back inside the frame (mirroring boxFrom), so a manual
      // override on a wide source can't silently mis-crop: without this, ww > srcW
      // collapses the left edge to 0 and the requested centre/aspect is lost.
      if (ww > srcW) { ww = srcW; hh = ww / recipe.aspect }
      const cx = manualCrop.cx * srcW, cy = manualCrop.cy * srcH
      const l = Math.max(0, Math.min(srcW - ww, cx - ww / 2)), t = Math.max(0, Math.min(srcH - hh, cy - hh / 2))
      box = { lx: l / srcW, ty: t / srcH, rx: (l + ww) / srcW, by: (t + hh) / srcH }
      focalMethod = 'manual'
    } else {
      box = await focalBox(input, recipe.aspect)
      focalMethod = 'auto'
    }
    if (box) {
      const left = Math.round(box.lx * srcW), top = Math.round(box.ty * srcH)
      const w = Math.max(1, Math.round((box.rx - box.lx) * srcW))
      const h = Math.max(1, Math.round((box.by - box.ty) * srcH))
      focal = { left, top, width: Math.min(w, srcW - left), height: Math.min(h, srcH - top) }
    }
  }

  const rows = []
  for (const width of recipe.widths) {
    // Base pipeline: apply EXIF rotation, then crop. `smart` extracts the detected
    // tattoo box (already the lane aspect) then downscales; otherwise cover-crop to
    // the lane aspect, or just downscale keeping source aspect (--no-crop).
    let height
    const make = () => {
      let pipe = sharp(input).rotate()
      if (crop && focal) {
        height = Math.round(width / recipe.aspect)
        pipe = pipe.extract(focal).resize(width, height, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
      } else if (crop) {
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
  return { name, srcW, srcH, rows, focalMethod }
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
    results.push(await processOne({ src: srcAbs, name: job.name, lane: args.lane, outDir, crop: args.crop, sharpen: args.sharpen, manualCrop: job.crop }))
  }

  // One aligned report for the whole run. The `base` line is what the data file
  // needs: the no-extension path + the intrinsic w,h of the <img> tier
  // (portfolio -800, flash -600).
  const baseTier = args.lane === 'flash' ? 600 : 800
  console.log(`\nlane=${args.lane}  out=${outDir}\n`)
  for (const r of results) {
    console.log(`■ ${r.name}   (master ${r.srcW}×${r.srcH}, crop=${r.focalMethod})`)
    for (const row of r.rows) {
      console.log(`    ${row.name}-${String(row.width).padEnd(4)} ${row.ext.padEnd(4)}  ${String(row.w).padStart(4)}×${String(row.h).toString().padEnd(4)}  ${kb(row.bytes).padStart(9)}`)
    }
    const base = r.rows.find(x => x.width === baseTier && x.ext === 'jpg')
    if (base) console.log(`    → data:  img:'/.../${r.name}'  w:${base.w}  h:${base.h}\n`)
  }

  // Totals — quick budget sanity for the whole batch.
  const allRows = results.flatMap(r => r.rows)
  const total = allRows.reduce((s, r) => s + r.bytes, 0)
  console.log(`${results.length} image(s), ${allRows.length} files, ${kb(total)} total\n`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
