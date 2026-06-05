# Media (video / GIF) serving

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
