// Tests for scripts/sync-dropbox-media.mjs — the Dropbox collector that fetches
// tattoo masters and hands them to the process-media.mjs pipeline. The real fetch
// hits Dropbox (blocked by the web sandbox), so every test mocks the network and
// injects the processing fn, exercising the logic that otherwise breaks silently:
// auth resolution, list pagination, retry/backoff, the download contract (incl.
// the header-safe JSON encoding), slug derivation, the metadata gate (new piece
// needs a valid " -- " filename; existing piece doesn't), the content-hash cache,
// per-file rejection (a bad file never aborts the run), and --dry-run.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  slugify,
  isImagePath,
  isUnsupportedImagePath,
  normaliseFolder,
  httpHeaderSafeJson,
  parseArgs,
  resolveAccessToken,
  createDropboxClient,
  collectLane,
  entryLinesFor,
  renderSummary,
  LANE_DEFAULTS,
} from '../scripts/sync-dropbox-media.mjs'

// Minimal fetch Response stand-in.
const ok = (body, { headers } = {}) => ({
  ok: true,
  status: 200,
  headers: new Map(Object.entries(headers || {})),
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  arrayBuffer: async () => (body instanceof Uint8Array ? body.buffer : new TextEncoder().encode(String(body)).buffer),
})
const fail = (status, text = 'err', { headers } = {}) => ({
  ok: false, status, headers: new Map(Object.entries(headers || {})),
  json: async () => ({}), text: async () => text,
})

// A Dropbox file entry as list_folder returns it.
const entry = (name, over = {}) => ({
  '.tag': 'file',
  name,
  path_lower: `/beansprout/masters/portfolio/${name.toLowerCase()}`,
  path_display: `/Beansprout/masters/portfolio/${name}`,
  content_hash: `hash-${name}`,
  rev: 'r1',
  size: 4096,
  ...over,
})
const folder = name => ({ '.tag': 'folder', name })

// Valid new-piece names per the " -- " grammar (master-metadata.mjs).
const PIECE_A = 'Koi -- arm -- colour+realism -- 2025-09-11.jpg'            // slug koi
const PIECE_B = 'Lily Script -- leg -- fine-line -- 2025-03-11.png'         // slug lily-script
const FLASH_A = 'Luna moth -- 4in -- £220 -- forearm, spine -- black-grey.jpg' // slug luna-moth

describe('slugify', () => {
  it('lowercases, de-accents and hyphenates', () => {
    expect(slugify('Koi Sleeve')).toBe('koi-sleeve')
    expect(slugify('Café Société')).toBe('cafe-societe')
    expect(slugify('__Fire  Lizard!!')).toBe('fire-lizard')
    expect(slugify('lily_script-01')).toBe('lily-script-01')
  })
})

describe('isImagePath / isUnsupportedImagePath', () => {
  it('accepts processable image extensions only, and ignores dotfiles/extensionless', () => {
    for (const n of ['a.jpg', 'a.JPEG', 'b.png', 'c.webp', 'e.tiff']) expect(isImagePath(n)).toBe(true)
    for (const n of ['notes.txt', 'readme', '.hidden', 'no-ext.']) expect(isImagePath(n)).toBe(false)
  })

  it('flags HEIC/HEIF as unsupported (prebuilt sharp has no HEVC decoder)', () => {
    expect(isImagePath('d.HEIC')).toBe(false)
    expect(isUnsupportedImagePath('d.HEIC')).toBe(true)
    expect(isUnsupportedImagePath('d.heif')).toBe(true)
    expect(isUnsupportedImagePath('d.jpg')).toBe(false)
  })
})

describe('normaliseFolder', () => {
  it('maps root to "" and trims trailing slashes, adds leading slash', () => {
    expect(normaliseFolder('/')).toBe('')
    expect(normaliseFolder('')).toBe('')
    expect(normaliseFolder('foo')).toBe('/foo')
    expect(normaliseFolder('/foo/')).toBe('/foo')
    expect(normaliseFolder('/foo/bar/')).toBe('/foo/bar')
  })
})

describe('httpHeaderSafeJson', () => {
  it('escapes non-ASCII so the value is a legal HTTP header (Dropbox-API-Arg)', () => {
    // "café.jpg" → bare 0xE9 would be invalid UTF-8 on the wire; "桜" (>U+00FF)
    // would make undici throw client-side. Both must come out as \uXXXX.
    const out = httpHeaderSafeJson({ path: '/p/café 桜.jpg' })
    expect(out).toBe('{"path":"/p/caf\\u00e9 \\u685c.jpg"}')
    expect([...out].every(c => c.charCodeAt(0) < 127)).toBe(true)
    expect(JSON.parse(out).path).toBe('/p/café 桜.jpg')
  })
})

describe('parseArgs', () => {
  it('parses lanes, overrides and flags', () => {
    expect(parseArgs(['--lane', 'flash', '--dry-run', '--force'])).toMatchObject({ lane: 'flash', dryRun: true, force: true })
    expect(parseArgs(['--all', '--remote-base', '/M', '--cache', '/c'])).toMatchObject({ all: true, remoteBase: '/M', cache: '/c' })
    expect(parseArgs(['--write-data', '--summary', 's.md'])).toMatchObject({ writeData: true, summary: 's.md' })
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown arg/)
  })
})

describe('resolveAccessToken', () => {
  it('uses a direct access token verbatim (trimmed)', async () => {
    const fetchImpl = vi.fn()
    await expect(resolveAccessToken({ DROPBOX_ACCESS_TOKEN: '  tok-123 ' }, fetchImpl)).resolves.toBe('tok-123')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('exchanges a refresh token with HTTP Basic when a secret is set', async () => {
    const fetchImpl = vi.fn(async () => ok({ access_token: 'fresh' }))
    const env = { DROPBOX_REFRESH_TOKEN: 'rt', DROPBOX_APP_KEY: 'ak', DROPBOX_APP_SECRET: 'as' }
    await expect(resolveAccessToken(env, fetchImpl)).resolves.toBe('fresh')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.dropboxapi.com/oauth2/token')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('ak:as').toString('base64')}`)
    expect(init.body.get('grant_type')).toBe('refresh_token')
    expect(init.body.get('client_id')).toBeNull() // secret path → not in body
  })

  it('falls back to client_id in the body for a PKCE app (no secret)', async () => {
    const fetchImpl = vi.fn(async () => ok({ access_token: 'fresh' }))
    const env = { DROPBOX_REFRESH_TOKEN: 'rt', DROPBOX_APP_KEY: 'ak' }
    await resolveAccessToken(env, fetchImpl)
    const init = fetchImpl.mock.calls[0][1]
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.body.get('client_id')).toBe('ak')
  })

  it('throws a helpful error when nothing is configured', async () => {
    await expect(resolveAccessToken({}, vi.fn())).rejects.toThrow(/credentials missing/i)
  })

  it('throws when the refresh call fails', async () => {
    const fetchImpl = vi.fn(async () => fail(401, 'bad refresh'))
    await expect(resolveAccessToken({ DROPBOX_REFRESH_TOKEN: 'rt', DROPBOX_APP_KEY: 'ak' }, fetchImpl)).rejects.toThrow(/token refresh failed: 401/)
  })
})

describe('createDropboxClient', () => {
  it('requires a token', () => {
    expect(() => createDropboxClient({})).toThrow(/accessToken is required/)
  })

  it('lists a folder, following the cursor until has_more is false', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ entries: [entry('A.jpg')], has_more: true, cursor: 'c1' }))
      .mockResolvedValueOnce(ok({ entries: [entry('B.jpg')], has_more: false }))
    const client = createDropboxClient({ accessToken: 'tok', fetchImpl })
    const entries = await client.listFolder('/Beansprout/masters/portfolio')

    expect(entries.map(e => e.name)).toEqual(['A.jpg', 'B.jpg'])
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.dropboxapi.com/2/files/list_folder')
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.dropboxapi.com/2/files/list_folder/continue')
    // first call normalises the path and carries the bearer token
    const firstInit = fetchImpl.mock.calls[0][1]
    expect(firstInit.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(firstInit.body).path).toBe('/Beansprout/masters/portfolio')
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).cursor).toBe('c1')
  })

  it('downloads bytes via the content host with header-safe args in Dropbox-API-Arg', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const fetchImpl = vi.fn(async () => ok(bytes))
    const client = createDropboxClient({ accessToken: 'tok', fetchImpl })
    const buf = await client.download('/p/café.jpg')

    expect(Buffer.isBuffer(buf)).toBe(true)
    expect([...buf]).toEqual([1, 2, 3, 4])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://content.dropboxapi.com/2/files/download')
    const headerValue = init.headers['Dropbox-API-Arg']
    expect([...headerValue].every(c => c.charCodeAt(0) < 127)).toBe(true) // legal header
    expect(JSON.parse(headerValue).path).toBe('/p/café.jpg')
  })

  it('retries 429 honouring Retry-After, then succeeds', async () => {
    const sleep = vi.fn(async () => {})
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fail(429, 'rate limited', { headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(ok({ entries: [], has_more: false }))
    const client = createDropboxClient({ accessToken: 'tok', fetchImpl, sleep })
    await client.listFolder('/x')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('retries 5xx with exponential backoff, then gives up with the real error', async () => {
    const sleep = vi.fn(async () => {})
    const fetchImpl = vi.fn(async () => fail(503, 'down'))
    const client = createDropboxClient({ accessToken: 'tok', fetchImpl, sleep, retries: 2, retryBaseMs: 100 })
    await expect(client.listFolder('/x')).rejects.toThrow(/failed: 503/)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // initial + 2 retries
    expect(sleep.mock.calls.map(c => c[0])).toEqual([100, 200])
  })

  it('does not retry a 4xx like path/not_found', async () => {
    const fetchImpl = vi.fn(async () => fail(409, 'path/not_found'))
    const client = createDropboxClient({ accessToken: 'tok', fetchImpl, sleep: vi.fn() })
    await expect(client.listFolder('/missing')).rejects.toThrow(/files\/list_folder failed: 409/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('collectLane', () => {
  let cacheDir
  let outDir
  const dirs = []
  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), 'dbx-'))
    outDir = await mkdtemp(path.join(os.tmpdir(), 'dbx-'))
    dirs.push(cacheDir, outDir)
  })
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true })))
  })

  const fakeClient = (entries, download) => ({
    listFolder: vi.fn(async () => entries),
    download: download || vi.fn(async () => Buffer.from([0, 1, 2])),
  })
  const fakeProcess = () => vi.fn(async ({ name, lane, outDir: o }) => ({
    name, srcW: 1600, srcH: 2133, warnings: [],
    rows: [{ name, width: lane === 'flash' ? 600 : 800, ext: 'jpg', w: lane === 'flash' ? 600 : 800, h: lane === 'flash' ? 600 : 1067, bytes: 50000 }],
    _lane: lane, _out: o,
  }))

  it('downloads images, skips non-images, parses new-piece metadata, processes each', async () => {
    const client = fakeClient([entry(PIECE_A), entry('notes.txt', { name: 'notes.txt' }), entry(PIECE_B)])
    const processFn = fakeProcess()
    const { results, rejects } = await collectLane({
      lane: 'portfolio', remote: '/Beansprout/masters/portfolio', client,
      cacheDir, outDir, processFn, log: () => {},
    })

    // two images processed, the .txt ignored, nothing rejected
    expect(rejects).toEqual([])
    expect(client.download).toHaveBeenCalledTimes(2)
    expect(processFn).toHaveBeenCalledTimes(2)
    expect(results.map(r => r.name).sort()).toEqual(['koi', 'lily-script'])
    expect(results.every(r => r.isNew)).toBe(true)
    const koi = results.find(r => r.name === 'koi')
    expect(koi.meta).toMatchObject({ slug: 'koi', placement: 'arm', styles: ['colour', 'realism'], date: '2025-09-11' })

    // each job went through the portfolio lane into our out dir, with crop:true
    for (const call of processFn.mock.calls) {
      expect(call[0]).toMatchObject({ lane: 'portfolio', outDir, crop: true, sharpen: true })
    }

    // masters cached to disk + an index written
    expect(existsSync(path.join(cacheDir, 'portfolio', 'koi.jpg'))).toBe(true)
    const index = JSON.parse(await readFile(path.join(cacheDir, 'index.json'), 'utf8'))
    expect(index[`/beansprout/masters/portfolio/${PIECE_A.toLowerCase()}`].content_hash).toBe(`hash-${PIECE_A}`)
  })

  it('lets an EXISTING piece refresh tiers from a plain filename (no metadata needed)', async () => {
    const client = fakeClient([entry('Koi.jpg')])
    const processFn = fakeProcess()
    const { results, rejects } = await collectLane({
      lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn, log: () => {},
      existingIds: new Set(['koi']),
    })
    expect(rejects).toEqual([])
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ name: 'koi', isNew: false, meta: null })
  })

  it('rejects a NEW piece whose filename has no metadata, and keeps going', async () => {
    const client = fakeClient([entry('Mystery.jpg'), entry(PIECE_A)])
    const processFn = fakeProcess()
    const { results, rejects } = await collectLane({
      lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn, log: () => {},
    })
    expect(results.map(r => r.name)).toEqual(['koi'])
    expect(rejects).toHaveLength(1)
    expect(rejects[0].reason).toMatch(/Mystery\.jpg.*needs 3, 4, or 5/)
    expect(client.download).toHaveBeenCalledTimes(1) // the reject was never downloaded
  })

  it('rejects an unknown style/placement token exactly (no fuzzy matching)', async () => {
    const client = fakeClient([entry('Koi -- arm -- watercolour -- 2025-09-11.jpg')])
    const { results, rejects } = await collectLane({
      lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn: fakeProcess(), log: () => {},
    })
    expect(results).toEqual([])
    expect(rejects[0].reason).toMatch(/"watercolour" isn't a style/)
    expect(rejects[0].reason).toMatch(/fine-line/) // lists the valid vocabulary
  })

  it('rejects HEIC with iPhone guidance instead of crashing the run', async () => {
    const client = fakeClient([entry('Koi.heic', { name: 'Koi.heic' }), entry(PIECE_A)])
    const { results, rejects } = await collectLane({
      lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn: fakeProcess(), log: () => {},
    })
    expect(results.map(r => r.name)).toEqual(['koi'])
    expect(rejects[0].reason).toMatch(/HEIC isn't supported.*Most Compatible/)
  })

  it('rejects the second file of a slug collision and processes the first', async () => {
    const a = entry(PIECE_A)
    const b = entry(`zz ${PIECE_A}`, { name: PIECE_A.replace('Koi', 'Koi!'), path_lower: '/x/koi2.jpg' }) // "Koi!" → slug koi
    const { results, rejects } = await collectLane({
      lane: 'portfolio', remote: '/r', client: fakeClient([a, b]), cacheDir, outDir, processFn: fakeProcess(), log: () => {},
    })
    expect(results.map(r => r.name)).toEqual(['koi'])
    expect(rejects[0].reason).toMatch(/slug "koi" collides/)
  })

  it('turns a processing failure (e.g. master too small) into a reject, not an abort', async () => {
    const processFn = vi.fn()
      .mockRejectedValueOnce(new Error('koi: master is 1000×1334 — smaller than the largest portfolio tier'))
      .mockResolvedValueOnce({ name: 'lily-script', srcW: 1600, srcH: 2133, warnings: [], rows: [] })
    const { results, rejects } = await collectLane({
      lane: 'portfolio', remote: '/r', client: fakeClient([entry(PIECE_A), entry(PIECE_B)]),
      cacheDir, outDir, processFn, log: () => {},
    })
    expect(results.map(r => r.name)).toEqual(['lily-script'])
    expect(rejects[0].reason).toMatch(/smaller than the largest/)
  })

  it('skips the re-download when the cached content hash matches, but still re-processes', async () => {
    const entries = [entry(PIECE_A)]
    const client = fakeClient(entries)
    const processFn = fakeProcess()
    const opts = { lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn, log: () => {} }

    await collectLane(opts)
    expect(client.download).toHaveBeenCalledTimes(1)

    await collectLane(opts) // second run: same hash → no new download
    expect(client.download).toHaveBeenCalledTimes(1)
    expect(processFn).toHaveBeenCalledTimes(2)
  })

  it('re-downloads when the content hash changes', async () => {
    const client = fakeClient([entry(PIECE_A)])
    const opts = { lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn: fakeProcess(), log: () => {} }
    await collectLane(opts)
    // simulate an edited master in Dropbox
    client.listFolder = vi.fn(async () => [entry(PIECE_A, { content_hash: 'hash-changed' })])
    await collectLane(opts)
    expect(client.download).toHaveBeenCalledTimes(2)
  })

  it('--force re-downloads even on a hash match', async () => {
    const client = fakeClient([entry(PIECE_A)])
    const opts = { lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn: fakeProcess(), log: () => {} }
    await collectLane(opts)
    await collectLane({ ...opts, force: true })
    expect(client.download).toHaveBeenCalledTimes(2)
  })

  it('dry-run lists (and validates names) without downloading or processing', async () => {
    const client = fakeClient([entry(PIECE_A), entry('Mystery.jpg')])
    const processFn = fakeProcess()
    const { results, rejects } = await collectLane({ lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn, dryRun: true, log: () => {} })
    expect(results).toEqual([])
    expect(rejects).toHaveLength(1) // name validation still runs — the cheap check loop
    expect(client.download).not.toHaveBeenCalled()
    expect(processFn).not.toHaveBeenCalled()
    expect(existsSync(path.join(cacheDir, 'index.json'))).toBe(false)
  })

  it('flash lane: expands drop-N folders (folder = the declared drop number)', async () => {
    const inDrop = entry(FLASH_A, { path_lower: '/m/flash/drop-13/luna.jpg', path_display: '/m/flash/drop-13/Luna.jpg' })
    const looseNew = entry('Stray -- 3in -- £180 -- wrist -- fine-line.jpg', { path_lower: '/m/flash/stray.jpg' })
    const client = {
      listFolder: vi.fn(async p => (p.endsWith('/drop-13') ? [inDrop] : [folder('drop-13'), looseNew])),
      download: vi.fn(async () => Buffer.from([0, 1])),
    }
    const processFn = fakeProcess()
    const { results, rejects } = await collectLane({
      lane: 'flash', remote: '/m/flash', client, cacheDir, outDir, processFn, log: () => {},
    })
    // the drop-13 master parses with its folder's drop number…
    expect(results).toHaveLength(1)
    expect(results[0].meta).toMatchObject({ slug: 'luna-moth', drop: 13, price: 220, size: 4, status: 'available' })
    expect(results[0].meta.specs).toBe('4 inches · Forearm, spine · Black & grey')
    // …and a NEW flash master loose in the lane root is rejected (no drop declared)
    expect(rejects[0].reason).toMatch(/drop folder/)
  })

  it('rejects an unknown lane', async () => {
    await expect(collectLane({ lane: 'nope', remote: '/r', client: fakeClient([]), cacheDir, outDir, processFn: fakeProcess() }))
      .rejects.toThrow(/unknown lane/)
  })
})

describe('entryLinesFor + renderSummary', () => {
  const portfolioResult = {
    name: 'koi', isNew: true, warnings: [],
    meta: { slug: 'koi', title: 'Koi', subject: 'a koi carp', subjectDefaulted: false, styles: ['colour'], placement: 'arm', date: '2025-09-11', tone: 't-stone', glyph: 'sprig' },
    rows: [{ name: 'koi', width: 800, ext: 'jpg', w: 800, h: 1067, bytes: 1 }],
  }

  it('builds data-entry lines for new pieces only, from the base tier dims', () => {
    const lines = entryLinesFor('portfolio', [portfolioResult, { name: 'old', isNew: false, meta: null, rows: [] }])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("slug: 'koi'")
    expect(lines[0]).toContain('w: 800, h: 1067')
  })

  it('renders a markdown summary with new/refreshed/rejected sections', () => {
    const md = renderSummary([{
      lane: 'portfolio',
      results: [portfolioResult, { name: 'old', isNew: false, meta: null, rows: [], warnings: [] }],
      rejects: [{ name: 'x.heic', reason: '"x.heic": HEIC isn\'t supported' }],
      entryLines: entryLinesFor('portfolio', [portfolioResult]),
      wrote: true,
    }])
    expect(md).toContain('### portfolio')
    expect(md).toContain('**New pieces (1)**')
    expect(md).toContain("slug: 'koi'")
    expect(md).toContain('**Refreshed tiers (already in the data file):** old')
    expect(md).toContain('**Rejected (1) — fix the filename in Dropbox and re-run:**')
    expect(md).toContain('HEIC')
  })
})

describe('LANE_DEFAULTS', () => {
  it('maps lanes to the documented output dirs and data files', () => {
    expect(LANE_DEFAULTS.portfolio.out).toMatch(/public\/images\/tattoos$/)
    expect(LANE_DEFAULTS.flash.out).toMatch(/public\/images\/flash$/)
    expect(LANE_DEFAULTS.portfolio.dataFile).toMatch(/src\/data\/pieces\.js$/)
    expect(LANE_DEFAULTS.flash.dataFile).toMatch(/src\/data\/flash\.js$/)
  })
})
