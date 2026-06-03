// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// Every tile on /portfolio/ is generated from this array at BUILD TIME by the
// `beansprout-portfolio-tiles` Vite plugin (see vite.config.js → render in
// src/build/portfolio-tiles.js). Add / edit / reorder pieces here — never hand-
// edit the tile markup in portfolio/index.html.
//
// PER-PIECE FIELDS
// ────────────────
//   slug        URL segment → /portfolio/<slug>/         (required, unique)
//   title       Display name shown in the tile overlay   (COPY)
//   subject     What the piece depicts — feeds alt text   (COPY, e.g. "foxglove")
//   styles      Array of style tokens. A piece can be MORE THAN ONE — it shows
//               under every matching style chip. Tokens must match the chip
//               data-filter values:
//               fine-line · botanical · black-grey · illustrative · dotwork · colour · script
//   placement   Single placement token, matches the placement <select> options:
//               forearm · wrist · back · spine · leg · chest · hand
//   order       Sortable integer (higher = newer). Drives the Newest/Oldest sort
//               and the default tile order. Use a date-like int, e.g. 20260415.
//
// PLACEHOLDER FIELDS (used only until a real photo exists)
//   tone        Palette swatch class shown behind/while loading: t-moss · t-cream
//               · t-ink · t-sage · t-clay · t-warm · t-deep · t-blush · t-stone · t-dark
//   glyph       Which line-art placeholder to draw (see GLYPHS in
//               src/build/portfolio-tiles.js): sprig·moth·leaf·mushroom·waves·wheat·lily·branch
//   ph          Placeholder tile height in px (varies the masonry rhythm)
//
// IMAGE FIELDS — fill these in to swap a placeholder for a real photo
//   img         Base path with NO extension/size, e.g. "/images/tattoos/foxglove".
//               The renderer builds <picture> srcset from it:
//                 <img>            → `${img}-800.jpg`
//                 webp / avif      → `${img}-400.webp 400w, ${img}-800.webp 800w`, …
//               Leave null to keep the placeholder.
//   w, h        Intrinsic pixel dimensions of the photo. REQUIRED when img is set —
//               they reserve the aspect-ratio box so the masonry doesn't reflow as
//               lazy images load (no layout shift). When img is set, `ph` is ignored.
//
// → To go live with a piece: shoot it, export /public/images/tattoos/<slug>-{400,800,1200}.{jpg,webp,avif},
//   then set `img`, `w`, `h` (and real `title`/`subject`) here. Nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

export const pieces = [
  // Placeholder catalogue — subjects/titles are contextual to Roxy's real feed so the
  // grid reads true to her work; line-art glyphs + no photos mark them as placeholders.
  // She'll settle the final categories and swap in real images later.
  { slug: 'foxglove',       title: 'Foxglove',       subject: 'foxglove sprig',           styles: ['fine-line', 'botanical'],     placement: 'forearm', order: 20260516, tone: 't-moss',  glyph: 'sprig',    ph: 340, img: null, w: null, h: null },
  { slug: 'luna-moth',      title: 'Luna moth',      subject: 'luna moth',                styles: ['black-grey'],                 placement: 'wrist',   order: 20260514, tone: 't-ink',   glyph: 'moth',     ph: 260, img: null, w: null, h: null },
  { slug: 'trailing-ivy',   title: 'Trailing ivy',   subject: 'trailing ivy',             styles: ['botanical', 'fine-line'],     placement: 'spine',   order: 20260511, tone: 't-sage',  glyph: 'leaf',     ph: 420, img: null, w: null, h: null },
  { slug: 'wave',           title: 'Wave',           subject: 'breaking wave',            styles: ['fine-line'],                  placement: 'wrist',   order: 20260508, tone: 't-cream', glyph: 'waves',    ph: 300, img: null, w: null, h: null },
  { slug: 'raven',          title: 'Raven',          subject: 'raven',                    styles: ['black-grey'],                 placement: 'chest',   order: 20260505, tone: 't-dark',  glyph: 'branch',   ph: 380, img: null, w: null, h: null },
  { slug: 'toadstool',      title: 'Toadstool',      subject: 'toadstool',                styles: ['botanical', 'dotwork'],       placement: 'forearm', order: 20260429, tone: 't-warm',  glyph: 'mushroom', ph: 290, img: null, w: null, h: null },
  { slug: 'the-fool',       title: 'The Fool',       subject: 'the Fool tarot card',      styles: ['fine-line', 'illustrative'],  placement: 'back',    order: 20260422, tone: 't-blush', glyph: 'waves',    ph: 360, img: null, w: null, h: null },
  { slug: 'scripture-verse',title: 'Verse',          subject: 'scripture verse',          styles: ['script'],                     placement: 'wrist',   order: 20260415, tone: 't-stone', glyph: 'sprig',    ph: 240, img: null, w: null, h: null },
  { slug: 'wheat-wildflower',title: 'Wheatfield',    subject: 'wheat and wildflowers',    styles: ['botanical', 'dotwork'],       placement: 'leg',     order: 20260408, tone: 't-deep',  glyph: 'wheat',    ph: 440, img: null, w: null, h: null },
  { slug: 'otter',          title: 'Otter',          subject: 'otter',                    styles: ['black-grey', 'fine-line'],    placement: 'forearm', order: 20260401, tone: 't-ink',   glyph: 'branch',   ph: 310, img: null, w: null, h: null },
  { slug: 'wildflower-stem',title: 'Wildflower',     subject: 'wildflower stem',          styles: ['fine-line', 'botanical'],     placement: 'spine',   order: 20260325, tone: 't-moss',  glyph: 'sprig',    ph: 390, img: null, w: null, h: null },
  { slug: 'storybook-fox',  title: 'Storybook fox',  subject: 'storybook fox',            styles: ['colour', 'illustrative'],     placement: 'forearm', order: 20260318, tone: 't-clay',  glyph: 'mushroom', ph: 270, img: null, w: null, h: null },
  { slug: 'lily',           title: 'Lily',           subject: 'lily',                     styles: ['botanical'],                  placement: 'hand',    order: 20260311, tone: 't-sage',  glyph: 'lily',     ph: 320, img: null, w: null, h: null },
  { slug: 'lioness',        title: 'Lioness',        subject: 'lioness',                  styles: ['black-grey', 'illustrative'], placement: 'leg',     order: 20260304, tone: 't-dark',  glyph: 'leaf',     ph: 460, img: null, w: null, h: null },
  { slug: 'koi',            title: 'Koi',            subject: 'koi',                      styles: ['fine-line', 'colour'],        placement: 'chest',   order: 20260225, tone: 't-cream', glyph: 'waves',    ph: 280, img: null, w: null, h: null },
  { slug: 'moon-garden',    title: 'Moon garden',    subject: 'moth and moon phases',     styles: ['botanical', 'illustrative'],  placement: 'back',    order: 20260218, tone: 't-warm',  glyph: 'branch',   ph: 350, img: null, w: null, h: null },
]
