// Tests for scripts/sync-dropbox-media.mjs — the Dropbox collector that fetches
// tattoo masters and hands them to the process-media.mjs pipeline. The real fetch
// hits Dropbox (blocked by the web sandbox), so every test mocks the network and
// injects the processing fn, exercising the logic that otherwise breaks silently:
// auth resolution, list pagination, the download contract, slug derivation, the
// content-hash cache (skip a re-download), collisions, and --dry-run.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  slugify,
  isImagePath,
  normaliseFolder,
  parseArgs,
  resolveAccessToken,
  createDropboxClient,
  collectLane,
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
const fail = (status, text = 'err') => ({ ok: false, status, json: async () => ({}), text: async () => text })

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'dbx-'))

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

describe('slugify', () => {
  it('lowercases, de-accents and hyphenates', () => {
    expect(slugify('Koi Sleeve')).toBe('koi-sleeve')
    expect(slugify('Café Société')).toBe('cafe-societe')
    expect(slugify('__Fire  Lizard!!')).toBe('fire-lizard')
    expect(slugify('lily_script-01')).toBe('lily-script-01')
  })
})

describe('isImagePath', () => {
  it('accepts image extensions only, and ignores dotfiles/extensionless', () => {
    for (const n of ['a.jpg', 'a.JPEG', 'b.png', 'c.webp', 'd.HEIC', 'e.tiff']) expect(isImagePath(n)).toBe(true)
    for (const n of ['notes.txt', 'readme', '.hidden', 'no-ext.']) expect(isImagePath(n)).toBe(false)
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

describe('parseArgs', () => {
  it('parses lanes, overrides and flags', () => {
    expect(parseArgs(['--lane', 'flash', '--dry-run', '--force'])).toMatchObject({ lane: 'flash', dryRun: true, force: true })
    expect(parseArgs(['--all', '--remote-base', '/M', '--cache', '/c'])).toMatchObject({ all: true, remoteBase: '/M', cache: '/c' })
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

  it('downloads bytes via the content host with args in the Dropbox-API-Arg header', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const fetchImpl = vi.fn(async () => ok(bytes))
    const client = createDropboxClient({ accessToken: 'tok', fetchImpl })
    const buf = await client.download('/p/koi.jpg')

    expect(Buffer.isBuffer(buf)).toBe(true)
    expect([...buf]).toEqual([1, 2, 3, 4])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://content.dropboxapi.com/2/files/download')
    expect(JSON.parse(init.headers['Dropbox-API-Arg']).path).toBe('/p/koi.jpg')
  })

  it('throws on a non-ok RPC', async () => {
    const fetchImpl = vi.fn(async () => fail(409, 'path/not_found'))
    const client = createDropboxClient({ accessToken: 'tok', fetchImpl })
    await expect(client.listFolder('/missing')).rejects.toThrow(/files\/list_folder failed: 409/)
  })
})

describe('collectLane', () => {
  let cacheDir
  let outDir
  beforeEach(async () => { cacheDir = await tmp(); outDir = await tmp() })

  const fakeClient = (entries, download) => ({
    listFolder: vi.fn(async () => entries),
    download: download || vi.fn(async () => Buffer.from([0, 1, 2])),
  })
  const fakeProcess = () => vi.fn(async ({ name, lane, outDir: o }) => ({
    name, srcW: 1200, srcH: 1600, rows: [{ name, width: 800, ext: 'jpg', w: 800, h: 1067, bytes: 50000 }], _lane: lane, _out: o,
  }))

  it('downloads images, skips non-images, and processes each through the lane pipeline', async () => {
    const client = fakeClient([entry('Koi.jpg'), entry('notes.txt', { name: 'notes.txt' }), entry('Lily Script.png')])
    const processFn = fakeProcess()
    const results = await collectLane({
      lane: 'portfolio', remote: '/Beansprout/masters/portfolio', client,
      cacheDir, outDir, processFn, log: () => {},
    })

    // two images processed, the .txt ignored
    expect(client.download).toHaveBeenCalledTimes(2)
    expect(processFn).toHaveBeenCalledTimes(2)
    expect(results.map(r => r.name).sort()).toEqual(['koi', 'lily-script'])

    // each job went through the portfolio lane into our out dir, with crop:true
    for (const call of processFn.mock.calls) {
      expect(call[0]).toMatchObject({ lane: 'portfolio', outDir, crop: true, sharpen: true })
    }

    // masters cached to disk + an index written
    expect(existsSync(path.join(cacheDir, 'portfolio', 'koi.jpg'))).toBe(true)
    const index = JSON.parse(await readFile(path.join(cacheDir, 'index.json'), 'utf8'))
    expect(index['/beansprout/masters/portfolio/koi.jpg'].content_hash).toBe('hash-Koi.jpg')
  })

  it('skips the re-download when the cached content hash matches, but still re-processes', async () => {
    const entries = [entry('Koi.jpg')]
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
    const client = fakeClient([entry('Koi.jpg')])
    const opts = { lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn: fakeProcess(), log: () => {} }
    await collectLane(opts)
    // simulate an edited master in Dropbox
    client.listFolder = vi.fn(async () => [entry('Koi.jpg', { content_hash: 'hash-changed' })])
    await collectLane(opts)
    expect(client.download).toHaveBeenCalledTimes(2)
  })

  it('--force re-downloads even on a hash match', async () => {
    const client = fakeClient([entry('Koi.jpg')])
    const opts = { lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn: fakeProcess(), log: () => {} }
    await collectLane(opts)
    await collectLane({ ...opts, force: true })
    expect(client.download).toHaveBeenCalledTimes(2)
  })

  it('dry-run lists without downloading or processing', async () => {
    const client = fakeClient([entry('Koi.jpg'), entry('Lily.png')])
    const processFn = fakeProcess()
    const results = await collectLane({ lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn, dryRun: true, log: () => {} })
    expect(results).toEqual([])
    expect(client.download).not.toHaveBeenCalled()
    expect(processFn).not.toHaveBeenCalled()
    expect(existsSync(path.join(cacheDir, 'index.json'))).toBe(false)
  })

  it('throws on a slug collision', async () => {
    // "Koi.jpg" and "koi.JPG" both slugify to "koi"
    const client = fakeClient([entry('Koi.jpg'), entry('koi.JPG', { path_lower: '/beansprout/masters/portfolio/koi2.jpg' })])
    await expect(collectLane({ lane: 'portfolio', remote: '/r', client, cacheDir, outDir, processFn: fakeProcess(), log: () => {} }))
      .rejects.toThrow(/slug collision: "koi"/)
  })

  it('rejects an unknown lane', async () => {
    await expect(collectLane({ lane: 'nope', remote: '/r', client: fakeClient([]), cacheDir, outDir, processFn: fakeProcess() }))
      .rejects.toThrow(/unknown lane/)
  })
})

describe('LANE_DEFAULTS', () => {
  it('maps lanes to the documented output dirs', () => {
    expect(LANE_DEFAULTS.portfolio.out).toMatch(/public\/images\/tattoos$/)
    expect(LANE_DEFAULTS.flash.out).toMatch(/public\/images\/flash$/)
  })
})
