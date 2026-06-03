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
// ─────────────────────────────────────────────────────────────────────────────

export const homepage = {
  status: {
    show:  true,
    label: 'Books open',
    tone:  'moss',
  },

  notices: [
    { show: true,  tone: 'moss',  label: 'Bookings',   html: 'Now open for [Month]. <a href="/enquire/">Request a slot</a>' },
    { show: true,  tone: 'clay',  label: 'Flash day',  html: 'New designs dropping [Date]. <a href="/flash/">Preview flash</a>' },
    { show: false, tone: 'faint', label: 'Guest spot', html: 'Guest artist [Name], [Dates].' },
  ],

  hero: {
    eyebrow:  '[Location] · [Defining phrase]',
    headLead: '[Headline — plain]',
    headEm:   '[Headline — italic]',
    body:     '[2–3 sentence studio descriptor. Style, location, approach. Keep it honest and specific.]',
    mediaTag: '[Studio name] · Guildford, Surrey',
  },
}
