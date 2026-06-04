// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML helpers for the build-time renderers
// ─────────────────────────────────────────────────────────────────────────────
// Every renderer turns a data file into an HTML string; these are the bits all of
// them need, kept in one place so the escaping rules and the image-path
// convention can't drift apart between them.

// Escape for text content and double-quoted attribute values.
export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// True when an `img` value already carries a file extension — a final web export
// (e.g. "…/Koi.webp") served as-is — rather than the no-extension base path that
// the multi-size "<img>-400/-800/-1200.<ext>" srcset convention derives from.
export const HAS_EXT = /\.(avif|webp|jpe?g|png)$/i
