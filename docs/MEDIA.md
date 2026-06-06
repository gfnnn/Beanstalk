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
| portfolio | `-400 / -800 / -1200` | 3:4 portrait, tattoo-aware (below) | `-800.jpg` | `apps/web/public/images/tattoos/` |
| flash | `-300 / -600 / -900` | 1:1 centre square | `-600.jpg` | `apps/web/public/images/flash/` |

each in **AVIF + WebP + JPG** (9 files/piece portfolio, 9 flash). The widths MUST
match the renderer srcset (`portfolio-tiles.js` / `flash-cards.js`) — change them
together. Every still is auto-rotated from EXIF, **stripped of metadata** (privacy:
removes GPS/camera), sharpened on downscale, and the script prints each output's
`w,h` + byte size to paste into the data file.

```bash
# one image
node apps/web/scripts/process-media.mjs --lane portfolio \
  --out apps/web/public/images/tattoos --src /path/master.jpg --name koi
# a batch (manifest = JSON array of { src, name, crop? })
node apps/web/scripts/process-media.mjs --lane portfolio \
  --out apps/web/public/images/tattoos --manifest batch.json
```

`--no-crop` downscales by width keeping the source aspect (no re-crop) — used for
**already-cropped exports**, e.g. the artist's original 28 portfolio webps that were
migrated to tiers without re-framing.

## The tattoo-aware crop (portfolio "smart" lane)

The portfolio masters are casual phone photos: the tattoo is a small part of a frame
full of skin and studio background, often off-centre. A plain centre/cover crop
leaves the ink tiny. `process-media.mjs` instead **finds the tattoo and crops to it**:

1. **Segment skin** (YCbCr + red-dominant), keep the **largest connected skin blob**
   (the limb) — this rejects skin-toned background (wood floors, other people).
2. **Hole-fill** the limb; the enclosed pixels that **deviate in colour from the
   limb's median skin tone** (dark lines OR colour) are the **ink**. *(Colour
   deviation, not edges: skin texture / hair / creases are all "edgy" but match the
   skin tone, so edge-based detection drifts — this was tried and abandoned.)*
3. Keep the **dominant connected ink blob(s)**, drop scattered noise, and **centre a
   3:4 box on their bbox**, sized to the tattoo (small pieces zoom in, big pieces
   aren't cropped in half). Weak/no signal → a centred fallback.

This nails ~27/30 of the current batch. It is genuinely hard to match a hand-crop on
every casual photo, so there's an escape hatch:

## Manual crop override

A manifest entry can carry **`crop: { cx, cy, h }`** (all normalised 0–1: focal
centre x/y + crop height as a fraction of the master) which **wins over
auto-detection**. Use it for the few pieces auto-detection mis-frames (small/sparse
fine-line, or a high-contrast background that fools the skin/ink split). The report
prints `crop=auto` / `crop=manual` per image.

**Current overrides** (eyeballed from the masters — recorded here because they live
in the processing driver, not the repo; only the output tiers are committed, exactly
as the original 28 hand-crops were):

| slug | crop | why |
|---|---|---|
| `jiji` | `{ cx: 0.40, cy: 0.59, h: 0.34 }` | tiny cat, sparse line |
| `fire-lizard` | `{ cx: 0.47, cy: 0.55, h: 0.36 }` | small, on shoulder |
| `lily-script` | `{ cx: 0.58, cy: 0.46, h: 0.58 }` | faint, centre on the lily |
| `folding-fan` | `{ cx: 0.43, cy: 0.43, h: 0.56 }` | landscape master; auto drifted up-right |
| `magnolia` | `{ cx: 0.64, cy: 0.60, h: 0.70 }` | striped shirt fooled the skin/ink split |

> **Reproducibility:** re-deriving the tiers needs the **masters** (a Dropbox export,
> kept off-repo) + these crop values. This is the same trade-off as the original 28
> (only their cropped exports were ever committed). If image management moves into the
> CMS, the plan is to lift `crop` into `pieces.js` so it's data-driven — see
> [`CMS.md`](./CMS.md) and [`ROADMAP.md`](./ROADMAP.md).

## Adding / re-cropping a portfolio piece

1. Process the master (auto, or with a `crop` override) → 9 tier files land in
   `public/images/tattoos/`.
2. Add/extend the `src/data/pieces.js` entry: `img` = the no-extension base path
   (`/images/tattoos/<slug>`), `w`/`h` from the script's printout (3:4 → 800×1067),
   plus `slug` (unique), `title`, `subject`, `styles[]`, `placement`, `date`, `tone`,
   `glyph`. Keep the array **newest-first by `date`** (a data-integrity test enforces
   it) and tokens valid (styles: `fine-line · black-grey · colour · dotwork ·
   cybersigilism · script` — real execution styles, not subjects).
3. `npm run build`, eyeball the portfolio, commit the data file + the tier files.

To **re-crop** an existing piece, re-run the processor with a new `crop` (or let auto
re-run) and re-commit just that slug's tiers — auto is deterministic, so untouched
pieces re-emit byte-identical.

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
