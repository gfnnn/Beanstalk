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

Portfolio emits **AVIF + WebP + JPG** at every width (9 files/piece); flash emits
AVIF + WebP at every width but **JPG only at the -600 base** (7 files/piece — its
renderer never references the other JPGs). The widths MUST match the renderer
srcset (`portfolio-tiles.js` / `flash-cards.js`) — change them together (a
data-integrity test cross-checks every rendered image URL against the files on
disk, both directions). Every still is auto-rotated from EXIF, **stripped of
metadata** (privacy: removes GPS/camera), sharpened on downscale, and transparent
PNGs are flattened onto the palette background for the JPG tier. Encoding is
**deterministic** (the sharp thread pool is pinned), so re-processing an unchanged
master re-emits byte-identical files on any machine — no git churn.

> **Masters are pre-framed by the artist.** Every photo is edited and composed for
> the website *before* it reaches Dropbox — the artist's eye is the final framing
> step — so the pipeline does **no** automated subject detection or re-centring on
> the tattoo. The crop is a plain **centre cover-crop** to the lane aspect: it trims
> a master to 3:4 / 1:1 around the centre and never hunts for the ink.

**Export guidance (for the artist):**

- **Aspect + size.** Export portfolio shots at **3:4 portrait, ≥ 1200×1600 px**
  (1600×2133+ is ideal); flash at **1:1, ≥ 900×900** (1200×1200+ ideal). The
  pipeline **refuses to upscale** a smaller master (the tier would ship blurry) —
  it reports the needed size instead — and **warns when the aspect is off** (the
  centre crop would shave edges). `--allow-upscale` overrides the size guard for
  deliberate exceptions.
- **Spacing.** Keep the tattoo's full extent inside the **central ~75–80%** of the
  frame — roughly 10–15% clear margin each side, with a little extra at the
  **bottom on portfolio shots** (the tile's title overlay sits there). Centre the
  ink to taste within that safe area; the pipeline preserves the framing exactly.
- **Format: JPG (or PNG).** **Not HEIC** — the prebuilt encoder can't decode
  iPhone HEICs, so the sync rejects them with a pointer (iPhone: Settings →
  Camera → Formats → "Most Compatible", or share/export as JPEG).

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

## Metadata rides in the filename (the " -- " grammar)

The filter metadata (styles, placement, …) is the artist's call, never inferred
from the image — the same principle as the framing note above (an earlier
automated subject-detection crop was removed for exactly this reason: approximate
isn't acceptable). So a **new** piece declares its metadata **in the master's
filename**, segments separated by `" -- "`, and the sync validates every token
**exactly** against the canonical vocabulary in `src/data/taxonomy.js`:

```
portfolio/        Title -- placement -- style[+style…] -- YYYY-MM-DD [-- subject]
                  Peacock butterfly -- forearm -- colour+realism -- 2026-05-15.jpg

flash/drop-N/     Title -- <size>in -- £<price> -- <placement options> -- style
                  Luna moth -- 4in -- £220 -- forearm, spine -- black-grey.jpg
```

- **Validated exactly (the artist's facts):** placement + style tokens (unknown →
  the file is **rejected** with the valid list spelled out — no fuzzy matching),
  the date (drives the grid order), flash size/price (price also feeds the
  Worker's server-side price authority), and the flash **drop number — declared
  by the `drop-N` folder** the master sits in (a new flash master loose in
  `flash/` is rejected).
- **Defaulted (decorative/copy only, all reviewable in the PR):** `tone`/`glyph`
  (placeholder swatch, invisible once the photo is in), the flash `status`
  (`available`), and the portfolio `subject` (alt-text copy — defaults to the
  title; add the optional 5th segment to write it properly, e.g.
  `… -- 2026-05-15 -- a peacock butterfly and carnations.jpg`).
- **A rejected file never aborts the run** — the rest sync normally and every
  reject is listed (in the console / the workflow summary / the PR body) with the
  exact fix to make in Dropbox. `--dry-run` parses and validates names without
  touching anything — the cheap way to check a batch before syncing.
- The **title** becomes the slug/id (`"Peacock butterfly"` → `peacock-butterfly`)
  and must be unique; a master whose slug **already has a data entry** just
  refreshes its tiers (its filename needs no metadata; the data file is the
  source of truth once the entry exists — retune styles/copy there).

## Preparing masters in darktable

[darktable](https://www.darktable.org/) (free, all platforms) is the reference
tool for turning a camera shot into a compliant master. It does exactly the two
things the pipeline leaves to the artist — **framing to the lane aspect** and
**declaring the filename metadata** — and nothing else (no resize, no
format-fan-out; `process-media.mjs` owns those, so the export stays one big JPG).
Set it up once:

1. **Crop aspect (per lane).** In the **crop** module set **3:4 portrait** for
   portfolio (pick `4:3`, then the orientation toggle) and **square (1:1)** for
   flash. darktable remembers the last aspect, so you set it once per batch. Frame
   inside the safe area from the export guidance above (central ~75–80%, extra
   room at the bottom on portfolio for the title overlay) — the centre crop is
   exact, so what you frame is what ships.
2. **Put the grammar in the Title field, not the filename.** The clean way to emit
   a name matching the `" -- "` grammar above is to type it into darktable's
   **Title** metadata (lighttable → **metadata editor** module), e.g.
   `Koi -- forearm -- black-grey+realism -- 2026-06-11 -- a koi carp`. It rides in
   the photo's `.xmp` sidecar, doubles as a readable grid label, and keeps the
   grammar out of raw-file renaming. Use the canonical `taxonomy.js` spellings
   (tokens are validated exactly), join multiple styles with `+`, and write the
   flash price as a bare number (the `£` is optional — keeps the filename ASCII).
3. **Two export presets.** In the **export** module: **JPEG, quality ~95, full
   resolution** (leave the size unconstrained — do *not* shrink; the pipeline
   downscales and sharpens), **sRGB**, output sharpening **off** (the pipeline
   sharpens on downscale; doubling up crunches the tiers), and crucially
   **filename template `$(TITLE)`** so the export is named from step 2. Save two
   presets (export module → presets → *store new preset*):
   - **`Beansprout portfolio`** → output `…/Beansprout/masters/portfolio/`
   - **`Beansprout flash`** → output `…/Beansprout/masters/flash/drop-<N>/` — point
     it at the *current* drop's folder (the drop number is the folder, per the grammar).

**Per shoot:** import → (optionally apply a baseline edit *style*) → crop to the
lane aspect → set each **Title** to the grammar → export with the lane preset.
Then run the sync (`npm run media:dropbox -- --write-data`, or the *Run sync*
button); `--dry-run` first validates every name and reports the fix without
touching anything. Re-exporting an existing piece needs only its Title's first
segment (the slug) — the rest is ignored, it just refreshes the tiers.

> **Why the Title field?** darktable's export filename is one template for the
> whole batch, so it can't take a different literal name per image — but
> `$(TITLE)` resolves per image from metadata you *can* set individually. The
> Title field is how a single export run names each file differently and correctly.

## Collecting masters from Dropbox (automated)

The masters live off-repo in **Dropbox** (only the generated tiers are committed —
re-deriving them needs the masters, kept in Dropbox and fetched by this script).
**`apps/web/scripts/sync-dropbox-media.mjs`** (`npm run media:dropbox`) automates the
whole journey: it lists a Dropbox folder, downloads the masters (incrementally — it
skips anything whose content hash hasn't changed, retries transient 429/5xx with
backoff), **parses + validates each new master's filename metadata** (the grammar
above; invalid files are rejected and reported, never aborting the run), and runs
each one through **the exact same `process-media.mjs` pipeline** (centre cover-crop,
encode, report). With **`--write-data`** it also inserts the new pieces' complete
entries into `src/data/pieces.js` / `flash.js` (keeping pieces.js newest-first);
without it, it prints the ready-to-paste entry lines. `--summary <file>` writes a
markdown run summary (new / refreshed / rejected) — what the workflow uses as the
PR body. So the artist drops named, framed photos into Dropbox and one command (or
one button) turns them into a complete, test-gated commit.

It is **offline dev/CI tooling**, like `process-media.mjs` itself: the live static
site and the Worker never call Dropbox. You still review the result — `npm test`
gates the tokens/order/tier-files, and the photos get eyeballed on staging.

> **A Claude-web session can't run it.** The Dropbox API hosts
> (`api.dropboxapi.com` / `content.dropboxapi.com`) are blocked by the sandbox
> network allowlist (`Host not in allowlist`), the same limit as the Playwright CDN.
> Run it **locally or in CI**. The logic is unit-tested with the network mocked
> (`tests/sync-dropbox-media.test.js`), so that part still has a signal in the sandbox.

**Folder layout in Dropbox.** Under one base folder (default `/Beansprout/masters`,
override with `DROPBOX_MEDIA_PATH` or `--remote-base`), keep a subfolder per lane:

```
/Beansprout/masters/
  portfolio/   Koi -- forearm -- colour+realism -- 2025-09-11.jpg
                          → slug "koi" → public/images/tattoos/ + a pieces.js entry
  flash/
    drop-13/   Luna moth -- 4in -- £220 -- forearm, spine -- black-grey.jpg
                          → id "luna-moth", drop 13 → public/images/flash/ + a flash.js entry
```

The **title segment becomes the piece `slug`/`id`** (de-accented, lowercased,
hyphenated) — name deliberately; a collision (two files → the same slug) rejects the
second file. `.jpg/.jpeg/.png/.webp/.tif/.tiff/.avif` are picked up; `.heic/.heif`
are **rejected with guidance** (sharp's prebuilt binary can't decode HEVC); anything
else in the folder is ignored.

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
npm run media:dropbox -- --lane portfolio --write-data  # one lane, entries written for you
npm run media:dropbox -- --all --write-data             # both lanes
npm run media:dropbox -- --lane flash --dry-run         # validate names + preview the fetch, touch nothing
```

Downloads are cached under `apps/web/.dropbox-cache/` (gitignored) so re-runs only pull
changed masters; `--force` re-downloads everything.

**Or run it hosted — the "Run sync" button (no laptop needed).** The full journey runs
in GitHub Actions via **`.github/workflows/media-sync.yml`** (*Dropbox media sync*):
**Actions → Dropbox media sync → Run workflow**, pick a lane
(`all` / `portfolio` / `flash`) and optionally `dry_run` / `force`. It runs
`npm run media:dropbox -- --write-data`, regenerates the Worker's flash price authority
(`sync:prices`), runs the **full gate itself** — `npm test` + `npm run lint` +
`npm run build` — because a bot-opened PR triggers no CI of its own, then commits the
tiers **and** the data files and opens a PR against `develop` whose body is the run
summary (new pieces with their written entries, refreshed tiers, and any **rejected
filenames with the exact fix**). Nothing left to paste — review the diff, merge, check
the photos on staging. It's **`workflow_dispatch`-only** — a collaborator clicks the
button, never an automatic trigger — and it refuses to run while a previous sync PR is
still open (no duplicate-PR churn). One-time setup, in **repo → Settings → Secrets and
variables → Actions**, is the durable refresh-token flow above as secrets:
`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` (omit only for a PKCE app), `DROPBOX_REFRESH_TOKEN`,
plus the optional `DROPBOX_MEDIA_PATH` **variable** (defaults to `/Beansprout/masters`).

## The crop (centre cover-crop)

As the masters note above explains, framing is the artist's job, not the pipeline's: each
tier is a plain **centre cover-crop** to the lane aspect (portfolio 3:4, flash 1:1) — **no**
subject detection. So if a master isn't already close to that aspect, **re-frame it at source
before upload** rather than relying on the pipeline to find the subject — it won't.

## Adding / re-cropping a portfolio piece

The Dropbox sync does all of this from a named master (tiers + the data entry) —
the steps below are the same thing done by hand, for a one-off without Dropbox:

1. Process the master → 9 tier files land in `public/images/tattoos/`.
2. Add/extend the `src/data/pieces.js` entry: `img` = the no-extension base path
   (`/images/tattoos/<slug>`), `w`/`h` from the script's printout (3:4 → 800×1067),
   plus `slug` (unique), `title`, `subject`, `styles[]`, `placement`, `date`, `tone`,
   `glyph`. Keep the array **newest-first by `date`** (a data-integrity test enforces
   it) and tokens valid against **`src/data/taxonomy.js`** (the canonical style/
   placement vocabulary — real execution styles, not subjects). The same test suite
   verifies every referenced tier file exists on disk and that no tier file is
   orphaned, so a typo'd path can't ship a silent 404.
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

**A helper script automates this** — [`apps/web/scripts/process-video.mjs`](../apps/web/scripts/process-video.mjs)
takes a master clip and emits the WebM + MP4 + poster, cover-cropped to the slot aspect and
reported against the budget:
`node scripts/process-video.mjs --slot hero|about --src <master> --out public/videos
[--start <s> --duration <s> --crf <n>]` (CLI-only — needs `ffmpeg`/`ffprobe` on PATH; not an
`npm` script). The raw recipes below are the equivalent if you'd rather run ffmpeg by hand
(tune the bitrate to hit the budget):

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
