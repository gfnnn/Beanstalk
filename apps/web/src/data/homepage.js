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
//            fine-line · botanical · black-grey · illustrative · dotwork · colour · script
//            The card title + "Browse … work" link + previews all derive from it.
//     em     the italic adjective after the style name in the <h3>          (COPY)
//     body   2–3 sentences describing the style — what it is, who it suits  (COPY)
//   Card order = array order; the "0X / 0Y" numbering is computed from it. The
//   grid is laid out for three — keep this to three featured styles.
// ─────────────────────────────────────────────────────────────────────────────

export const homepage = {
  status: {
    show:  true,
    label: 'Books open',
    tone:  'moss',
  },

  notices: [
    { show: true,  tone: 'moss',  label: 'Bookings',   html: 'Books are open for summer. <a href="/enquire/">Request a slot</a>' },
    { show: true,  tone: 'clay',  label: 'Flash day',  html: 'New flash dropping soon. <a href="/flash/">Preview the sheet</a>' },
    { show: false, tone: 'faint', label: 'Guest spot', html: 'Guest artist [Name], [Dates].' },
  ],

  hero: {
    eyebrow:  'Winchester · Fine line & botanical',
    headLead: 'Quietly considered',
    headEm:   'custom tattoo.',
    body:     "I'm Roxy — the fine line, botanical and illustrative tattooer behind Beansprout, working out of Tiny Knives in Winchester. Custom pieces, drawn for one person, at a pace that never feels rushed.",
    mediaTag: 'Tiny Knives · Winchester',
  },

  specialisms: [
    { style: 'fine-line',  em: 'precise', body: 'Clean, confident single-weight linework that stays readable as it heals. Delicate without being fragile — drawn to age as well as it looks on day one.' },
    { style: 'botanical',  em: 'living',  body: 'Flowers, ferns and foliage with the small botanical details that make a piece feel grown rather than stamped on. My favourite thing to draw.' },
    { style: 'black-grey', em: 'soft',    body: 'Smooth black and grey with gentle, smoky shading — animals, portraits and illustrative work with depth, contrast and a soft edge.' },
  ],
}
