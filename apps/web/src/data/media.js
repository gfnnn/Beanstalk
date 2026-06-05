// ─────────────────────────────────────────────────────────────────────────────
// MEDIA (video / GIF clips) — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// The client is supplying finished, edited clips (short looping video, or GIFs)
// for the homepage hero and the About page. This file is where each clip is
// turned ON and pointed at its files — the markup is generated at BUILD TIME by
// the renderers in src/build/media.js (wired through vite.config.js), exactly
// like homepage.js / pieces.js. Edit the values here; never hand-edit the
// generated <video>/<img> in the page HTML.
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
//   alt      accessible description of the clip (it's decorative motion, but
//            screen readers still announce the frame)                    (COPY)
//   poster   a still frame shown before/instead of playback — REQUIRED for
//            `video` (it's the LCP image and the reduced-motion fallback) and
//            used as the still swap for a `gif` under reduced-motion       (path)
//   sources  for `kind:'video'` — ordered best-first; the browser picks the
//            first type it can play. WebM (VP9/AV1) first, MP4 (H.264) fallback.
//   gif      for `kind:'gif'` — the single animated-image path
//
// PLAYBACK is progressive-enhancement (see src/js/modules/media.js): the markup
// ships WITHOUT autoplay, so no-JS users (and reduced-motion users) just see the
// poster. The JS starts a clip only when it scrolls into view and the visitor
// hasn't asked to reduce motion, and pauses it off-screen to save battery.
// ─────────────────────────────────────────────────────────────────────────────

export const media = {
  // Homepage hero — the process clip in the right-hand media column.
  // Shoot brief lives in index.html above the marker (16:9, < 4 MB, seamless loop).
  hero: {
    show:   false,
    kind:   'video',
    alt:    'Tattooing process, hands at work',
    poster: '/videos/hero-poster.jpg',
    sources: [
      { src: '/videos/hero.webm', type: 'video/webm' },
      { src: '/videos/hero.mp4',  type: 'video/mp4'  },
    ],
    gif:    '/videos/hero.gif',
  },

  // About page — the portrait frame in the intro (a calm looping clip of the
  // artist at work reads warmer here than a still). 4:5 portrait crop.
  aboutPortrait: {
    show:    false,
    kind:    'video',
    alt:     'Roxy tattooing in the studio',
    poster:  '/videos/about-portrait-poster.jpg',
    sources: [
      { src: '/videos/about-portrait.webm', type: 'video/webm' },
      { src: '/videos/about-portrait.mp4',  type: 'video/mp4'  },
    ],
    gif:     '/videos/about-portrait.gif',
    caption: 'Tiny Knives · Winchester',
  },
}
