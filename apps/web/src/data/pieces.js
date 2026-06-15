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
//               data-filter values; the canonical list lives in
//               src/data/taxonomy.js (currently: fine-line · high-detail ·
//               realism · black-grey · colour · dotwork · cybersigilism · script —
//               real execution styles only, NOT subject categories like "botanical")
//   placement   Single placement token, matches the placement <select> options;
//               canonical list in src/data/taxonomy.js (currently: arm · body ·
//               leg — deliberately coarse, refinable post-launch)
//   date        The day the piece was made, "YYYY-MM-DD". This drives the order:
//               the grid is newest-first by date (default), oldest-first when the
//               Sort control flips. `dateKey()` in portfolio-tiles.js turns it into
//               the numeric sort key. Author this array NEWEST → OLDEST; pieces that
//               share a date keep the order they're listed in here (stable sort).
//
// PLACEHOLDER FIELDS (used only until a real photo exists)
//   tone        Palette swatch class shown behind/while loading: t-moss · t-cream
//               · t-ink · t-sage · t-clay · t-warm · t-deep · t-blush · t-stone · t-dark
//               (the swatch COLOURS are defined in src/data/palette.js → `tones`)
//   glyph       Which line-art placeholder to draw (see GLYPHS in
//               src/build/portfolio-tiles.js): sprig·moth·leaf·mushroom·waves·wheat·lily·branch
//
// IMAGE FIELDS — fill these in to swap a placeholder for a real photo
//   img         Path to the image. TWO supported forms:
//                 • Single file WITH extension, e.g. "/images/tattoos/Koi.webp" —
//                   served as-is (used for the artist's final web exports). No
//                   srcset is built; this is the right form for a one-size export.
//                 • Base path with NO extension, e.g. "/images/tattoos/foxglove" —
//                   the renderer builds a responsive <picture> srcset from it
//                   (`${img}-400.webp 400w`, `${img}-800.jpg`, … avif/webp/jpg).
//                   Use this only when 400/800/1200 derivatives actually exist.
//               Leave null to keep the line-art placeholder.
//   w, h        Intrinsic pixel dimensions of the photo. REQUIRED when img is set —
//               they reserve the aspect-ratio box so the grid doesn't reflow as
//               lazy images load (no layout shift).
//
// → The catalogue below is wired to the artist's pre-edited photos, processed into
//   responsive tiers (≈800×1067) in /public/images/tattoos/ by scripts/process-media.mjs.
//   `styles`/`placement`/`title`/`subject` are a first pass for the filters + alt text —
//   the artist can retune any of them in place. `date` is each piece's date; the grid
//   orders newest → oldest from it (see header above).
// ─────────────────────────────────────────────────────────────────────────────

const IMG = '/images/tattoos'

export const pieces = [
  { slug: 'asiatic-lilies', title: 'Asiatic lilies', subject: 'Asiatic lilies', styles: ['fine-line'], placement: 'leg', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/asiatic-lilies`, w: 800, h: 1067 },
  { slug: 'bubble-crab', title: 'Bubble crab', subject: 'Bubble crab', styles: ['colour'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/bubble-crab`, w: 800, h: 1067 },
  { slug: 'cyber-wings', title: 'Cyber wings', subject: 'Cyber wings', styles: ['cybersigilism'], placement: 'body', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/cyber-wings`, w: 800, h: 1067 },
  { slug: 'doe', title: 'Doe', subject: 'Doe', styles: ['fine-line'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/doe`, w: 800, h: 1067 },
  { slug: 'fan', title: 'Fan', subject: 'Fan', styles: ['fine-line'], placement: 'body', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/fan`, w: 800, h: 1067 },
  { slug: 'ghibli-cat', title: 'Ghibli cat', subject: 'Ghibli cat', styles: ['fine-line'], placement: 'body', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/ghibli-cat`, w: 800, h: 1067 },
  { slug: 'good-cat', title: 'Good cat', subject: 'Good cat', styles: ['colour'], placement: 'leg', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/good-cat`, w: 800, h: 1067 },
  { slug: 'gothic-window', title: 'Gothic window', subject: 'Gothic window', styles: ['black-grey'], placement: 'leg', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/gothic-window`, w: 800, h: 1067 },
  { slug: 'hawk', title: 'Hawk', subject: 'Hawk', styles: ['realism'], placement: 'leg', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/hawk`, w: 800, h: 1067 },
  { slug: 'lily', title: 'Lily', subject: 'Lily', styles: ['fine-line'], placement: 'body', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/lily`, w: 800, h: 1067 },
  { slug: 'lunar-butterfly', title: 'Lunar butterfly', subject: 'Lunar butterfly', styles: ['black-grey'], placement: 'leg', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/lunar-butterfly`, w: 800, h: 1067 },
  { slug: 'monstera', title: 'Monstera', subject: 'Monstera', styles: ['black-grey'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/monstera`, w: 800, h: 1067 },
  { slug: 'otter', title: 'Otter', subject: 'Otter', styles: ['realism', 'black-grey'], placement: 'leg', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/otter`, w: 800, h: 1067 },
  { slug: 'owl-swoop', title: 'Owl swoop', subject: 'Owl swoop', styles: ['realism', 'black-grey'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/owl-swoop`, w: 800, h: 1067 },
  { slug: 'peace', title: 'Peace', subject: 'Peace', styles: ['black-grey'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/peace`, w: 800, h: 1067 },
  { slug: 'plum-blossom', title: 'Plum blossom', subject: 'Plum blossom', styles: ['fine-line'], placement: 'body', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/plum-blossom`, w: 800, h: 1067 },
  { slug: 'raven', title: 'Raven', subject: 'Raven', styles: ['realism'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/raven`, w: 800, h: 1067 },
  { slug: 'robin', title: 'Robin', subject: 'Robin', styles: ['fine-line'], placement: 'leg', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/robin`, w: 800, h: 1067 },
  { slug: 'shears', title: 'Shears', subject: 'Shears', styles: ['black-grey'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/shears`, w: 800, h: 1067 },
  { slug: 'shiro-bekko-koi', title: 'Shiro bekko koi', subject: 'Shiro bekko koi', styles: ['fine-line'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/shiro-bekko-koi`, w: 800, h: 1067 },
  { slug: 'snake', title: 'Snake', subject: 'Snake', styles: ['black-grey'], placement: 'body', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/snake`, w: 800, h: 1067 },
  { slug: 'spider', title: 'Spider', subject: 'Spider', styles: ['black-grey'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/spider`, w: 800, h: 1067 },
  { slug: 'the-division', title: 'The division', subject: 'The division', styles: ['colour'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/the-division`, w: 800, h: 1067 },
  { slug: 'the-lovers', title: 'The lovers', subject: 'The lovers', styles: ['fine-line'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/the-lovers`, w: 800, h: 1067 },
  { slug: 'window', title: 'Window', subject: 'Window', styles: ['fine-line'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/window`, w: 800, h: 1067 },
  { slug: 'wise-owl', title: 'Wise owl', subject: 'Wise owl', styles: ['realism'], placement: 'arm', date: '2026-06-12', tone: 't-stone', glyph: 'sprig', img: `${IMG}/wise-owl`, w: 800, h: 1067 },
  // ── Original (pre-Dropbox) set — styles confirmed by the artist (2026-06-15). ──
  { slug: 'peacock-butterfly',   title: 'Peacock butterfly',    subject: 'a peacock butterfly and carnations',   styles: ['colour', 'realism'],                      placement: 'arm', date: '2026-05-15', tone: 't-blush', glyph: 'moth',     img: `${IMG}/peacock-butterfly`,   w: 800, h: 1063 },
  { slug: 'lioness',             title: 'Lioness',              subject: 'a lioness',                            styles: ['black-grey', 'realism'],                  placement: 'arm', date: '2026-05-15', tone: 't-dark',  glyph: 'branch',   img: `${IMG}/lioness`,             w: 800, h: 1063 },
  { slug: 'betta-fish',          title: 'Betta fish',           subject: 'two betta fish',                       styles: ['fine-line', 'black-grey', 'realism'],     placement: 'arm', date: '2026-05-15', tone: 't-stone', glyph: 'waves',    img: `${IMG}/betta-fish`,          w: 800, h: 1063 },
  { slug: 'dog-portrait',        title: 'Good dog',             subject: 'a dog portrait',                       styles: ['black-grey', 'fine-line', 'realism'],     placement: 'leg',     date: '2026-05-15', tone: 't-stone', glyph: 'branch',   img: `${IMG}/dog-portrait`,        w: 800, h: 1063 },
  { slug: 'lucky-cat',           title: 'Lucky cat',            subject: 'a cat and fish character',             styles: ['colour', 'high-detail'],                      placement: 'arm', date: '2026-05-15', tone: 't-warm',  glyph: 'waves',    img: `${IMG}/lucky-cat`,           w: 800, h: 1063 },
  { slug: 'asagi-koi',           title: 'Asagi koi',            subject: 'an asagi koi',                           styles: ['colour', 'realism'],                      placement: 'arm', date: '2025-09-11', tone: 't-clay',  glyph: 'waves',    img: `${IMG}/asagi-koi`,                 w: 800, h: 1063 },
  { slug: 'lily-stem',           title: 'Lily',                 subject: 'a single lily stem',                   styles: ['fine-line'],                   placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'lily',     img: `${IMG}/lily-stem`,           w: 800, h: 1063 },
  { slug: 'stargazer-lilies',    title: 'Stargazer lilies',     subject: 'a pair of stargazer lilies',                     styles: ['fine-line'],                   placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'lily',     img: `${IMG}/stargazer-lilies`,              w: 800, h: 1063 },
  { slug: 'monstera-adansonii',  title: 'Monstera adansonii',   subject: 'a monstera adansonii vine',            styles: ['fine-line'],                   placement: 'arm', date: '2025-09-11', tone: 't-sage',  glyph: 'leaf',     img: `${IMG}/monstera-adansonii`,  w: 800, h: 1063 },
  { slug: 'space-creature',      title: 'Deoxys',               subject: 'a space creature',                     styles: ['colour', 'high-detail'],                      placement: 'arm', date: '2025-09-11', tone: 't-warm',  glyph: 'branch',   img: `${IMG}/space-creature`,      w: 800, h: 1063 },
  { slug: 'whale-sharks',        title: 'Whale sharks',         subject: 'two whale sharks',                     styles: ['fine-line', 'dotwork', 'high-detail'],        placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'waves',    img: `${IMG}/whale-sharks`,        w: 800, h: 1063 },
  { slug: 'mind-flayer-sword',   title: 'Mind flayer',          subject: 'an illithid sword and runes',          styles: ['colour', 'high-detail'],                      placement: 'body',    date: '2025-09-11', tone: 't-clay',  glyph: 'branch',   img: `${IMG}/mind-flayer-sword`,   w: 800, h: 1063 },
  { slug: 'gods-timing',         title: 'God\'s timing',        subject: 'a sword with script',                  styles: ['fine-line', 'script'],         placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/gods-timing`,         w: 800, h: 1063 },
  { slug: 'wizard-racoon',       title: 'Wizard',               subject: 'a wizard raccoon',                     styles: ['black-grey', 'high-detail'],                  placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'mushroom', img: `${IMG}/wizard-racoon`,       w: 800, h: 1063 },
  { slug: 'balloon',             title: 'Balloon',              subject: 'an animatronic balloon',               styles: ['colour', 'high-detail'],                      placement: 'leg',     date: '2025-03-27', tone: 't-cream', glyph: 'moth',     img: `${IMG}/balloon`,             w: 800, h: 1063 },
  { slug: 'peppers',             title: 'Peppers',              subject: 'bell peppers',                         styles: ['colour'],                      placement: 'arm',   date: '2025-03-27', tone: 't-warm',  glyph: 'leaf',     img: `${IMG}/peppers`,             w: 800, h: 1063 },
  { slug: 'butterfly',           title: 'Butterfly',            subject: 'a butterfly',                          styles: ['colour'],                      placement: 'arm', date: '2025-03-27', tone: 't-cream', glyph: 'moth',     img: `${IMG}/butterfly`,           w: 800, h: 1063 },
  { slug: 'winged-cat',          title: 'Happy',                subject: 'a winged cat and mushroom',            styles: ['colour', 'high-detail'],                      placement: 'arm', date: '2025-03-27', tone: 't-cream', glyph: 'mushroom', img: `${IMG}/winged-cat`,          w: 800, h: 1063 },
  { slug: 'highland-cow',        title: 'Highland cow',         subject: 'a highland cow with sunflowers',       styles: ['fine-line'],                   placement: 'leg',     date: '2025-03-23', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/highland-cow`,        w: 800, h: 1063 },
  { slug: 'mouse-and-hare',      title: 'Mouse & hare',         subject: 'a mouse and hare with floral inlay',   styles: ['fine-line'],                   placement: 'leg',     date: '2025-03-23', tone: 't-stone', glyph: 'branch',   img: `${IMG}/mouse-and-hare`,      w: 800, h: 1063 },
  { slug: 'remembrance',         title: 'Remembrance',          subject: 'a soldier and roses',                  styles: ['black-grey', 'realism'],                  placement: 'leg',     date: '2025-03-11', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/remembrance`,         w: 800, h: 1063 },
  { slug: 'foxglove',            title: 'Foxglove',             subject: 'a foxglove stem',                      styles: ['fine-line'],                   placement: 'arm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/foxglove`,            w: 800, h: 1063 },
  { slug: 'jellyfish',           title: 'Jellyfish',            subject: 'a jellyfish',                          styles: ['black-grey', 'realism'],                  placement: 'arm', date: '2025-03-11', tone: 't-ink',   glyph: 'waves',    img: `${IMG}/jellyfish`,           w: 800, h: 1063 },
  { slug: 'storyteller',         title: 'Storyteller',          subject: 'an elderly portrait',                  styles: ['fine-line', 'realism'],                   placement: 'leg',     date: '2025-03-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/storyteller`,         w: 800, h: 1063 },
  { slug: 'archangel',           title: 'Archangel',            subject: 'an archangel and sacred geometry',     styles: ['fine-line', 'black-grey', 'high-detail'],     placement: 'arm', date: '2025-03-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/archangel`,           w: 800, h: 1063 },
  { slug: 'dominoes-roses',      title: 'Dominoes & roses',     subject: 'dominoes and roses',                   styles: ['fine-line'],                   placement: 'arm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/dominoes-roses`,      w: 800, h: 1063 },
  { slug: 'dragonfly-daisies',   title: 'Dragonfly & daisies',  subject: 'a dragonfly and daisies',              styles: ['fine-line', 'dotwork'],        placement: 'arm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/dragonfly-daisies`,   w: 800, h: 1063 },
  { slug: 'tiger',               title: 'Tiger',                subject: 'a tiger',                              styles: ['black-grey', 'realism'],                  placement: 'arm', date: '2025-03-11', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/tiger`,               w: 800, h: 1063 },
]
