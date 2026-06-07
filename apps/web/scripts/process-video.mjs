#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// process-video.mjs — turn an artist's master clip (e.g. tattooing footage) into the two-format
// hero video + poster the site serves (see docs/MEDIA.md and src/data/media.js).
// ─────────────────────────────────────────────────────────────────────────────
// media.js has two hero slots, each expecting three files in public/videos/:
//
//   slot=hero   (homepage, 16:9)   → hero.webm  hero.mp4  hero-poster.jpg   (< 4 MB)
//   slot=about  (About, 4:5 port.) → about-portrait.webm  about-portrait.mp4
//                                     about-portrait-poster.jpg              (< 3 MB)
//
// Per clip it produces (recipe straight from docs/MEDIA.md):
//   • WebM (VP9), muted, cover-cropped to the slot aspect, scaled to display
//   • MP4 (H.264, yuv420p, +faststart) fallback, same crop/scale
//   • JPG poster from a representative frame (the LCP + reduced-motion still)
// and prints each output's size against the slot budget.
//
// The masters are short phone clips of the artist tattooing; this trims to a seamless-ish
// loop window, drops audio, and sizes to the column (2× display is plenty).
//
// Usage
//   node scripts/process-video.mjs --slot hero  --src /path/master.mp4 \
//     --out public/videos [--start 2 --duration 12 --crf 34]
//   node scripts/process-video.mjs --slot about --src /path/master.mp4 --out public/videos
//
// Requires ffmpeg + ffprobe on PATH. Commit only the web exports below via Git LFS
// (.gitattributes tracks public/videos/*.{webm,mp4}); never commit the raw master.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const SLOTS = {
  hero:  { base: 'hero',           aspect: [16, 9], scaleW: 1280, budgetMB: 4 },
  about: { base: 'about-portrait', aspect: [4, 5],  scaleW: 720,  budgetMB: 3 },
}

function parseArgs(argv) {
  const a = { slot: null, src: null, out: null, start: 0, duration: null, crf: 34, fps: 24 }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    switch (k) {
      case '--slot': a.slot = argv[++i]; break
      case '--src': a.src = argv[++i]; break
      case '--out': a.out = argv[++i]; break
      case '--start': a.start = Number(argv[++i]); break
      case '--duration': a.duration = Number(argv[++i]); break
      case '--crf': a.crf = Number(argv[++i]); break
      case '--fps': a.fps = Number(argv[++i]); break
      default: throw new Error(`Unknown arg: ${k}`)
    }
  }
  return a
}

function have(bin) {
  const r = spawnSync(bin, ['-version'], { stdio: 'ignore' })
  return !r.error
}

function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.status !== 0) throw new Error(`${bin} exited ${r.status}`)
}

const mb = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`

async function main() {
  const a = parseArgs(process.argv.slice(2))
  const slot = SLOTS[a.slot]
  if (!slot) throw new Error(`--slot must be one of: ${Object.keys(SLOTS).join(', ')}`)
  if (!a.src) throw new Error('--src <master> is required')
  if (!a.out) throw new Error('--out <dir> is required')

  if (!have('ffmpeg') || !have('ffprobe')) {
    throw new Error(
      'ffmpeg/ffprobe not found on PATH.\n' +
      '  Install one of:  winget install Gyan.FFmpeg   |   choco install ffmpeg   |   scoop install ffmpeg\n' +
      '  (or `npm i -D ffmpeg-static` and point PATH at it). Then re-run.',
    )
  }

  await stat(path.resolve(a.src))
  const outDir = path.resolve(a.out)
  await mkdir(outDir, { recursive: true })

  const [aw, ah] = slot.aspect
  const w = slot.scaleW
  const h = Math.round((w * ah) / aw / 2) * 2 // even height for yuv420p
  // Cover-crop to the slot aspect, then scale to the display width. Even dims.
  const vf = `crop='min(iw,ih*${aw}/${ah})':'min(ih,iw*${ah}/${aw})',scale=${w}:${h}:flags=lanczos,fps=${a.fps}`

  const trim = []
  if (a.start) trim.push('-ss', String(a.start))
  if (a.duration) trim.push('-t', String(a.duration))

  const webm = path.join(outDir, `${slot.base}.webm`)
  const mp4 = path.join(outDir, `${slot.base}.mp4`)
  const poster = path.join(outDir, `${slot.base}-poster.jpg`)

  console.log(`\n▶ ${a.slot}: ${slot.aspect.join(':')} ${w}×${h}, crf=${a.crf}, fps=${a.fps}, budget <${slot.budgetMB} MB`)

  // WebM (VP9), muted. -b:v 0 → constant-quality (crf) mode.
  console.log('… WebM (VP9)')
  run('ffmpeg', ['-y', ...trim, '-i', a.src, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(a.crf), '-row-mt', '1', '-vf', vf, webm])

  // MP4 (H.264) fallback, web-friendly.
  console.log('… MP4 (H.264)')
  run('ffmpeg', ['-y', ...trim, '-i', a.src, '-an', '-c:v', 'libx264', '-crf', String(Math.max(0, a.crf - 10)), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', vf, mp4])

  // Poster: a representative frame (use the trim start), same crop/scale.
  console.log('… poster (JPG)')
  run('ffmpeg', ['-y', ...(a.start ? ['-ss', String(a.start)] : []), '-i', a.src, '-frames:v', '1', '-vf', `crop='min(iw,ih*${aw}/${ah})':'min(ih,iw*${ah}/${aw})',scale=${w}:${h}:flags=lanczos`, '-q:v', '3', poster])

  console.log('')
  let over = false
  for (const f of [webm, mp4, poster]) {
    const s = (await stat(f)).size
    const tag = f.endsWith('-poster.jpg') ? '' : (s > slot.budgetMB * 1024 * 1024 ? '  ⚠ OVER BUDGET' : '  ✓')
    if (tag.includes('OVER')) over = true
    console.log(`  ${path.basename(f).padEnd(28)} ${mb(s).padStart(9)}${tag}`)
  }
  if (over) {
    console.log(`\n  ⚠ A video is over the <${slot.budgetMB} MB budget. Re-run with a higher --crf`)
    console.log('    (e.g. --crf 38), a shorter --duration, or a smaller --fps.')
  }
  console.log('')
}

main().catch(err => { console.error(err.message); process.exit(1) })
