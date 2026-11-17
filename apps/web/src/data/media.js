// ─────────────────────────────────────────────────────────────────────────────
// MEDIA (video / GIF clips) — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// The client is supplying finished, edited clips (short looping video, or GIFs)
// for the two HERO frames — the homepage hero and the About page hero. Both run
// through ONE shared component (renderHeroMedia in src/build/media.js), so they
// behave identically; this file is just where each clip is turned ON and pointed
// at its files. The markup is generated at BUILD TIME (wired through
// vite.config.js), exactly like homepage.js / pieces.js. Edit the values here;
// never hand-edit the generated <video>/<img> in the page HTML.
//
// HOW THE SITE SERVES THESE  (full guide: docs/MEDIA.md)
//   • Drop the exported files into apps/web/public/videos/ — Vite copies that
//     folder verbatim to the site root, so a file at public/videos/hero.mp4 is
//     served at /videos/hero.mp4. No import, no build step, no path edits.
//   • Then flip the slot's `show: true` here and rebuild. Until then each slot
//     renders its existing placeholder, so the pages look identical to now.
//
// EACH SLOT
//   show     false → keep the placeholder, true → render the real clip
//   kind     'video' → a muted looping <video> (preferred — far smaller files)
//            'gif'   → an animated <img> (use only if a true GIF was supplied;
//                      a re-encoded muted MP4/WebM is ~10× smaller — see README)
//            'image' → a still photo, no clip needed. Set `img` to a portfolio
//                      photo's base path (no size/extension, as in pieces.js),
//                      `w`/`h` to its dimensions, and `sizes` to the frame width.
//                      This is what the site launches with; to move to a clip
//                      later, change `kind` back and fill in poster/sources.
//   alt      accessible description of the clip (it's decorative motion, but
//            screen readers still announce the frame)                    (COPY)
//   poster   a still frame shown before/instead of playback — REQUIRED for
//            `video` (it's the LCP image and the reduced-motion fallback) and
//            used as the still swap for a `gif` under reduced-motion       (path)
//   sources  for `kind:'video'` — ordered best-first; the browser picks the
//            first type it can play. WebM (VP9/AV1) first, MP4 (H.264) fallback.
//   gif      for `kind:'gif'` — the single animated-image path
//   piece    OPTIONAL — the `slug` of the piece in src/data/pieces.js that the
//            media shows. Renders a caption UNDER the frame that names the piece
//            and links to its page, e.g. "Lioness · Black & grey · Arm". Leave it
//            out for no caption. A slug that isn't in pieces.js fails the build.
//            No caption renders while the slot is show:false.
//   caption  OPTIONAL — a plain line of text under the frame instead (used when
//            the caption isn't a piece, e.g. the studio credit). `piece` wins.
//
// PLAYBACK is progressive-enhancement (see src/js/modules/media.js): the markup
// ships WITHOUT autoplay, so no-JS users (and reduced-motion users) just see the
// poster. The JS starts a clip only when it scrolls into view and the visitor
// hasn't asked to reduce motion, and pauses it off-screen to save battery.
// ─────────────────────────────────────────────────────────────────────────────

// ARTIST-COPY · DATA-MEDIA · pending approval (clip alt text)
export const media = {
  // Homepage hero — the process clip in the right-hand media column.
  // Shoot brief lives in index.html above the marker (16:9, < 4 MB, seamless loop).
  hero: {
    show:   true,
    kind:   'image',
    img:    '/images/tattoos/lioness',
    w: 800, h: 1063,
    // Phones crop the portrait photo to fill the first screen (drawn wider than
    // the viewport); from 900px it is shown whole, well inside the 55% column.
    sizes:  '(min-width:900px) 42vw, 150vw',
    alt:    'Black and grey realism tattoo of a lioness on an arm',
    piece:  'lioness',
    poster: '/videos/hero-poster.jpg',
    sources: [
      { src: '/videos/hero.webm', type: 'video/webm' },
      { src: '/videos/hero.mp4',  type: 'video/mp4'  },
    ],
    gif:    '/videos/hero.gif',

    // OPTIONAL portrait clip — shown on the MOBILE first-screen hero (<900px); the
    // landscape `sources` above stay the desktop 45/55 column (≥900px). When this
    // block is present the renderer (src/build/media.js) emits a SECOND <video>
    // tagged .media-clip--portrait and CSS swaps the two by breakpoint; remove it
    // and the single landscape clip is cropped to cover on mobile, as before.
    // Leave the homepage on `show:false` until the files land in public/videos/.
    //
    // Portrait shoot brief:
    //   — Frame:    9:16 portrait, full-bleed. Nothing is overlaid on it — the
    //               headline and caption sit underneath.
    //   — Light:    Warm, directional. Same grade as the landscape cut.
    //   — Duration: 25–30 sec seamless loop (last frame matches first). No audio.
    //   — Export:   WebM (VP9) primary + MP4 (H.264) fallback. Target < 5 MB.
    portrait: {
      poster: '/videos/hero-portrait-poster.jpg',
      sources: [
        { src: '/videos/hero-portrait.webm', type: 'video/webm' },
        { src: '/videos/hero-portrait.mp4',  type: 'video/mp4'  },
      ],
    },
  },

  // About page hero — the portrait frame in the intro (a calm looping clip of
  // the artist at work reads warmer here than a still). 4:5 portrait crop.
  // Same component as the homepage hero — see src/build/media.js.
  aboutHero: {
    show:    true,
    kind:    'image',
    img:     '/images/tattoos/highland-cow',
    w: 800, h: 1063,
    sizes:   '(min-width:900px) 40vw, 100vw',
    alt:     'Fine line tattoo of a highland cow with sunflowers on a leg',
    poster:  '/videos/about-portrait-poster.jpg',
    sources: [
      { src: '/videos/about-portrait.webm', type: 'video/webm' },
      { src: '/videos/about-portrait.mp4',  type: 'video/mp4'  },
    ],
    gif:     '/videos/about-portrait.gif',
    caption: 'Tiny Knives · Winchester',
  },
}
