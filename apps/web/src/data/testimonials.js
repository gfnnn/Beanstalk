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
// These are placeholders so the section renders today; swap in real quotes as
// they come in. An empty array renders nothing (the section header still shows).
export const testimonials = [
  // COPY: replace with real client quotes + attributions.
  { quote: '[Client quote, authentic, max ~40 words.]', name: '[Initial Last.]', piece: 'Fine line study' },
  { quote: '[Client quote.]', name: '[Initial Last.]', piece: 'Botanical piece' },
  { quote: '[Client quote.]', name: '[Initial Last.]', piece: 'Custom design' },
]
