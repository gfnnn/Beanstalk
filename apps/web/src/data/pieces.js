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
//               fine-line · black-grey · colour · dotwork · cybersigilism · script
//               (real execution styles only — NOT subject categories like "botanical")
//   placement   Single placement token, matches the placement <select> options:
//               forearm · wrist · back · spine · leg · chest · hand
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
// → The catalogue below is wired to the artist's approved web exports (all 700×930 .webp
//   in /public/images/tattoos/). `styles`/`placement`/`title`/`subject` are a first
//   pass for the filters + alt text — the artist can retune any of them in place. `date` is
//   each file's date; the grid orders newest → oldest from it (see header above).
// ─────────────────────────────────────────────────────────────────────────────

const IMG = '/images/tattoos'

// ARTIST-COPY · PORT-D1/PORT-D2 · pending approval (piece titles + subjects/alt text) — see docs/COPY-REVIEW.md
export const pieces = [
  { slug: 'peace',               title: 'Peace',                subject: 'a peace sign',                         styles: ['black-grey'],                  placement: 'forearm', date: '2026-05-30', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/peace`,               w: 800, h: 1067 },
  { slug: 'scissors',            title: 'Shears',               subject: 'a pair of scissors',                   styles: ['fine-line'],                   placement: 'forearm', date: '2026-05-30', tone: 't-stone', glyph: 'branch',   img: `${IMG}/scissors`,            w: 800, h: 1067 },
  { slug: 'folding-fan',         title: 'Folding fan',          subject: 'a folding fan with a peony',           styles: ['fine-line', 'colour'],         placement: 'chest',   date: '2026-05-16', tone: 't-clay',  glyph: 'sprig',    img: `${IMG}/folding-fan`,         w: 800, h: 1067 },
  { slug: 'peacock-butterfly',   title: 'Peacock butterfly',    subject: 'a peacock butterfly and carnations',   styles: ['colour'],                      placement: 'forearm', date: '2026-05-15', tone: 't-blush', glyph: 'moth',     img: `${IMG}/peacock-butterfly`,   w: 800, h: 1063 },
  { slug: 'lioness',             title: 'Lioness',              subject: 'a lioness',                            styles: ['black-grey'],                  placement: 'forearm', date: '2026-05-15', tone: 't-dark',  glyph: 'branch',   img: `${IMG}/lioness`,             w: 800, h: 1063 },
  { slug: 'betta-fish',          title: 'Betta fish',           subject: 'two betta fish',                       styles: ['fine-line', 'black-grey'],     placement: 'forearm', date: '2026-05-15', tone: 't-stone', glyph: 'waves',    img: `${IMG}/betta-fish`,          w: 800, h: 1063 },
  { slug: 'dog-portrait',        title: 'Good dog',             subject: 'a dog portrait',                       styles: ['black-grey', 'fine-line'],     placement: 'leg',     date: '2026-05-15', tone: 't-stone', glyph: 'branch',   img: `${IMG}/dog-portrait`,        w: 800, h: 1063 },
  { slug: 'lucky-cat',           title: 'Lucky cat',            subject: 'a cat and fish character',             styles: ['colour'],                      placement: 'forearm', date: '2026-05-15', tone: 't-warm',  glyph: 'waves',    img: `${IMG}/lucky-cat`,           w: 800, h: 1063 },
  { slug: 'gothic-gargoyles',    title: 'Gothic window',        subject: 'a gothic window with gargoyles',       styles: ['black-grey'],                  placement: 'leg',     date: '2026-05-02', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/gothic-gargoyles`,    w: 800, h: 1067 },
  { slug: 'ornamental-wings',    title: 'Wings',                subject: 'an ornamental back piece',             styles: ['cybersigilism', 'black-grey'], placement: 'back',    date: '2026-04-18', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/ornamental-wings`,    w: 800, h: 1067 },
  { slug: 'spider',              title: 'Spider',               subject: 'a spider',                             styles: ['fine-line', 'black-grey'],     placement: 'forearm', date: '2026-04-04', tone: 't-stone', glyph: 'branch',   img: `${IMG}/spider`,              w: 800, h: 1067 },
  { slug: 'crab',                title: 'Crab',                 subject: 'a crab and bubbles',                   styles: ['colour'],                      placement: 'wrist',   date: '2026-03-28', tone: 't-stone', glyph: 'waves',    img: `${IMG}/crab`,                w: 800, h: 1067 },
  { slug: 'otter',               title: 'Otter',                subject: 'an otter',                             styles: ['black-grey'],                  placement: 'leg',     date: '2026-03-14', tone: 't-stone', glyph: 'waves',    img: `${IMG}/otter`,               w: 800, h: 1067 },
  { slug: 'jiji',                title: 'Jiji',                 subject: 'a black cat',                          styles: ['fine-line'],                   placement: 'forearm', date: '2026-03-13', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/jiji`,                w: 800, h: 1067 },
  { slug: 'fire-lizard',         title: 'Charmander',           subject: 'a fire lizard',                        styles: ['fine-line'],                   placement: 'back',    date: '2026-03-13', tone: 't-warm',  glyph: 'branch',   img: `${IMG}/fire-lizard`,         w: 800, h: 1067 },
  { slug: 'lilies-butterflies',  title: 'Lilies & butterflies', subject: 'lilies and butterflies',               styles: ['fine-line'],                   placement: 'leg',     date: '2026-03-12', tone: 't-stone', glyph: 'lily',     img: `${IMG}/lilies-butterflies`,  w: 800, h: 1067 },
  { slug: 'eagle-geometric',     title: 'Eagle',                subject: 'an eagle head with geometry',          styles: ['black-grey'],                  placement: 'leg',     date: '2026-03-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/eagle-geometric`,     w: 800, h: 1067 },
  { slug: 'magnolia',            title: 'Magnolia',             subject: 'a magnolia flower',                    styles: ['fine-line'],                   placement: 'forearm', date: '2026-03-09', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/magnolia`,            w: 800, h: 1067 },
  { slug: 'cat-strawberries',    title: 'Cat portrait',         subject: 'a cat with strawberries',              styles: ['colour'],                      placement: 'leg',     date: '2026-02-22', tone: 't-sage',  glyph: 'leaf',     img: `${IMG}/cat-strawberries`,    w: 800, h: 1067 },
  { slug: 'lily-script',         title: 'Lily',                 subject: 'a lily with script',                   styles: ['fine-line', 'script'],         placement: 'back',    date: '2026-02-09', tone: 't-stone', glyph: 'lily',     img: `${IMG}/lily-script`,         w: 800, h: 1067 },
  { slug: 'hunter-emblem',       title: 'Hunter',               subject: 'a gaming emblem',                      styles: ['colour'],                      placement: 'forearm', date: '2026-02-07', tone: 't-warm',  glyph: 'branch',   img: `${IMG}/hunter-emblem`,       w: 800, h: 1067 },
  { slug: 'anthurium',           title: 'Anthurium',            subject: 'an anthurium leaf',                    styles: ['dotwork', 'black-grey'],       placement: 'forearm', date: '2026-02-06', tone: 't-deep',  glyph: 'leaf',     img: `${IMG}/anthurium`,           w: 800, h: 1067 },
  { slug: 'cranes-red-sun',      title: 'Cranes',               subject: 'two cranes and a red sun',             styles: ['colour'],                      placement: 'forearm', date: '2026-02-02', tone: 't-clay',  glyph: 'waves',    img: `${IMG}/cranes-red-sun`,      w: 800, h: 1067 },
  { slug: 'the-lovers',          title: 'The Lovers',           subject: 'a tarot card of two skeletons',        styles: ['black-grey', 'dotwork'],       placement: 'forearm', date: '2026-01-28', tone: 't-ink',   glyph: 'moth',     img: `${IMG}/the-lovers`,          w: 800, h: 1067 },
  { slug: 'owl-chrysanthemum',   title: 'Barn owl',             subject: 'a barn owl and chrysanthemums',        styles: ['fine-line'],                   placement: 'forearm', date: '2026-01-10', tone: 't-stone', glyph: 'branch',   img: `${IMG}/owl-chrysanthemum`,   w: 800, h: 1067 },
  { slug: 'koi-sleeve',          title: 'Koi',                  subject: 'a koi fish',                           styles: ['fine-line', 'black-grey'],     placement: 'forearm', date: '2025-12-18', tone: 't-stone', glyph: 'waves',    img: `${IMG}/koi-sleeve`,          w: 800, h: 1067 },
  { slug: 'gothic-thistle',      title: 'Gothic window',        subject: 'a gothic window with thistles',        styles: ['fine-line'],                   placement: 'forearm', date: '2025-12-16', tone: 't-stone', glyph: 'branch',   img: `${IMG}/gothic-thistle`,      w: 800, h: 1067 },
  { slug: 'bramble-moth',        title: 'Bramble & moth',       subject: 'blackberries and a moth',              styles: ['black-grey'],                  placement: 'forearm', date: '2025-12-12', tone: 't-deep',  glyph: 'moth',     img: `${IMG}/bramble-moth`,        w: 800, h: 1067 },
  { slug: 'robin',               title: 'Robin',                subject: 'a robin on a flowering branch',        styles: ['fine-line'],                   placement: 'leg',     date: '2025-12-12', tone: 't-stone', glyph: 'branch',   img: `${IMG}/robin`,               w: 800, h: 1067 },
  { slug: 'anemones',            title: 'Anemones',             subject: 'anemone flowers',                      styles: ['fine-line'],                   placement: 'chest',   date: '2025-12-12', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/anemones`,            w: 800, h: 1067 },
  { slug: 'deer-lilypond',       title: 'Fallow deer',          subject: 'a deer and water lilies',              styles: ['fine-line'],                   placement: 'forearm', date: '2025-11-16', tone: 't-sage',  glyph: 'leaf',     img: `${IMG}/deer-lilypond`,       w: 800, h: 1067 },
  { slug: 'raven-runes',         title: 'Raven & runes',        subject: 'a raven and a runic compass',          styles: ['black-grey'],                  placement: 'forearm', date: '2025-11-09', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/raven-runes`,         w: 800, h: 1067 },
  { slug: 'serpent',             title: 'Serpent',              subject: 'a snake',                              styles: ['black-grey'],                  placement: 'chest',   date: '2025-10-25', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/serpent`,             w: 800, h: 1067 },
  { slug: 'owl-meander',         title: 'Owl',                  subject: 'a barn owl and a greek key ring',      styles: ['black-grey'],                  placement: 'forearm', date: '2025-10-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/owl-meander`,         w: 800, h: 1067 },
  { slug: 'butterfly-moonphase', title: 'Butterfly & moons',    subject: 'a butterfly, moon phases and a lotus', styles: ['fine-line'],                   placement: 'leg',     date: '2025-10-04', tone: 't-blush', glyph: 'moth',     img: `${IMG}/butterfly-moonphase`, w: 800, h: 1067 },
  { slug: 'koi',                 title: 'Koi',                  subject: 'a koi carp',                           styles: ['colour'],                      placement: 'forearm', date: '2025-09-11', tone: 't-clay',  glyph: 'waves',    img: `${IMG}/koi`,                 w: 800, h: 1063 },
  { slug: 'lily-stem',           title: 'Lily',                 subject: 'a single lily stem',                   styles: ['fine-line'],                   placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'lily',     img: `${IMG}/lily-stem`,           w: 800, h: 1063 },
  { slug: 'lilies',              title: 'Lilies',               subject: 'a pair of lilies',                     styles: ['fine-line'],                   placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'lily',     img: `${IMG}/lilies`,              w: 800, h: 1063 },
  { slug: 'monstera-adansonii',  title: 'Monstera adansonii',   subject: 'a monstera adansonii vine',            styles: ['fine-line'],                   placement: 'forearm', date: '2025-09-11', tone: 't-sage',  glyph: 'leaf',     img: `${IMG}/monstera-adansonii`,  w: 800, h: 1063 },
  { slug: 'space-creature',      title: 'Deoxys',               subject: 'a space creature',                     styles: ['colour'],                      placement: 'forearm', date: '2025-09-11', tone: 't-warm',  glyph: 'branch',   img: `${IMG}/space-creature`,      w: 800, h: 1063 },
  { slug: 'whale-sharks',        title: 'Whale sharks',         subject: 'two whale sharks',                     styles: ['fine-line', 'dotwork'],        placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'waves',    img: `${IMG}/whale-sharks`,        w: 800, h: 1063 },
  { slug: 'mind-flayer-sword',   title: 'Mind flayer',          subject: 'an illithid sword and runes',          styles: ['colour'],                      placement: 'back',    date: '2025-09-11', tone: 't-clay',  glyph: 'branch',   img: `${IMG}/mind-flayer-sword`,   w: 800, h: 1063 },
  { slug: 'gods-timing',         title: 'God\'s timing',        subject: 'a sword with script',                  styles: ['fine-line', 'script'],         placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/gods-timing`,         w: 800, h: 1063 },
  { slug: 'wizard-racoon',       title: 'Wizard',               subject: 'a wizard raccoon',                     styles: ['black-grey'],                  placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'mushroom', img: `${IMG}/wizard-racoon`,       w: 800, h: 1063 },
  { slug: 'balloon',             title: 'Balloon',              subject: 'an animatronic balloon',               styles: ['colour'],                      placement: 'leg',     date: '2025-03-27', tone: 't-cream', glyph: 'moth',     img: `${IMG}/balloon`,             w: 800, h: 1063 },
  { slug: 'peppers',             title: 'Peppers',              subject: 'bell peppers',                         styles: ['colour'],                      placement: 'wrist',   date: '2025-03-27', tone: 't-warm',  glyph: 'leaf',     img: `${IMG}/peppers`,             w: 800, h: 1063 },
  { slug: 'butterfly',           title: 'Butterfly',            subject: 'a butterfly',                          styles: ['colour'],                      placement: 'forearm', date: '2025-03-27', tone: 't-cream', glyph: 'moth',     img: `${IMG}/butterfly`,           w: 800, h: 1063 },
  { slug: 'winged-cat',          title: 'Happy',                subject: 'a winged cat and mushroom',            styles: ['colour'],                      placement: 'forearm', date: '2025-03-27', tone: 't-cream', glyph: 'mushroom', img: `${IMG}/winged-cat`,          w: 800, h: 1063 },
  { slug: 'highland-cow',        title: 'Highland cow',         subject: 'a highland cow with sunflowers',       styles: ['fine-line'],                   placement: 'leg',     date: '2025-03-23', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/highland-cow`,        w: 800, h: 1063 },
  { slug: 'mouse-and-hare',      title: 'Mouse & hare',         subject: 'a mouse and hare with floral inlay',   styles: ['fine-line'],                   placement: 'leg',     date: '2025-03-23', tone: 't-stone', glyph: 'branch',   img: `${IMG}/mouse-and-hare`,      w: 800, h: 1063 },
  { slug: 'remembrance',         title: 'Remembrance',          subject: 'a soldier and roses',                  styles: ['black-grey'],                  placement: 'leg',     date: '2025-03-11', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/remembrance`,         w: 800, h: 1063 },
  { slug: 'foxglove',            title: 'Foxglove',             subject: 'a foxglove stem',                      styles: ['fine-line'],                   placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/foxglove`,            w: 800, h: 1063 },
  { slug: 'jellyfish',           title: 'Jellyfish',            subject: 'a jellyfish',                          styles: ['black-grey'],                  placement: 'forearm', date: '2025-03-11', tone: 't-ink',   glyph: 'waves',    img: `${IMG}/jellyfish`,           w: 800, h: 1063 },
  { slug: 'storyteller',         title: 'Storyteller',          subject: 'an elderly portrait',                  styles: ['fine-line'],                   placement: 'leg',     date: '2025-03-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/storyteller`,         w: 800, h: 1063 },
  { slug: 'archangel',           title: 'Archangel',            subject: 'an archangel and sacred geometry',     styles: ['fine-line', 'black-grey'],     placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/archangel`,           w: 800, h: 1063 },
  { slug: 'dominoes-roses',      title: 'Dominoes & roses',     subject: 'dominoes and roses',                   styles: ['fine-line'],                   placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/dominoes-roses`,      w: 800, h: 1063 },
  { slug: 'dragonfly-daisies',   title: 'Dragonfly & daisies',  subject: 'a dragonfly and daisies',              styles: ['fine-line', 'dotwork'],        placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/dragonfly-daisies`,   w: 800, h: 1063 },
  { slug: 'tiger',               title: 'Tiger',                subject: 'a tiger',                              styles: ['black-grey'],                  placement: 'forearm', date: '2025-03-11', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/tiger`,               w: 800, h: 1063 },
]
