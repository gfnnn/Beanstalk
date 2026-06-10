#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// sync-dropbox-media.mjs — collect tattoo master photos from Dropbox and run them
// through the responsive-tier pipeline (process-media.mjs).
// ─────────────────────────────────────────────────────────────────────────────
// The masters live OFF-REPO in Dropbox (see docs/MEDIA.md); only the generated web
// tiers are committed. This script automates the fetch half of that workflow:
//
//   Dropbox folder of masters  ──▶  download (cached)  ──▶  process-media.mjs
//        /<base>/portfolio/*.jpg                            (3:4 portrait tiers)
//        /<base>/flash/drop-N/*.jpg                         (1:1 square tiers)
//                                                           ──▶ public/images/…
//
// Each master's METADATA rides in its filename (the " -- " grammar parsed by
// master-metadata.mjs — see docs/MEDIA.md). A NEW piece (no data entry yet) must
// carry valid metadata or the file is REJECTED — listed in the report with the
// exact fix, while the rest of the run continues. A master whose slug already has
// a data entry just refreshes its tiers (filename metadata, if any, is ignored —
// the data file is the source of truth once an entry exists). With --write-data
// the new pieces' entries are inserted into src/data/{pieces,flash}.js too.
//
// It is OFFLINE dev/CI tooling, exactly like process-media.mjs: the live static
// site never calls Dropbox. The Dropbox API hosts are blocked by the Claude-web
// sandbox allowlist, so run this LOCALLY (or in CI), not from a web session.
//
// Auth (env — see .env.example / docs/MEDIA.md):
//   • Quick:    DROPBOX_ACCESS_TOKEN              (a short-lived token, ~4h)
//   • Durable:  DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY [+ DROPBOX_APP_SECRET]
//               (refresh-token flow → fresh access token each run)
//   • Folder:   DROPBOX_MEDIA_PATH                (base folder, default below)
//
// Usage (from the repo root so --env-file-if-exists picks up .env, or export vars):
//   node --env-file-if-exists=.env apps/web/scripts/sync-dropbox-media.mjs --lane portfolio
//   node --env-file-if-exists=.env apps/web/scripts/sync-dropbox-media.mjs --all --write-data
//   npm run media:dropbox -- --lane flash            # same, via the root script
//
// Flags
//   --lane portfolio|flash   process one lane (from <base>/<lane> in Dropbox)
//   --all                    process both lanes
//   --remote <path>          override the Dropbox folder for a single --lane
//   --remote-base <path>     override the base folder (lanes are subfolders of it)
//   --out <dir>              override the output dir (single --lane only)
//   --cache <dir>            local staging dir for downloads (default below)
//   --write-data             insert new pieces' entries into the data files
//   --summary <file>         also write a markdown summary (the workflow's PR body)
//   --dry-run                list what WOULD be fetched + how each filename parses;
//                            touch nothing (the cheap way to check names)
//   --force                  re-download even when the cached content hash matches
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { slugify, titleOf, parseMasterName, formatPieceEntry, formatFlashEntry, insertEntryLines } from './master-metadata.mjs'

export { slugify } // canonical home is master-metadata.mjs; re-exported for callers/tests

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') // apps/web

// Per-lane defaults: where tiers land (mirrors process-media.mjs / MEDIA.md), the
// Dropbox subfolder under the base path, and the data file new entries belong to.
export const LANE_DEFAULTS = {
  portfolio: { out: path.join(WEB_ROOT, 'public/images/tattoos'), sub: 'portfolio', dataFile: path.join(WEB_ROOT, 'src/data/pieces.js'), arrayName: 'pieces', byDate: true,  baseTier: 800 },
  flash:     { out: path.join(WEB_ROOT, 'public/images/flash'),   sub: 'flash',     dataFile: path.join(WEB_ROOT, 'src/data/flash.js'),  arrayName: 'flash',  byDate: false, baseTier: 600 },
}
const DEFAULT_BASE = '/Beansprout/masters'
const DEFAULT_CACHE = path.join(WEB_ROOT, '.dropbox-cache')
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'avif'])
// Recognised as images so we can say WHY they're skipped: the prebuilt sharp
// binary has no HEVC decoder (patents), so iPhone HEICs can't be processed.
const UNSUPPORTED_EXT = new Set(['heic', 'heif'])
const HEIC_HELP = 'HEIC isn\'t supported — export as JPG (iPhone: Settings → Camera → Formats → "Most Compatible", or share/export the photo as JPEG) and re-upload'

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

export function isImagePath(name) {
  const dot = String(name).lastIndexOf('.')
  return dot > 0 && IMAGE_EXT.has(name.slice(dot + 1).toLowerCase())
}

export function isUnsupportedImagePath(name) {
  const dot = String(name).lastIndexOf('.')
  return dot > 0 && UNSUPPORTED_EXT.has(name.slice(dot + 1).toLowerCase())
}

// Dropbox uses "" for the root, leading slash elsewhere, no trailing slash.
export function normaliseFolder(p) {
  if (!p || p === '/') return ''
  let s = p.startsWith('/') ? p : `/${p}`
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

// Dropbox-API-Arg is an HTTP header, and undici rejects values with chars >0xFF
// (and bytes 0x80–0xFF would go out as invalid UTF-8) — so a filename like
// "café.jpg" breaks the download. Dropbox's documented fix: escape non-ASCII as
// \uXXXX, which plain JSON.stringify does not do.
export function httpHeaderSafeJson(obj) {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`
async function safeText(res) { try { return await res.text() } catch { return '' } }

// ── Dropbox auth + client (HTTP API, no SDK → no extra dependency) ────────────

// Resolve a usable access token: a direct DROPBOX_ACCESS_TOKEN wins; otherwise
// exchange a refresh token (app secret → HTTP Basic; PKCE app with no secret →
// client_id in the body).
export async function resolveAccessToken(env = process.env, fetchImpl = globalThis.fetch) {
  if (env.DROPBOX_ACCESS_TOKEN) return env.DROPBOX_ACCESS_TOKEN.trim()
  const refresh = env.DROPBOX_REFRESH_TOKEN
  const key = env.DROPBOX_APP_KEY
  const secret = env.DROPBOX_APP_SECRET
  if (!refresh || !key) {
    throw new Error(
      'Dropbox credentials missing. Set DROPBOX_ACCESS_TOKEN, or ' +
      'DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY (+ DROPBOX_APP_SECRET). See docs/MEDIA.md.',
    )
  }
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh })
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (secret) headers.Authorization = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`
  else body.set('client_id', key)
  const res = await fetchImpl('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`Dropbox token refresh failed: ${res.status} ${await safeText(res)}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('Dropbox token refresh returned no access_token')
  return data.access_token
}

const delay = ms => new Promise(r => setTimeout(r, ms))

export function createDropboxClient({
  accessToken,
  fetchImpl = globalThis.fetch,
  rpcBase = 'https://api.dropboxapi.com',
  contentBase = 'https://content.dropboxapi.com',
  retries = 3,
  retryBaseMs = 1000,
  sleep = delay,
} = {}) {
  if (!accessToken) throw new Error('createDropboxClient: accessToken is required')
  const authHeader = { Authorization: `Bearer ${accessToken}` }

  // One transient 429/5xx (Dropbox rate-limits with a Retry-After it expects
  // clients to honour) must not abort a 50-download run — back off and retry.
  async function withRetry(attempt) {
    for (let tries = 0; ; tries++) {
      const res = await attempt()
      if (res.ok || (res.status !== 429 && res.status < 500) || tries >= retries) return res
      const after = Number(res.headers?.get?.('Retry-After'))
      await sleep(after > 0 ? after * 1000 : retryBaseMs * 2 ** tries)
    }
  }

  async function rpc(endpoint, payload) {
    const res = await withRetry(() => fetchImpl(`${rpcBase}/2/${endpoint}`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
    if (!res.ok) throw new Error(`Dropbox ${endpoint} failed: ${res.status} ${await safeText(res)}`)
    return res.json()
  }

  // List one folder (non-recursive), following the cursor until exhausted.
  async function listFolder(folderPath) {
    let data = await rpc('files/list_folder', { path: normaliseFolder(folderPath), recursive: false, limit: 2000 })
    let entries = data.entries
    while (data.has_more) {
      data = await rpc('files/list_folder/continue', { cursor: data.cursor })
      entries = entries.concat(data.entries)
    }
    return entries
  }

  // Download a file's bytes (content endpoint; args ride in the Dropbox-API-Arg header).
  async function download(filePath) {
    const res = await withRetry(() => fetchImpl(`${contentBase}/2/files/download`, {
      method: 'POST',
      headers: { ...authHeader, 'Dropbox-API-Arg': httpHeaderSafeJson({ path: filePath }) },
    }))
    if (!res.ok) throw new Error(`Dropbox download ${filePath} failed: ${res.status} ${await safeText(res)}`)
    return Buffer.from(await res.arrayBuffer())
  }

  return { listFolder, download }
}

// ── cache index (incremental: skip a re-download when the content hash matches) ──

function indexPath(cacheDir) { return path.join(cacheDir, 'index.json') }
async function readIndex(cacheDir) {
  try { return JSON.parse(await readFile(indexPath(cacheDir), 'utf8')) } catch { return {} }
}
async function writeIndex(cacheDir, index) {
  await mkdir(cacheDir, { recursive: true })
  await writeFile(indexPath(cacheDir), `${JSON.stringify(index, null, 2)}\n`)
}

// ── one lane: list → validate → download (cached) → process ──────────────────

// For the flash lane, masters live one level down in drop-N folders (the folder
// declares the piece's `drop` number). Returns [{ entry, drop }].
async function expandLaneEntries(client, lane, remote) {
  const top = await client.listFolder(remote)
  if (lane !== 'flash') return top.map(entry => ({ entry, drop: null }))
  const out = top.map(entry => ({ entry, drop: null }))
  for (const e of top) {
    const m = e['.tag'] === 'folder' && e.name.match(/^drop-(\d+)$/i)
    if (!m) continue
    const inner = await client.listFolder(`${normaliseFolder(remote)}/${e.name}`)
    out.push(...inner.map(entry => ({ entry, drop: Number(m[1]) })))
  }
  return out
}

// Returns { results, rejects }: per-master processing results (empty on
// --dry-run) and per-file rejections ({ name, reason }) — a bad filename never
// aborts the run, it's reported with the exact fix while the rest continues.
// `client` and `processFn` are injectable so this is unit-testable without real
// network/sharp; `existingIds` is the set of slugs/ids already in the data file
// (those masters refresh tiers without needing filename metadata).
export async function collectLane({
  lane, remote, client, cacheDir = DEFAULT_CACHE, outDir,
  force = false, dryRun = false, existingIds = new Set(),
  processFn, log = console.log,
}) {
  const laneDef = LANE_DEFAULTS[lane]
  if (!laneDef) throw new Error(`unknown lane: ${lane}`)
  const out = outDir || laneDef.out

  const all = await expandLaneEntries(client, lane, remote)
  const rejects = []
  const images = all
    .filter(({ entry }) => {
      if (entry['.tag'] !== 'file') return false
      if (isUnsupportedImagePath(entry.name)) {
        rejects.push({ name: entry.name, reason: `"${entry.name}": ${HEIC_HELP}` })
        return false
      }
      return isImagePath(entry.name)
    })
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name))
  if (!images.length && !rejects.length) { log(`  (no images in dropbox:${remote})`); return { results: [], rejects } }

  const laneCache = path.join(cacheDir, lane)
  if (!dryRun) await mkdir(laneCache, { recursive: true })
  const index = await readIndex(cacheDir)

  const claimed = new Map() // slug → source path, to catch collisions deterministically
  const jobs = []
  for (const { entry: e, drop } of images) {
    const ext = e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase()
    const slug = slugify(titleOf(e.name))
    if (!slug) {
      rejects.push({ name: e.name, reason: `"${e.name}": could not derive a slug — start the name with latin letters/numbers` })
      continue
    }
    if (claimed.has(slug)) {
      rejects.push({ name: e.name, reason: `"${e.name}": slug "${slug}" collides with ${claimed.get(slug)} — give one of them a different title` })
      continue
    }

    // New piece (no data entry yet) → the filename must carry valid metadata.
    // Existing piece → tiers refresh; filename metadata is unnecessary/ignored.
    const isNew = !existingIds.has(slug)
    let meta = null
    if (isNew) {
      const parsed = parseMasterName(lane, e.name, { drop })
      if (!parsed.ok) {
        rejects.push({ name: e.name, reason: parsed.reason })
        continue
      }
      meta = parsed.value
    }
    claimed.set(slug, e.path_display)

    const localPath = path.join(laneCache, `${slug}.${ext}`)
    const cached = index[e.path_lower]
    const fresh = !force && cached && cached.content_hash === e.content_hash && existsSync(localPath)

    if (dryRun) {
      log(`  ${fresh ? 'cached' : 'fetch '}  dropbox:${e.path_display}  →  ${lane}/${slug}.${ext}${isNew ? '  (new piece)' : ''}`)
    } else if (fresh) {
      log(`  cached  ${slug}.${ext}`)
    } else {
      const buf = await client.download(e.path_lower)
      await writeFile(localPath, buf)
      index[e.path_lower] = { name: `${slug}.${ext}`, content_hash: e.content_hash, rev: e.rev, size: e.size }
      // Persist incrementally so an abort mid-run doesn't forget what landed.
      await writeIndex(cacheDir, index)
      log(`  fetched ${slug}.${ext}  (${kb(buf.length)})`)
    }

    jobs.push({ src: localPath, name: slug, meta, isNew, sourceName: e.name })
  }

  if (dryRun) return { results: [], rejects }

  // Reuse the EXACT pipeline process-media.mjs uses (centre cover-crop, encode, report).
  const runOne = processFn || (await import('./process-media.mjs')).processOne
  await mkdir(out, { recursive: true })
  const results = []
  for (const job of jobs) {
    try {
      const r = await runOne({ src: job.src, name: job.name, lane, outDir: out, crop: true, sharpen: true })
      results.push({ ...r, meta: job.meta, isNew: job.isNew })
    } catch (err) {
      // e.g. the master is smaller than the largest tier — report, keep going.
      rejects.push({ name: job.sourceName, reason: `"${job.sourceName}": ${err.message}` })
    }
  }
  return { results, rejects }
}

// ── data-file writing + run summary ───────────────────────────────────────────

// Build the data-entry source lines for a lane's NEW pieces (w/h from the
// processed base tier — the value the renderer's aspect box needs).
export function entryLinesFor(lane, results) {
  const { baseTier } = LANE_DEFAULTS[lane]
  const format = lane === 'flash' ? formatFlashEntry : formatPieceEntry
  const lines = []
  for (const r of results) {
    if (!r.isNew || !r.meta) continue
    const base = r.rows.find(x => x.width === baseTier && x.ext === 'jpg')
    if (!base) continue
    lines.push(format(r.meta, { w: base.w, h: base.h }))
  }
  return lines
}

async function writeDataEntries(lane, lines, log = console.log) {
  if (!lines.length) return false
  const { dataFile, arrayName, byDate } = LANE_DEFAULTS[lane]
  const source = await readFile(dataFile, 'utf8')
  const next = insertEntryLines(source, lines, { arrayName, byDate })
  await writeFile(dataFile, next)
  log(`\n✎ wrote ${lines.length} new ${arrayName} entr${lines.length === 1 ? 'y' : 'ies'} to ${path.relative(process.cwd(), dataFile)}`)
  return true
}

// Markdown summary (the workflow's PR body / step summary). Plain strings in,
// fenced blocks out — no parsing of console output.
export function renderSummary(laneRuns) {
  const out = ['## Dropbox media sync']
  for (const { lane, results, rejects, entryLines, wrote } of laneRuns) {
    const fresh = results.filter(r => r.isNew)
    const refreshed = results.filter(r => !r.isNew)
    out.push(`\n### ${lane}`)
    if (!results.length && !rejects.length) { out.push('\nNothing to do — no masters found.'); continue }
    if (fresh.length) {
      out.push(`\n**New pieces (${fresh.length})** — ${wrote ? 'data entries written to the data file in this PR' : 'paste these entries into the data file'}:`)
      out.push(`\n\`\`\`js\n${entryLines.join('\n')}\n\`\`\``)
      const defaulted = fresh.filter(r => r.meta?.subjectDefaulted)
      if (defaulted.length) {
        out.push(`\n_Subject/alt-text defaulted from the title for: ${defaulted.map(r => r.name).join(', ')} — refine in this PR if needed._`)
      }
      const warned = fresh.flatMap(r => r.warnings || [])
      if (warned.length) out.push(`\n⚠ ${warned.join('\n⚠ ')}`)
    }
    if (refreshed.length) {
      out.push(`\n**Refreshed tiers (already in the data file):** ${refreshed.map(r => r.name).join(', ')}`)
    }
    if (rejects.length) {
      out.push(`\n**Rejected (${rejects.length}) — fix the filename in Dropbox and re-run:**`)
      out.push(rejects.map(r => `- ${r.reason}`).join('\n'))
    }
  }
  return `${out.join('\n')}\n`
}

// ── CLI ───────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { lane: null, all: false, remote: null, remoteBase: null, out: null, cache: null, dryRun: false, force: false, writeData: false, summary: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--lane': args.lane = argv[++i]; break
      case '--all': args.all = true; break
      case '--remote': args.remote = argv[++i]; break
      case '--remote-base': args.remoteBase = argv[++i]; break
      case '--out': args.out = argv[++i]; break
      case '--cache': args.cache = argv[++i]; break
      case '--dry-run': args.dryRun = true; break
      case '--force': args.force = true; break
      case '--write-data': args.writeData = true; break
      case '--summary': args.summary = argv[++i]; break
      default: throw new Error(`Unknown arg: ${a}`)
    }
  }
  return args
}

// The slugs/ids already present in a lane's data file — distinguishes a brand-new
// piece (metadata required) from a re-upload refreshing an existing one.
async function loadExistingIds(lane) {
  if (lane === 'flash') {
    const { flash } = await import('../src/data/flash.js')
    return new Set(flash.map(f => f.id))
  }
  const { pieces } = await import('../src/data/pieces.js')
  return new Set(pieces.map(p => p.slug))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const lanes = args.all ? ['portfolio', 'flash'] : [args.lane]
  if (!args.all && !LANE_DEFAULTS[args.lane]) {
    throw new Error('pass --lane portfolio|flash  (or --all)')
  }
  if (args.all && args.remote) {
    throw new Error('--remote targets a single lane; use --remote-base with --all')
  }
  if (args.all && args.out) {
    throw new Error('--out targets a single lane (the lanes have different output dirs)')
  }

  const cacheDir = args.cache || DEFAULT_CACHE
  const base = normaliseFolder(args.remoteBase || process.env.DROPBOX_MEDIA_PATH || DEFAULT_BASE)

  const accessToken = await resolveAccessToken(process.env)
  const client = createDropboxClient({ accessToken })
  const { printReport } = await import('./process-media.mjs')

  const laneRuns = []
  for (const lane of lanes) {
    const remote = args.remote || `${base}/${LANE_DEFAULTS[lane].sub}`
    const outDir = args.out || LANE_DEFAULTS[lane].out
    console.log(`\n── ${lane}  ⟵  dropbox:${remote}`)
    const existingIds = await loadExistingIds(lane)
    const { results, rejects } = await collectLane({
      lane, remote, client, cacheDir, outDir, existingIds,
      force: args.force, dryRun: args.dryRun,
    })
    if (results.length) printReport(results, lane, outDir)

    const entryLines = entryLinesFor(lane, results)
    let wrote = false
    if (entryLines.length && args.writeData) {
      wrote = await writeDataEntries(lane, entryLines)
    } else if (entryLines.length) {
      console.log(`\nNew ${lane} data entries (paste into ${path.relative(process.cwd(), LANE_DEFAULTS[lane].dataFile)}, or re-run with --write-data):`)
      entryLines.forEach(l => console.log(l))
    }
    if (rejects.length) {
      console.log(`\n✗ ${lane}: ${rejects.length} file(s) rejected — fix the name in Dropbox and re-run:`)
      rejects.forEach(r => console.log(`  - ${r.reason}`))
    }
    laneRuns.push({ lane, results, rejects, entryLines, wrote })
  }

  if (args.summary && !args.dryRun) {
    await writeFile(args.summary, renderSummary(laneRuns))
    console.log(`\nsummary → ${args.summary}`)
  }

  if (args.dryRun) {
    console.log('\n(dry run — nothing downloaded or written)')
  } else if (args.writeData) {
    console.log('\nDone. Review the tiers + data entries (npm test gates the tokens/order), then commit both.')
  } else {
    console.log('\nDone. Review the tiers, add the printed data entries, then commit the data + image files.')
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main().catch(err => { console.error('✗', err.message); process.exit(1) })
