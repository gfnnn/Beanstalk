// ─────────────────────────────────────────────────────────────────────────────
// TESTIMONIALS — single source of truth for the homepage "Kind words" section
// ─────────────────────────────────────────────────────────────────────────────
// Rendered at build time by src/build/testimonials.js into the
// `<!-- testimonials -->` marker on the homepage. Add / edit / reorder client
// quotes here — never hand-edit the figures in index.html.
//
// FIELDS
//   quote   The client's words (COPY). Authentic, ~40 words max.
//   name    Attribution shown in the credit, e.g. "M. Hartley" (COPY).
//   piece   Optional piece descriptor shown after the name, e.g. "Fine line study".
//
// Real quotes only — never fabricate. Source these from DMs or feedback given at
// the time of the visit, then add them here. An empty array renders nothing.
//
// NOTE: empty for now because there are no approved real quotes yet. While this is
// empty, the homepage "Kind words" section is hidden (the `hidden` attribute on its
// <section> in index.html). Add quotes below AND remove that `hidden` to switch it
// back on.
// ROXY-COPY · DATA-TEST · pending approval (real client quotes only, never fabricate) — see docs/COPY-REVIEW.md
export const testimonials = [
  // Example shape (delete this comment, keep the format):
  // { quote: 'Roxy made my first tattoo so easy…', name: 'M. Hartley', piece: 'Fine line botanical' },
]
