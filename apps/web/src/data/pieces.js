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
//   date        The day the piece was made, "YYYY-MM-DD". This drives the order:
//               the grid is newest-first by date (default), oldest-first when the
//               Sort control flips. `dateKey()` in portfolio-tiles.js turns it into
//               the numeric sort key. Author this array NEWEST → OLDEST; pieces that
//               share a date keep the order they're listed in here (stable sort).
//
// PLACEHOLDER FIELDS (used only until a real photo exists)
//   tone        Palette swatch class shown behind/while loading: t-moss · t-cream
//               · t-ink · t-sage · t-clay · t-warm · t-deep · t-blush · t-stone · t-dark
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
// → The catalogue below is wired to Roxy's approved web exports (all 700×930 .webp
//   in /public/images/tattoos/). `styles`/`placement`/`title`/`subject` are a first
//   pass for the filters + alt text — she can retune any of them in place. `date` is
//   each file's date; the grid orders newest → oldest from it (see header above).
// ─────────────────────────────────────────────────────────────────────────────

const IMG = '/images/tattoos'

export const pieces = [
  { slug: 'peacock-butterfly',  title: 'Peacock butterfly',  subject: 'a peacock butterfly and carnations',  styles: ['colour', 'botanical'],        placement: 'forearm', date: '2026-05-15', tone: 't-blush', glyph: 'moth',     img: `${IMG}/Peacock.webp`,      w: 700, h: 930 },
  { slug: 'lioness',            title: 'Lioness',            subject: 'a lioness',                           styles: ['black-grey', 'illustrative'], placement: 'forearm', date: '2026-05-15', tone: 't-dark',  glyph: 'branch',   img: `${IMG}/Lion.webp`,         w: 700, h: 930 },
  { slug: 'betta-fish',         title: 'Betta fish',         subject: 'two betta fish',                      styles: ['fine-line', 'black-grey'],    placement: 'forearm', date: '2026-05-15', tone: 't-stone', glyph: 'waves',    img: `${IMG}/Beta.webp`,         w: 700, h: 930 },
  { slug: 'dog-portrait',       title: 'Good dog',           subject: 'a dog portrait',                      styles: ['black-grey', 'fine-line'],    placement: 'leg',     date: '2026-05-15', tone: 't-stone', glyph: 'branch',   img: `${IMG}/Doggy.webp`,        w: 700, h: 930 },
  { slug: 'lucky-cat',          title: 'Lucky cat',          subject: 'a cat and fish character',            styles: ['colour', 'illustrative'],     placement: 'forearm', date: '2026-05-15', tone: 't-warm',  glyph: 'waves',    img: `${IMG}/LuckyPKMN.webp`,    w: 700, h: 930 },
  { slug: 'koi',                title: 'Koi',                subject: 'a koi carp',                          styles: ['colour', 'illustrative'],     placement: 'forearm', date: '2025-09-11', tone: 't-clay',  glyph: 'waves',    img: `${IMG}/Koi.webp`,          w: 700, h: 930 },
  { slug: 'lily-stem',          title: 'Lily',               subject: 'a single lily stem',                  styles: ['fine-line', 'botanical'],     placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'lily',     img: `${IMG}/Sundrop.webp`,      w: 700, h: 930 },
  { slug: 'lilies',             title: 'Lilies',             subject: 'a pair of lilies',                    styles: ['fine-line', 'botanical'],     placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'lily',     img: `${IMG}/Lily.webp`,         w: 700, h: 930 },
  { slug: 'monstera-adansonii', title: 'Monstera adansonii', subject: 'a monstera adansonii vine',           styles: ['fine-line', 'botanical'],     placement: 'forearm', date: '2025-09-11', tone: 't-sage',  glyph: 'leaf',     img: `${IMG}/Adansonii.webp`,    w: 700, h: 930 },
  { slug: 'space-creature',     title: 'Deoxys',             subject: 'a space creature',                    styles: ['colour', 'illustrative'],     placement: 'forearm', date: '2025-09-11', tone: 't-warm',  glyph: 'branch',   img: `${IMG}/SpaceVirus.webp`,   w: 700, h: 930 },
  { slug: 'whale-sharks',       title: 'Whale sharks',       subject: 'two whale sharks',                    styles: ['fine-line', 'dotwork'],       placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'waves',    img: `${IMG}/WhaleSharks.webp`,  w: 700, h: 930 },
  { slug: 'mind-flayer-sword',  title: 'Mind flayer',        subject: 'an illithid sword and runes',         styles: ['colour', 'illustrative'],     placement: 'back',    date: '2025-09-11', tone: 't-clay',  glyph: 'branch',   img: `${IMG}/Balduran.webp`,     w: 700, h: 930 },
  { slug: 'gods-timing',        title: "God's timing",       subject: 'a sword with script',                 styles: ['fine-line', 'script'],        placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/Sword.webp`,        w: 700, h: 930 },
  { slug: 'wizard-racoon',      title: 'Wizard',             subject: 'a wizard raccoon',                    styles: ['black-grey', 'illustrative'], placement: 'leg',     date: '2025-09-11', tone: 't-stone', glyph: 'mushroom', img: `${IMG}/Wizard.webp`,       w: 700, h: 930 },
  { slug: 'balloon',            title: 'Balloon',            subject: 'an animatronic balloon',              styles: ['colour', 'illustrative'],     placement: 'leg',     date: '2025-03-27', tone: 't-cream', glyph: 'moth',     img: `${IMG}/fnaf.webp`,         w: 700, h: 930 },
  { slug: 'peppers',            title: 'Peppers',            subject: 'bell peppers',                        styles: ['colour', 'illustrative'],     placement: 'wrist',   date: '2025-03-27', tone: 't-warm',  glyph: 'leaf',     img: `${IMG}/pepper.webp`,       w: 700, h: 930 },
  { slug: 'butterfly',          title: 'Butterfly',          subject: 'a butterfly',                         styles: ['colour'],                     placement: 'forearm', date: '2025-03-27', tone: 't-cream', glyph: 'moth',     img: `${IMG}/butterfly1.webp`,   w: 700, h: 930 },
  { slug: 'winged-cat',         title: 'Happy',              subject: 'a winged cat and mushroom',           styles: ['colour', 'illustrative'],     placement: 'forearm', date: '2025-03-27', tone: 't-cream', glyph: 'mushroom', img: `${IMG}/happymushroom.webp`, w: 700, h: 930 },
  { slug: 'highland-cow',       title: 'Highland cow',       subject: 'a highland cow with sunflowers',      styles: ['fine-line', 'botanical'],     placement: 'leg',     date: '2025-03-23', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/MooMoo.webp`,       w: 700, h: 930 },
  { slug: 'mouse-and-hare',     title: 'Mouse & hare',       subject: 'a mouse and hare with floral inlay',  styles: ['fine-line', 'illustrative'],  placement: 'leg',     date: '2025-03-23', tone: 't-stone', glyph: 'branch',   img: `${IMG}/MouseRabbit.webp`,  w: 700, h: 930 },
  { slug: 'remembrance',        title: 'Remembrance',        subject: 'a soldier and roses',                 styles: ['black-grey', 'illustrative'], placement: 'leg',     date: '2025-03-11', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/Soldier.webp`,      w: 700, h: 930 },
  { slug: 'foxglove',           title: 'Foxglove',           subject: 'a foxglove stem',                     styles: ['fine-line', 'botanical'],     placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/flowers.webp`,      w: 700, h: 930 },
  { slug: 'jellyfish',          title: 'Jellyfish',          subject: 'a jellyfish',                         styles: ['black-grey', 'illustrative'], placement: 'forearm', date: '2025-03-11', tone: 't-ink',   glyph: 'waves',    img: `${IMG}/jellyfish.webp`,    w: 700, h: 930 },
  { slug: 'storyteller',        title: 'Storyteller',        subject: 'an elderly portrait',                 styles: ['fine-line', 'illustrative'],  placement: 'leg',     date: '2025-03-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/WotW.webp`,         w: 700, h: 930 },
  { slug: 'archangel',          title: 'Archangel',          subject: 'an archangel and sacred geometry',    styles: ['fine-line', 'black-grey'],    placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'branch',   img: `${IMG}/valkyrie.webp`,     w: 700, h: 930 },
  { slug: 'dominoes-roses',     title: 'Dominoes & roses',   subject: 'dominoes and roses',                  styles: ['fine-line', 'illustrative'],  placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig',    img: `${IMG}/dominoes.webp`,     w: 700, h: 930 },
  { slug: 'dragonfly-daisies',  title: 'Dragonfly & daisies', subject: 'a dragonfly and daisies',            styles: ['fine-line', 'dotwork', 'botanical'], placement: 'forearm', date: '2025-03-11', tone: 't-stone', glyph: 'sprig', img: `${IMG}/Dragonfly.webp`, w: 700, h: 930 },
  { slug: 'tiger',              title: 'Tiger',              subject: 'a tiger',                             styles: ['black-grey', 'illustrative'], placement: 'forearm', date: '2025-03-11', tone: 't-ink',   glyph: 'branch',   img: `${IMG}/Tiger.webp`,        w: 700, h: 930 },
]
