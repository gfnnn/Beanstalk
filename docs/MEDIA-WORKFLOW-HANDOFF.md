# Handoff — Dropbox tattoo media workflow (pick up LOCALLY)

> Parked from a Claude Code **web** session. This note exists because that session
> is an ephemeral cloud container that **cannot** reach the source files. Finish on
> your **desktop PC**, where the assets already are. Delete this file once the work
> lands.

## Why this was parked (the blockers, so we don't re-litigate them)

- **The media source is a Dropbox shared folder**, not the connected Google Drive.
  The Drive connector is a personal account and is **out of scope** — don't use it.
- **No Dropbox connector exists** in the Claude connector catalogue, so there's no
  MCP route to the folder.
- **The web sandbox's network allowlist blocks Dropbox.** Both `curl …&dl=1` and the
  managed web-fetch return `403 host_not_allowed` for `dropbox.com` /
  `dropboxusercontent.com`. (Connectors bypass the allowlist; raw URL fetches don't.)
- The masters were exported to a **local desktop path (`X:\beanstalk`)**, which the
  cloud container obviously can't see.
- Net: the *fetch* step must happen where the files are — **locally**. Everything
  downstream (process → wire → test → PR) is environment-agnostic.

Dropbox source link (folder): JPGs of fresh tattoos + MP4s of Roxy tattooing
`https://www.dropbox.com/scl/fo/oq5ye8q23qc6qrwydwava/ADYRzV43YXiSHxLt-Z8cNDU?rlkey=5ottxhvze6wo314k7ek7kl1bu&st=dzibehgk&dl=0`
(local download as one zip: swap `dl=0` → `dl=1`.)

## The plan (what to actually do, locally)

The repo is already data-driven for media — **never hand-edit generated markup**, edit
the data file and rebuild. Three lanes:

| Lane | Data (source of truth) | Files go in | Renderer expects |
|---|---|---|---|
| Portfolio stills | `apps/web/src/data/pieces.js` | `apps/web/public/images/tattoos/` | base path **no extension** → `<picture>` srcset `-400/-800/-1200.{avif,webp,jpg}` (700×930-ish portrait) |
| Flash stills | `apps/web/src/data/flash.js` | `apps/web/public/images/flash/` *(create it)* | base path no extension → avif/webp/jpg, **square 1:1** crop |
| Hero video ("Roxy tattooing") | `apps/web/src/data/media.js` | `apps/web/public/videos/` | WebM(VP9/AV1) + MP4(H.264, yuv420p, +faststart) + JPG poster; budgets <4 MB (home) / <3 MB (about); **Git LFS** for the binaries |

Per-piece metadata required by the renderers: `slug, title, subject, styles[],
placement, date, w, h` (+ `img`). Alt text is **auto-derived**
(`"<style> tattoo of <subject> on <placement>"`), so curate those fields accurately.
Style/placement tokens MUST match the filter chips / `<select>` options — there are
data-contract tests that enforce this (`npm test`).

### Steps
1. **Foundation (no assets needed, do first):**
   - Add `apps/web/scripts/process-media.mjs` using **`sharp`** (already in
     `node_modules`): auto-rotate via EXIF, **strip metadata** (privacy/perf), sharpen
     on downscale, emit `-400/-800/-1200` in **avif + webp + jpg**; portfolio = fit
     portrait, flash = centre-square 1:1; **print each output's `w,h` + byte sizes** to
     paste into the data files.
   - Add an ffmpeg helper for the hero clips (recipe lives in `docs/MEDIA.md`):
     trim ~8–20 s seamless loop, mute, WebM + MP4 + poster, hit budget.
   - `mkdir apps/web/public/images/flash`.
2. **Migrate existing portfolio to responsive tiers (pure perf win, no new assets):**
   re-process the 28 current single `.webp` exports in
   `apps/web/public/images/tattoos/` → avif/webp/jpg ×3 sizes, and switch the
   `pieces.js` `img` values from `…/Koi.webp` (served as-is) to the base-path form
   `…/koi`. This stops shipping a desktop-sized image to phones.
3. **Process the real Dropbox batches:** unzip the masters → run `process-media.mjs`
   for stills, ffmpeg helper for the two Roxy hero clips → derivatives into `public/…`.
4. **Wire it up:** add/extend `pieces.js` + `flash.js` entries; flip `media.js`
   `hero`/`aboutHero` slots to `show:true`. (Portfolio slugs auto-add to the sitemap.)
5. **Verify + ship:** `npm test` (data-contract + render), `npm run build`, eyeball the
   built `dist/`, and locally `cd apps/web && npx playwright install chromium &&
   npm run test:e2e` for the browser-only paths (lightbox etc.). Then PR → `develop`.

### Performance notes
- AVIF first (≈30–50% smaller than webp); renderer already emits it — we just need the
  `.avif` tier to actually exist.
- Always populate `w,h` → no layout shift. First portfolio row is eager +
  `fetchpriority=high` already.
- Video: `preload=none`, poster is the LCP, plays only in-view + motion-allowed
  (already built). Keep under budget; LFS the binaries (deploy workflow has `lfs:true`).
- Strip EXIF on every still (perf + removes GPS/camera metadata).

## Deploy guardrail (unchanged)
Do NOT add `apps/web/public/CNAME` / point the apex at v2. This stays a staging-only
publish until copy + real images are finalised (`docs/ROADMAP.md` → go-live plan).
