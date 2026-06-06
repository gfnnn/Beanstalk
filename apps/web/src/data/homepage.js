// ─────────────────────────────────────────────────────────────────────────────
// HOMEPAGE CONTENT — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// All the regularly-changing copy on the homepage (and the studio "light" shared
// across every page's nav) lives here. It's injected at BUILD TIME by the
// generated-grids Vite plugin (see vite.config.js → renderers in
// src/build/homepage.js). Edit the values here — never hand-edit the nav status
// pill, the hero copy, or the studio-notice bars in the HTML.
//
// It runs in dev AND build, so edits show on `npm run dev` immediately and ship
// as static HTML (good for SEO / no-JS / LCP). After editing, just rebuild.
//
// ── status — the "light" in the nav bar (appears on every page) ───────────────
//   show    true → show the pill, false → hide it completely
//   label   short text beside the light (CSS UPPERCASES it)                (COPY)
//   tone    the light's COLOUR — flip it to signal what's on right now:
//             'moss'  green   — normal / books open
//             'clay'  orange  — something live: a flash day or guest event coming up
//             'faint' grey    — quiet / closed / waitlist
//   e.g. flash day coming up →  { show: true, label: 'Flash day Sat', tone: 'clay' }
//        guest artist in     →  { show: true, label: 'Guest: Sam',    tone: 'clay' }
//        normal              →  { show: true, label: 'Books open',    tone: 'moss' }
//
// ── notices — the toggleable bars under the hero text (homepage only) ─────────
//   Up to 3 bars. Each one:
//     show   true → render this bar, false → leave it off
//     tone   dot colour: 'moss' (green) | 'clay' (orange) | 'faint' (grey)
//     label  short mono label, e.g. 'Bookings' / 'Flash day' / 'Guest spot'  (COPY)
//     html   the message — RAW HTML, so it may contain a link, e.g.
//              'New designs drop 14 Jun. <a href="/flash/">Preview flash</a>'
//   Turn a bar off with show:false (e.g. no guest spot this month). If every bar
//   is off, the whole block — including its divider — is omitted, no empty gap.
//
// ── hero — the headline + intro copy (homepage only) ──────────────────────────
//   Plain text, auto-escaped. headLead is the plain part of the H1, headEm the
//   italic part rendered after a line break.
//
// ── specialisms — the "What I do" cards (homepage only) ───────────────────────
//   The three style cards under the portfolio teaser. Each card showcases ONE
//   portfolio style and pulls its preview thumbnails LIVE from src/data/pieces.js
//   (the newest pieces with a photo carrying that style — see
//   src/build/specialisms.js). You only choose the style + the copy here:
//     style  a portfolio style TOKEN — must match the chips / STYLE_LABELS:
//            fine-line · black-grey · colour · dotwork · cybersigilism · script
//            The card title + "Browse … work" link + previews all derive from it.
//     em     the italic adjective after the style name in the <h3>          (COPY)
//     body   2–3 sentences describing the style — what it is, who it suits  (COPY)
//   Card order = array order; the "0X / 0Y" numbering is computed from it. The
//   grid shows THREE across on desktop and stacks three on phones. One extra
//   entry may carry `fill: true`: a tablet-only balance tile that squares off the
//   2-column grid (where three would leave an orphan). It renders only at tablet
//   widths, is left out of the "0X / 0Y" count, and is labelled "Also" instead.
//   Keep the always-on featured styles to three.
//
// ── videoCredit — crediting whoever shot the hero video ───────────────────────
//   A small credit line over the hero media (the column that will hold the
//   process video). Off until the video + credit are confirmed.
//     show    true → render the line, false → leave it off entirely
//     label   short mono lead-in, e.g. 'Film by'                            (COPY)
//     name    the person/handle shown after the label                      (COPY)
//     url     where the credit links (their social) — '' for no link       (COPY)
// ─────────────────────────────────────────────────────────────────────────────

export const homepage = {
  // ROXY-COPY · HOME-01 · pending approval — see docs/COPY-REVIEW.md
  status: {
    show:  true,
    label: 'Books open',
    tone:  'moss',
  },

  // ROXY-COPY · HOME-02 · pending approval — see docs/COPY-REVIEW.md
  notices: [
    { show: true,  tone: 'moss',  label: 'Bookings',   html: 'Books are open for summer. <a href="/enquire/">Request a slot</a>' },
    { show: true,  tone: 'clay',  label: 'Flash day',  html: 'New flash dropping soon. <a href="/flash/">Preview the sheet</a>' },
    { show: false, tone: 'faint', label: 'Guest spot', html: 'Guest artist [Name], [Dates].' },
  ],

  // ROXY-COPY · HOME-03 · pending approval — see docs/COPY-REVIEW.md
  hero: {
    eyebrow:  'Winchester · Fine line & botanical',
    headLead: 'Quietly considered',
    headEm:   'custom tattoo.',
    body:     "I'm Roxy, the fine line, botanical and illustrative tattooer behind Beansprout, working out of Tiny Knives in Winchester. Custom pieces, drawn for one person, at a pace that never feels rushed.",
    mediaTag: 'Tiny Knives · Winchester',
  },

  // ROXY-COPY · HOME-04 · pending approval — see docs/COPY-REVIEW.md
  specialisms: [
    { style: 'fine-line',  em: 'precise', body: 'Clean, confident single-weight linework that stays readable as it heals. Delicate without being fragile, drawn to age as well as it looks on day one.' },
    { style: 'black-grey', em: 'soft',    body: 'Smooth black and grey with gentle, smoky shading: animals, portraits and illustrative work with depth, contrast and a soft edge.' },
    { style: 'colour',     em: 'vivid',   body: 'Saturated colour with clean, considered blends over the same careful linework. For a piece that wants to sing rather than whisper, without losing its softness.' },
    // Tablet-only balance tile (fill) — squares the 2-column grid; hidden on
    // phone and desktop. Not counted in the "0X / 0Y" numbering.
    { style: 'dotwork', fill: true, em: 'textured', body: 'Soft gradients and depth built dot by dot: a slower, hand-worked technique that gives botanical and ornamental pieces a gently stippled texture.' },
  ],

  // ROXY-COPY · HOME-10 · pending approval — see docs/COPY-REVIEW.md
  videoCredit: {
    show:  false,
    label: 'Film by',
    name:  '@handle',          // COPY: the videographer's social handle
    url:   '',                 // COPY: link to their profile, or '' for no link
  },
}
