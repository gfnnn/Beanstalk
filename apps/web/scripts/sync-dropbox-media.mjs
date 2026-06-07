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
//        /<base>/flash/*.jpg                                (1:1 square tiers)
//                                                           ──▶ public/images/…
//
// It is OFFLINE dev/CI tooling, exactly like process-media.mjs: the live static
// site never calls Dropbox — you review the emitted tiers, paste the printed w/h
// into src/data/{pieces,flash}.js, and commit the data + image files. The Dropbox
// API hosts are blocked by the Claude-web sandbox allowlist, so run this LOCALLY
// (or in CI), not from a web session.
//
// Auth (env — see .env.example / docs/MEDIA.md):
//   • Quick:    DROPBOX_ACCESS_TOKEN              (a short-lived token, ~4h)
//   • Durable:  DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY [+ DROPBOX_APP_SECRET]
//               (refresh-token flow → fresh access token each run)
//   • Folder:   DROPBOX_MEDIA_PATH                (base folder, default below)
//
// Usage (from the repo root so --env-file-if-exists picks up .env, or export vars):
//   node --env-file-if-exists=.env apps/web/scripts/sync-dropbox-media.mjs --lane portfolio
//   node --env-file-if-exists=.env apps/web/scripts/sync-dropbox-media.mjs --all
//   npm run media:dropbox -- --lane flash            # same, via the root script
//
// Flags
//   --lane portfolio|flash   process one lane (from <base>/<lane> in Dropbox)
//   --all                    process both lanes
//   --remote <path>          override the Dropbox folder for a single --lane
//   --remote-base <path>     override the base folder (lanes are subfolders of it)
//   --out <dir>              override the output dir (defaults per lane, below)
//   --cache <dir>            local staging dir for downloads (default below)
//   --dry-run                list what WOULD be fetched/processed; touch nothing
//   --force                  re-download even when the cached content hash matches
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') // apps/web

// Per-lane defaults: where tiers land (mirrors process-media.mjs / MEDIA.md) and the
// Dropbox subfolder under the base path.
export const LANE_DEFAULTS = {
  portfolio: { out: path.join(WEB_ROOT, 'public/images/tattoos'), sub: 'portfolio' },
  flash:     { out: path.join(WEB_ROOT, 'public/images/flash'),   sub: 'flash' },
}
const DEFAULT_BASE = '/Beansprout/masters'
const DEFAULT_CACHE = path.join(WEB_ROOT, '.dropbox-cache')
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif', 'avif'])

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

// Filename → URL-safe slug (the piece's `slug`, the output basename). Mirrors the
// existing slugs (e.g. "Koi Sleeve.JPG" → "koi-sleeve"). De-accents, lowercases,
// collapses non-alphanumerics to single hyphens.
export function slugify(name) {
  return String(name)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isImagePath(name) {
  const dot = String(name).lastIndexOf('.')
  return dot > 0 && IMAGE_EXT.has(name.slice(dot + 1).toLowerCase())
}

// Dropbox uses "" for the root, leading slash elsewhere, no trailing slash.
export function normaliseFolder(p) {
  if (!p || p === '/') return ''
  let s = p.startsWith('/') ? p : `/${p}`
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
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

export function createDropboxClient({
  accessToken,
  fetchImpl = globalThis.fetch,
  rpcBase = 'https://api.dropboxapi.com',
  contentBase = 'https://content.dropboxapi.com',
} = {}) {
  if (!accessToken) throw new Error('createDropboxClient: accessToken is required')
  const authHeader = { Authorization: `Bearer ${accessToken}` }

  async function rpc(endpoint, payload) {
    const res = await fetchImpl(`${rpcBase}/2/${endpoint}`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
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
    const res = await fetchImpl(`${contentBase}/2/files/download`, {
      method: 'POST',
      headers: { ...authHeader, 'Dropbox-API-Arg': JSON.stringify({ path: filePath }) },
    })
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

// ── one lane: list → download (cached) → process ──────────────────────────────

// Returns the per-master processing results (empty on --dry-run). `client` and
// `processFn` are injectable so this is unit-testable without real network/sharp.
export async function collectLane({
  lane, remote, client, cacheDir = DEFAULT_CACHE, outDir,
  force = false, dryRun = false,
  processFn, log = console.log,
}) {
  const laneDef = LANE_DEFAULTS[lane]
  if (!laneDef) throw new Error(`unknown lane: ${lane}`)
  const out = outDir || laneDef.out

  const entries = await client.listFolder(remote)
  const images = entries
    .filter(e => e['.tag'] === 'file' && isImagePath(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (!images.length) { log(`  (no images in dropbox:${remote})`); return [] }

  const laneCache = path.join(cacheDir, lane)
  if (!dryRun) await mkdir(laneCache, { recursive: true })
  const index = await readIndex(cacheDir)

  const claimed = new Map() // slug → source path, to catch collisions deterministically
  const jobs = []
  for (const e of images) {
    const ext = e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase()
    const slug = slugify(e.name.slice(0, e.name.lastIndexOf('.')))
    if (!slug) throw new Error(`could not derive a slug from "${e.name}"`)
    if (claimed.has(slug)) {
      throw new Error(`slug collision: "${slug}" from both ${claimed.get(slug)} and ${e.path_display}`)
    }
    claimed.set(slug, e.path_display)

    const localPath = path.join(laneCache, `${slug}.${ext}`)
    const cached = index[e.path_lower]
    const fresh = !force && cached && cached.content_hash === e.content_hash && existsSync(localPath)

    if (dryRun) {
      log(`  ${fresh ? 'cached' : 'fetch '}  dropbox:${e.path_display}  →  ${lane}/${slug}.${ext}`)
    } else if (fresh) {
      log(`  cached  ${slug}.${ext}`)
    } else {
      const buf = await client.download(e.path_lower)
      await writeFile(localPath, buf)
      index[e.path_lower] = { name: `${slug}.${ext}`, content_hash: e.content_hash, rev: e.rev, size: e.size }
      log(`  fetched ${slug}.${ext}  (${kb(buf.length)})`)
    }

    jobs.push({ src: localPath, name: slug })
  }

  if (dryRun) return []
  await writeIndex(cacheDir, index)

  // Reuse the EXACT pipeline process-media.mjs uses (centre cover-crop, encode, report).
  const runOne = processFn || (await import('./process-media.mjs')).processOne
  await mkdir(out, { recursive: true })
  const results = []
  for (const job of jobs) {
    results.push(await runOne({ src: job.src, name: job.name, lane, outDir: out, crop: true, sharpen: true }))
  }
  return results
}

// ── CLI ───────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { lane: null, all: false, remote: null, remoteBase: null, out: null, cache: null, dryRun: false, force: false }
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
      default: throw new Error(`Unknown arg: ${a}`)
    }
  }
  return args
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

  const cacheDir = args.cache || DEFAULT_CACHE
  const base = normaliseFolder(args.remoteBase || process.env.DROPBOX_MEDIA_PATH || DEFAULT_BASE)

  const accessToken = await resolveAccessToken(process.env)
  const client = createDropboxClient({ accessToken })
  const { printReport } = await import('./process-media.mjs')

  for (const lane of lanes) {
    const remote = args.remote || `${base}/${LANE_DEFAULTS[lane].sub}`
    const outDir = args.out || LANE_DEFAULTS[lane].out
    console.log(`\n── ${lane}  ⟵  dropbox:${remote}`)
    const results = await collectLane({ lane, remote, client, cacheDir, outDir, force: args.force, dryRun: args.dryRun })
    if (results.length) printReport(results, lane, outDir)
  }

  if (args.dryRun) {
    console.log('\n(dry run — nothing downloaded or written)')
  } else {
    console.log('Done. Review the tiers, paste the printed w/h into src/data/{pieces,flash}.js, then commit the data + image files.')
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main().catch(err => { console.error('✗', err.message); process.exit(1) })
