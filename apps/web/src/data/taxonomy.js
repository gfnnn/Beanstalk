// ─────────────────────────────────────────────────────────────────────────────
// TAXONOMY — the artist's vocabulary, single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// The style and placement tokens a portfolio piece may declare, with their
// display labels. Everything that touches these tokens reads THIS file:
//
//   • the renderers (src/build/portfolio-tiles.js re-exports the label maps)
//   • the data-contract tests (tests/data-integrity.test.js)
//   • the Dropbox master-filename parser (scripts/master-metadata.mjs), which
//     validates the artist's declared metadata EXACTLY against these tokens —
//     an unknown token rejects the file, it is never guessed or fuzzy-matched
//
// Adding a token here makes it valid in data and in master filenames; the first
// piece to actually USE it still needs a matching filter chip / <select> option
// in portfolio/index.html (the data-integrity test fails with instructions until
// the chip exists — deliberately, so the filter UI only offers tokens that have
// work behind them).
//
// Tokens are real execution styles, NOT subject categories ("botanical" is a
// subject, not a style). Keys are the filter tokens; values are display labels.

export const STYLE_LABELS = {
  'fine-line':   'Fine line',
  'high-detail': 'High detail',
  realism:       'Realism',
  'black-grey':  'Black & grey',
  colour:        'Colour',
  dotwork:       'Dotwork',
  cybersigilism: 'Cybersigilism',
  script:        'Script',
}

export const PLACEMENT_LABELS = {
  forearm: 'Forearm', wrist: 'Wrist', back: 'Back', spine: 'Spine',
  leg: 'Leg', chest: 'Chest', hand: 'Hand',
}

export const STYLE_TOKENS = Object.keys(STYLE_LABELS)
export const PLACEMENT_TOKENS = Object.keys(PLACEMENT_LABELS)
