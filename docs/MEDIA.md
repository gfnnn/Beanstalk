# Media — getting tattoo photos & video onto the site

How real media moves from the artist's source files to the live site: where the
masters come from (the project Dropbox), how they're processed off-project into
web-ready derivatives, and how each lane is wired in. The site is **data-driven** —
you edit a data file and rebuild; you **never hand-edit the generated markup**.

Three lanes, each with its own data file, output folder, and renderer:

| Lane | Source of truth | Files go in | Renderer |
|---|---|---|---|
| **Portfolio stills** | `apps/web/src/data/pieces.js` | `apps/web/public/images/tattoos/` | `src/build/portfolio-tiles.js` (+ `piece-page.js`) |
| **Flash stills** | `apps/web/src/data/flash.js` | `apps/web/public/images/flash/` | `src/build/flash-cards.js` |
| **Hero video / GIF** | `apps/web/src/data/media.js` | `apps/web/public/videos/` | `src/build/media.js` |

Everything in `apps/web/public/` is copied **verbatim** to the site root by Vite, so
a file at `public/images/tattoos/koi-800.webp` is served at
`/images/tattoos/koi-800.webp` — no import, no path edits.

## Where the masters come from (source & ingest)

The finished JPGs (fresh tattoos) and MP4s (the artist tattooing) live in a
**project Dropbox shared folder** — *not* in any connected Google Drive (the Drive
connector points at a personal account and is out of scope; don't pull from it).

**Getting the masters to a place a session can read them is the one
environment-dependent step.** What works, and what doesn't:

- **A Claude Code *web* session cannot reach the Dropbox folder.** There is no
  Dropbox connector in the catalogue, and the web sandbox's network allowlist blocks
  `dropbox.com` / `dropboxusercontent.com` (`403 host_not_allowed`) — for both a raw
  `curl …&dl=1` download and the managed web-fetch. (Connectors bypass the allowlist;
  direct URL fetches don't.) A local desktop path like `X:\…` is likewise invisible
  to the cloud container.
- **So the *fetch* + the heavy video *encode* are done on a local machine** (no
  allowlist; the files are already there). A Dropbox folder downloads as one zip by
  swapping the share link's `dl=0` → `dl=1`:
  ```bash
  curl -L "https://www.dropbox.com/scl/fo/<id>/<rest>?rlkey=<key>&dl=1" -o media.zip
  ```
- **Everything downstream of the fetch is environment-agnostic** — processing,
  wiring the data files, `npm test` / `npm run build`. Only the source step changes if
  the masters ever become reachable another way (a connector, or adding the Dropbox
  hosts to the environment's network allowlist).

Unzip the masters to a **scratch dir outside the repo**. Don't commit raw camera
masters — only the web-export derivatives below get committed.

## Stills — portfolio & flash photos

### Processing convention (process off-project, commit only derivatives)

Both still lanes use the renderers' **responsive `<picture>`** form: the data file's
`img` is a **base path with no extension** (e.g. `/images/tattoos/koi`), and the
renderer builds a srcset of `-400`/`-800`/`-1200` widths in **AVIF + WebP + JPEG**
(`koi-400.avif`, `koi-800.webp`, `koi-1200.jpg`, …). The browser picks the smallest
format/size it can use, so phones never download a desktop-sized image. (An `img`
*with* an extension, e.g. `…/Koi.webp`, is served as-is with **no** srcset — the
legacy single-export form. Migrate these to the base-path form; see below.)

Derive those tiers with a committed, repeatable script rather than hand-exports, so
quality never drifts. **`apps/web/scripts/process-media.mjs` (to be added — uses
`sharp`, already in `node_modules`):**

- **Input:** a master JPG + its metadata (filename convention or a small sidecar).
- **For each master:** auto-rotate via EXIF → **strip all metadata** (perf + removes
  GPS/camera data) → sharpen on downscale → emit `-400/-800/-1200` in avif + webp +
  jpg. Portfolio = portrait fit (~700×930); **flash = centre-square 1:1 crop**.
- **Output:** files into `public/images/{tattoos,flash}/`, and it **prints each
  master's intrinsic `w,h` and the byte sizes** so you can paste `w,h` into the data
  file and confirm nothing busts a budget.

Rough quality targets: WebP q≈60–70, AVIF q≈45–50 (AVIF runs ≈30–50% smaller than
WebP at matched quality). Tune to keep tiles light.

### Metadata each still needs

Fill these in the data file when swapping a placeholder for a real photo. The
**alt text is auto-derived** — `"<style> tattoo of <subject> on <placement>"` — so
curate the fields accurately rather than writing alt by hand.

- **Portfolio** (`pieces.js`): `slug` (unique URL segment), `title`, `subject`,
  `styles[]`, `placement`, `date` (YYYY-MM-DD, drives ordering), `img` (base path),
  `w`, `h`. Adding a piece auto-adds `/portfolio/<slug>/` to the sitemap.
- **Flash** (`flash.js`): `img` (base path), `w`, `h` on the existing card record.

`styles` / `placement` tokens **must** match the filter chips / `<select>` options in
the page HTML and the label maps in the renderers — there are data-contract tests
that enforce this, so a mismatch fails `npm test`.

### Migrating the existing portfolio exports (one-off perf win)

The 28 current pieces ship as single `…/*.webp` exports (served as-is, desktop-sized
to every device). Re-process those masters through `process-media.mjs` into the
avif/webp/jpg ×3 tiers and switch each `pieces.js` `img` from `…/Koi.webp` to the
base-path `…/koi`. No new assets required; pure bytes-to-phones reduction.

### Performance checklist (stills)

- Always populate `w,h` → the aspect box is reserved, **no layout shift**.
- The first portfolio row renders **eager + `fetchpriority=high`** already (LCP) —
  keep those masters tight.
- EXIF stripped on every export (perf + privacy).

## Video / GIF heroes (homepage + About)

How the site serves the client's finished, edited clips for the two hero frames —
the **homepage hero** and the **About hero** (the portrait frame in the intro) —
and how to switch each one on when the files land. Both run through **one shared
component** ([`apps/web/src/build/media.js`](../apps/web/src/build/media.js)), so
they behave identically.

### Where the files live

Clips go in **`apps/web/public/videos/`**. That folder is part of Vite's
`public/` root, so **everything in it is copied verbatim to the site root**: a
file at `apps/web/public/videos/hero.mp4` is served at `/videos/hero.mp4`. No
import, no build step, no path edits.

### How the site serves a clip

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

### Expected files

| Slot (in `media.js`) | Files | Crop | Notes |
|---|---|---|---|
| `hero` (video)         | `hero.webm`, `hero.mp4`, `hero-poster.jpg` | 16:9 landscape | above the fold — keep it small |
| `aboutHero` (video)    | `about-portrait.webm`, `about-portrait.mp4`, `about-portrait-poster.jpg` | 4:5 portrait | |
| either, as a GIF       | `<name>.gif` (+ a `*-poster.jpg`) | — | only if a real GIF was supplied — see below |

Rename freely — the paths are just the `sources` / `gif` / `poster` values in
`media.js`. Keep the two columns in step.

### Encoding targets

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

### GIFs — prefer a muted video

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

### Large binaries in git

The site is static (GitHub Pages); these files ship from the repo. GitHub blocks
files **> 100 MB** and nags above 50 MB, so the budgets above matter. If a clip
can't be squeezed under a few MB, track binaries with **Git LFS**
(`git lfs track "apps/web/public/videos/*.mp4"` etc.) — the deploy workflow
checks out LFS objects (`lfs: true` in `.github/workflows/deploy-web.yml`). Don't
commit raw camera masters; commit only the web-export files listed above.
