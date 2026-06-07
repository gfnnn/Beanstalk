# Media — portfolio/flash images & hero video

Two media tracks share this doc: the **portfolio / flash stills** (the
`process-media.mjs` image pipeline, below) and the **hero video / GIF clips**
(from [Hero video / GIF serving](#hero-video--gif-serving) onward).

# Images (portfolio + flash stills)

Portfolio (`src/data/pieces.js`) and flash (`src/data/flash.js`) tiles render a
responsive `<picture>` from a **base path with no extension** (e.g.
`/images/tattoos/koi`); the renderers build the srcset from it. The build does
**not** generate those derivatives — **`apps/web/scripts/process-media.mjs`** (sharp)
does, offline, and you commit the output. One master photo →

| Lane | Tiers (widths) | Crop | `<img>` base tier | Files go in |
|---|---|---|---|---|
| portfolio | `-400 / -800 / -1200` | 3:4 portrait, centre cover-crop | `-800.jpg` | `apps/web/public/images/tattoos/` |
| flash | `-300 / -600 / -900` | 1:1 centre square | `-600.jpg` | `apps/web/public/images/flash/` |

each in **AVIF + WebP + JPG** (9 files/piece portfolio, 9 flash). The widths MUST
match the renderer srcset (`portfolio-tiles.js` / `flash-cards.js`) — change them
together. Every still is auto-rotated from EXIF, **stripped of metadata** (privacy:
removes GPS/camera), sharpened on downscale, and the script prints each output's
`w,h` + byte size to paste into the data file.

> **Masters are pre-framed by the artist.** Every photo is edited and composed for
> the website *before* it reaches Dropbox — the artist's eye is the final framing
> step — so the pipeline does **no** automated subject detection or re-centring on
> the tattoo. The crop is a plain **centre cover-crop** to the lane aspect: it trims
> a master to 3:4 / 1:1 around the centre and never hunts for the ink.

```bash
# one image
node apps/web/scripts/process-media.mjs --lane portfolio \
  --out apps/web/public/images/tattoos --src /path/master.jpg --name koi
# a batch (manifest = JSON array of { src, name })
node apps/web/scripts/process-media.mjs --lane portfolio \
  --out apps/web/public/images/tattoos --manifest batch.json
```

`--no-crop` downscales by width keeping the source aspect (no re-crop) — used for
**already-cropped exports** that are exactly the lane aspect and shouldn't be trimmed
again, e.g. the artist's original 28 portfolio webps that were migrated to tiers
without re-framing.

## Collecting masters from Dropbox (automated)

The masters live off-repo in **Dropbox** (only the generated tiers are committed —
re-deriving them needs the masters, kept in Dropbox and fetched by this script).
**`apps/web/scripts/sync-dropbox-media.mjs`** (`npm run media:dropbox`) automates the
*fetch* half of the workflow: it lists a Dropbox folder, downloads the masters
(incrementally — it skips anything whose content hash hasn't changed), and runs each
one through **the exact same `process-media.mjs` pipeline** (centre cover-crop,
encode, report). So the artist just drops new (already-framed) photos into the shared
Dropbox folder and a single command turns them into committable tiers.

It is **offline dev/CI tooling**, like `process-media.mjs` itself: the live static
site and the Worker never call Dropbox. You still review the emitted tiers, paste the
printed `w,h` into `src/data/{pieces,flash}.js`, and commit the data + image files.

> **A Claude-web session can't run it.** The Dropbox API hosts
> (`api.dropboxapi.com` / `content.dropboxapi.com`) are blocked by the sandbox
> network allowlist (`Host not in allowlist`), the same limit as the Playwright CDN.
> Run it **locally or in CI**. The logic is unit-tested with the network mocked
> (`tests/sync-dropbox-media.test.js`), so that part still has a signal in the sandbox.

**Folder layout in Dropbox.** Under one base folder (default `/Beansprout/masters`,
override with `DROPBOX_MEDIA_PATH` or `--remote-base`), keep a subfolder per lane:

```
/Beansprout/masters/
  portfolio/   Koi Sleeve.jpg     → slug "koi-sleeve"  → public/images/tattoos/
  flash/       Moth.jpg           → slug "moth"        → public/images/flash/
```

The **filename (minus extension) becomes the piece `slug`** (de-accented, lowercased,
hyphenated) — so name the files deliberately; a collision (two files → the same slug)
is a hard error. `.jpg/.jpeg/.png/.webp/.tif/.tiff/.heic/.heif/.avif` are picked up;
anything else in the folder is ignored.

**One-time Dropbox setup** (the artist or you, once):

1. Create a Dropbox app at <https://www.dropbox.com/developers/apps> — *Scoped access*,
   access type *App folder* (simplest; the app only sees its own folder) or *Full
   Dropbox* if the masters live elsewhere.
2. Under **Permissions**, enable `files.metadata.read` + `files.content.read`, then
   **Submit**.
3. Get a token. Quickest: the app console's **Generate access token** button → a
   short-lived token (~4h) → `DROPBOX_ACCESS_TOKEN`. For a durable setup, mint a
   **refresh token** once (authorize the app with `token_access_type=offline`, exchange
   the returned `code` at `oauth2/token`) and set `DROPBOX_REFRESH_TOKEN` +
   `DROPBOX_APP_KEY` (+ `DROPBOX_APP_SECRET` unless it's a PKCE app) — the script then
   gets a fresh access token on every run. All four go in `.env` (gitignored); the
   block is in [`.env.example`](../.env.example).

**Run it** (from the repo root so `.env` is picked up automatically):

```bash
npm run media:dropbox -- --lane portfolio      # one lane
npm run media:dropbox -- --all                 # both lanes
npm run media:dropbox -- --lane flash --dry-run # preview the fetch+slug mapping, touch nothing
```

Downloads are cached under `apps/web/.dropbox-cache/` (gitignored) so re-runs only pull
changed masters; `--force` re-downloads everything.

## The crop (centre cover-crop)

Masters are **pre-edited and framed by the artist before upload** — the artist's eye
is the final framing step, so the pipeline does **no** automated subject detection.
Each tier is a plain **centre cover-crop** to the lane aspect (portfolio 3:4, flash
1:1): sharp trims the master around its centre to the target aspect, then downscales.
Frame the shot the way it should appear on the site before dropping it in Dropbox.

> If a master isn't already close to the lane aspect, re-frame/crop it at source
> before upload rather than relying on the pipeline to find the subject — it won't.

## Adding / re-cropping a portfolio piece

1. Process the master → 9 tier files land in `public/images/tattoos/`.
2. Add/extend the `src/data/pieces.js` entry: `img` = the no-extension base path
   (`/images/tattoos/<slug>`), `w`/`h` from the script's printout (3:4 → 800×1067),
   plus `slug` (unique), `title`, `subject`, `styles[]`, `placement`, `date`, `tone`,
   `glyph`. Keep the array **newest-first by `date`** (a data-integrity test enforces
   it) and tokens valid (styles: `fine-line · black-grey · colour · dotwork ·
   cybersigilism · script` — real execution styles, not subjects).
3. `npm run build`, eyeball the portfolio, commit the data file + the tier files.

To **re-frame** an existing piece, re-edit the master, re-run the processor, and
re-commit just that slug's tiers — the crop is deterministic, so untouched pieces
re-emit byte-identical.

# Hero video / GIF serving

How the site serves the client's finished, edited clips for the two hero frames —
the **homepage hero** and the **About hero** (the portrait frame in the intro) —
and how to switch each one on when the files land. Both run through **one shared
component** ([`apps/web/src/build/media.js`](../apps/web/src/build/media.js)), so
they behave identically.

## Where the files live

Clips go in **`apps/web/public/videos/`**. That folder is part of Vite's
`public/` root, so **everything in it is copied verbatim to the site root**: a
file at `apps/web/public/videos/hero.mp4` is served at `/videos/hero.mp4`. No
import, no build step, no path edits.

## How the site serves a clip

1. **Export** the clip to the formats/sizes below and **name it** per the table.
2. **Drop the files** in `apps/web/public/videos/`.
3. **Switch it on** in [`apps/web/src/data/media.js`](../apps/web/src/data/media.js):
   set the slot's `show: true` (and adjust `kind` / paths / `alt` if needed).
4. **Rebuild** (`npm run build`). The marker on the page is replaced at build
   time by [`apps/web/src/build/media.js`](../apps/web/src/build/media.js) — you
   never hand-edit the `<video>`/`<img>`.

Until a slot is `show: true`, the page renders its existing placeholder, so the
site looks unchanged. Playback is progressive enhancement
([`apps/web/src/js/modules/media.js`](../apps/web/src/js/modules/media.js)): a
clip starts only when it scrolls into view **and** the visitor hasn't asked to
reduce motion; otherwise the **poster** still shows. So every video needs a poster.

## Expected files

| Slot (in `media.js`) | Files | Crop | Notes |
|---|---|---|---|
| `hero` (video)         | `hero.webm`, `hero.mp4`, `hero-poster.jpg` | 16:9 landscape | above the fold — keep it small |
| `aboutHero` (video)    | `about-portrait.webm`, `about-portrait.mp4`, `about-portrait-poster.jpg` | 4:5 portrait | |
| either, as a GIF       | `<name>.gif` (+ a `*-poster.jpg`) | — | only if a real GIF was supplied — see below |

Rename freely — the paths are just the `sources` / `gif` / `poster` values in
`media.js`. Keep the two columns in step.

## Encoding targets

- **Two video formats per clip:** **WebM** (VP9 or AV1) first, **MP4** (H.264,
  `yuv420p`, `+faststart`) as the fallback. The browser picks the first it can play.
- **Muted, seamless loop, last frame ≈ first frame.** No audio track.
- **Budget:** homepage hero **< 4 MB**, About hero **< 3 MB**. Trim duration (≈ 8–20 s),
  drop the framerate (24–30 fps), size to display (hero ≈ 1280×720, portrait
  ≈ 720×900 — 2× is plenty, the column is small).
- **Poster:** a JPG/WebP still (first frame), same aspect ratio.

Rough starting points (tune the bitrate to hit the budget):

```bash
# WebM (VP9)
ffmpeg -i master.mov -an -c:v libvpx-vp9 -b:v 0 -crf 33 -vf scale=1280:-2 hero.webm
# MP4 (H.264) fallback
ffmpeg -i master.mov -an -c:v libx264 -crf 24 -pix_fmt yuv420p -movflags +faststart -vf scale=1280:-2 hero.mp4
# Poster (first frame)
ffmpeg -i master.mov -frames:v 1 -q:v 3 hero-poster.jpg
```

## GIFs — prefer a muted video

A "GIF" of any length is **huge** (often 10× a comparable MP4) and can't be
paused for reduced-motion users. **If you can, re-encode the GIF to a muted
looping MP4/WebM and use `kind: 'video'`** — it looks the same and serves far
fewer bytes. Only use `kind: 'gif'` when a true animated image is required; give
it a `poster` so reduced-motion visitors get a still.

```bash
# GIF → muted looping MP4 (then list it under `sources`, kind:'video')
ffmpeg -i clip.gif -movflags +faststart -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" clip.mp4
```

## Large binaries in git

The site is static (GitHub Pages); these files ship from the repo. GitHub blocks
files **> 100 MB** and nags above 50 MB, so the budgets above matter. If a clip
can't be squeezed under a few MB, track binaries with **Git LFS**
(`git lfs track "apps/web/public/videos/*.mp4"` etc.) — the deploy workflow
checks out LFS objects (`lfs: true` in `.github/workflows/deploy-web.yml`). Don't
commit raw camera masters; commit only the web-export files listed above.
