// ─────────────────────────────────────────────────────────────────────────────
// master-metadata.mjs — the Dropbox master-filename convention: parse, validate,
// and write data entries.
// ─────────────────────────────────────────────────────────────────────────────
// The artist supplies each piece's metadata IN THE FILENAME, so image + metadata
// travel together in the one place she already works (Dropbox) — no second app,
// no spreadsheet. The grammar (segments separated by " -- "):
//
//   portfolio/  Title -- placement -- style[+style…] -- YYYY-MM-DD[ -- subject]
//               e.g.  Peacock butterfly -- forearm -- colour+realism -- 2026-05-15.jpg
//   flash/drop-N/  Title -- <size>in -- £<price> -- <placement options> -- style
//               e.g.  Luna moth -- 4in -- £220 -- forearm, spine -- black-grey.jpg
//
// Validation is EXACT, against the canonical vocabulary in src/data/taxonomy.js:
// an unknown style/placement token rejects the file with a message listing the
// valid tokens — nothing is guessed, fuzzy-matched, or inferred from the image.
// (That's the project rule the removed auto-crop taught: the artist declares,
// the pipeline validates and transports. See docs/MEDIA.md.)
//
// What IS defaulted (decorative/copy only, never filter data, all visible for
// review in the sync PR): `tone`/`glyph` (the pre-photo placeholder swatch —
// invisible once a real img is set) and portfolio `subject` (alt-text copy,
// defaults to the title; an optional 5th segment overrides it). Flash placement
// options are free copy for the card's specs line, not filter tokens — only the
// flash *style* is a validated token.
//
// The writer half turns a parsed master (+ the processed base-tier w/h) into a
// data-file entry line and inserts it into src/data/{pieces,flash}.js, keeping
// pieces.js's newest-first-by-date invariant (enforced by data-integrity tests).
import { STYLE_LABELS, STYLE_TOKENS, PLACEMENT_TOKENS } from '../src/data/taxonomy.js'

// Filename → URL-safe slug (the piece's `slug` / flash `id`, and the tier files'
// basename). De-accents, lowercases, collapses non-alphanumerics to hyphens.
export function slugify(name) {
  return String(name)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const SEP = /\s*--\s*/
const stripExt = name => String(name).replace(/\.[^.]+$/, '')

// The first " -- " segment (the title) — used to derive the slug BEFORE full
// parsing, so the sync can tell a new piece (metadata required) from a re-upload
// of an existing one (metadata segments unnecessary and ignored).
export const titleOf = name => stripExt(name).split(SEP)[0].trim()

const GRAMMAR = {
  portfolio: 'Title -- placement -- style[+style] -- YYYY-MM-DD [-- subject]   e.g. "Peacock butterfly -- forearm -- colour+realism -- 2026-05-15.jpg"',
  flash:     'Title -- <size>in -- £<price> -- <placement options> -- style   e.g. "Luna moth -- 4in -- £220 -- forearm, spine -- black-grey.jpg"',
}

const reject = (name, why, lane) => ({ ok: false, reason: `"${name}": ${why} — expected ${GRAMMAR[lane]}` })

// Placeholder swatch defaults — decorative pre-photo scaffolding only (the tile
// shows the real photo), kept valid against the renderer GLYPHS/tone classes.
const DEFAULTS = {
  portfolio: { tone: 't-stone', glyph: 'sprig' },
  flash:     { tone: 'ci-sage', glyph: 'sprig' },
}

/**
 * Parse + validate one master filename against the lane grammar.
 * @returns {{ok:true, value:object} | {ok:false, reason:string}}
 *   portfolio value: { slug, title, subject, subjectDefaulted, styles, placement, date, tone, glyph }
 *   flash value:     { slug, title, specs, price, size, drop, status, tone, glyph, placements, style }
 */
export function parseMasterName(lane, filename, { drop = null } = {}) {
  const segs = stripExt(filename).split(SEP).map(s => s.trim())
  const title = segs[0]
  const slug = slugify(title)
  if (!slug) return reject(filename, 'the title gives an empty slug (use latin letters/numbers in the title)', lane)

  if (lane === 'portfolio') {
    if (segs.length < 4 || segs.length > 5) {
      return reject(filename, `found ${segs.length} part(s), needs 4 or 5 " -- "-separated parts`, lane)
    }
    const [, placementRaw, stylesRaw, date, subjectRaw] = segs
    const placement = placementRaw.toLowerCase()
    if (!PLACEMENT_TOKENS.includes(placement)) {
      return reject(filename, `"${placementRaw}" isn't a placement — use one of: ${PLACEMENT_TOKENS.join(' · ')}`, lane)
    }
    const styles = stylesRaw.split('+').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!styles.length) return reject(filename, 'no styles given', lane)
    for (const s of styles) {
      if (!STYLE_TOKENS.includes(s)) {
        return reject(filename, `"${s}" isn't a style — use one of: ${STYLE_TOKENS.join(' · ')}`, lane)
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return reject(filename, `"${date}" isn't a date — use YYYY-MM-DD (the day the piece was made; it sets the grid order)`, lane)
    }
    const subject = subjectRaw || title.toLowerCase()
    return {
      ok: true,
      value: { slug, title, subject, subjectDefaulted: !subjectRaw, styles, placement, date, ...DEFAULTS.portfolio },
    }
  }

  if (lane === 'flash') {
    if (segs.length !== 5) {
      return reject(filename, `found ${segs.length} part(s), needs 5 " -- "-separated parts`, lane)
    }
    const [, sizeRaw, priceRaw, placementsRaw, styleRaw] = segs
    const sizeMatch = sizeRaw.match(/^(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")$/i)
    if (!sizeMatch) return reject(filename, `"${sizeRaw}" isn't a size — write it like "3in"`, lane)
    const priceMatch = priceRaw.match(/^£?\s*(\d+)$/)
    if (!priceMatch) return reject(filename, `"${priceRaw}" isn't a price — write it like "£220" (whole pounds)`, lane)
    if (!placementsRaw) return reject(filename, 'no placement options given (free text, e.g. "forearm, calf")', lane)
    const style = styleRaw.toLowerCase()
    if (!STYLE_TOKENS.includes(style)) {
      return reject(filename, `"${styleRaw}" isn't a style — use one of: ${STYLE_TOKENS.join(' · ')}`, lane)
    }
    if (!drop) {
      return reject(filename, 'it isn\'t inside a drop folder — put new flash masters in "flash/drop-<N>/" so the drop number is declared', lane)
    }
    const size = Number(sizeMatch[1])
    // Specs caption mirrors the existing cards: "<size> inches · <Placements> · <Style>".
    const placements = placementsRaw.replace(/\s*,\s*/g, ', ')
    const specs = `${size} ${size === 1 ? 'inch' : 'inches'} · ${placements.charAt(0).toUpperCase()}${placements.slice(1)} · ${STYLE_LABELS[style]}`
    return {
      ok: true,
      value: { slug, title, specs, price: Number(priceMatch[1]), size, drop, status: 'available', placements, style, ...DEFAULTS.flash },
    }
  }

  throw new Error(`unknown lane: ${lane}`)
}

// ── data-entry writing ────────────────────────────────────────────────────────

const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

// One pieces.js source line, matching the file's one-entry-per-line style.
// `img` uses the file's `${IMG}` base constant; w/h come from the processed
// base tier (the -800 JPG), exactly what the renderer needs for the aspect box.
export function formatPieceEntry(v, { w, h }) {
  return `  { slug: ${q(v.slug)}, title: ${q(v.title)}, subject: ${q(v.subject)}, ` +
    `styles: [${v.styles.map(q).join(', ')}], placement: ${q(v.placement)}, date: ${q(v.date)}, ` +
    `tone: ${q(v.tone)}, glyph: ${q(v.glyph)}, img: \`\${IMG}/${v.slug}\`, w: ${w}, h: ${h} },`
}

export function formatFlashEntry(v, { w, h }) {
  return `  { id: ${q(v.slug)}, title: ${q(v.title)}, specs: ${q(v.specs)}, ` +
    `price: ${v.price}, size: ${v.size}, drop: ${v.drop}, status: ${q(v.status)}, ` +
    `tone: ${q(v.tone)}, glyph: ${q(v.glyph)}, img: ${q(`/images/flash/${v.slug}`)}, w: ${w}, h: ${h} },`
}

const dateKeyOf = line => {
  const m = line.match(/date:\s*'(\d{4})-(\d{2})-(\d{2})'/)
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : null
}

// Insert formatted entry lines into a data file's source, keeping the array's
// ordering invariant. Pure string-in/string-out (unit-tested); throws rather
// than guessing when the file doesn't look as expected — the data-integrity
// tests then still gate whatever a human does by hand instead.
export function insertEntryLines(source, lines, { arrayName, byDate = false } = {}) {
  const open = source.match(new RegExp(`export const ${arrayName} = \\[\\n`))
  if (!open) throw new Error(`could not find "export const ${arrayName} = [" — paste the entries by hand`)
  const start = open.index + open[0].length
  const end = source.indexOf('\n]', start)
  if (end === -1) throw new Error(`could not find the end of the ${arrayName} array — paste the entries by hand`)

  const body = source.slice(start, end).split('\n')
  // newest first among themselves, so equal-date inserts keep declaration order
  const ordered = byDate ? [...lines].sort((a, b) => (dateKeyOf(b) ?? 0) - (dateKeyOf(a) ?? 0)) : lines

  for (const line of ordered) {
    if (byDate) {
      const key = dateKeyOf(line)
      if (key == null) throw new Error(`new entry has no date: ${line}`)
      // keep the array newest-first: insert before the first strictly-older entry
      // (after any same-date ones, preserving their authored order)
      let at = body.length
      for (let i = 0; i < body.length; i++) {
        const existing = dateKeyOf(body[i])
        if (existing != null && existing < key) { at = i; break }
      }
      body.splice(at, 0, line)
    } else {
      body.unshift(line) // newest drop first — top of the array
    }
  }
  return source.slice(0, start) + body.join('\n') + source.slice(end)
}
