// ─────────────────────────────────────────────────────────────────────────────
// Colour palette — the single source of truth for every colour on the site
// ─────────────────────────────────────────────────────────────────────────────
// This is a CONTENT file, like src/data/homepage.js or src/data/testimonials.js:
// edit the values here and the whole site recolours on the next build. Nothing in
// the CSS hard-codes a colour any more — every rule reads a CSS custom property
// that src/build/palette.js generates from the ACTIVE palette below and injects
// into each page's <head> (see the `palette` plugin in vite.config.js).
//
// To switch the site's look: change `active` to another palette's key and rebuild
// (`npm run build`, or just reload `npm run dev`). To tweak a single colour: edit
// its hex here. To add a new palette: copy a block, rename the key, change the
// hexes, and point `active` at it.
//
// Each palette has two groups:
//   colors — the brand swatches (page background, ink/text, the moss/clay/amber
//            accents and their soft variants). Used directly (var(--moss)) and,
//            for translucent shades, via auto-generated "channel" tokens
//            (rgba(var(--moss-rgb), 0.3)) — the build derives `--<name>-rgb` for
//            every colour, so you never maintain those by hand.
//   tones  — the decorative gradient swatches behind image-less portfolio tiles,
//            flash cards and the homepage hero tiles (they vanish once a real
//            photo is set). Each tone is a { from, to, text } trio; the shared
//            rules in src/styles/components/tones.css paint .t-/.ci-/.gradient-
//            <tone> from them. The tone NAMES are referenced by src/data/pieces.js
//            and src/data/flash.js (`tone:` field) — keep the two in step.
// ─────────────────────────────────────────────────────────────────────────────

export const palettes = {
  // The house look — warm, earthy, woodland. This reproduces the original design.
  woodland: {
    label: 'Woodland (warm earthy — default)',
    colors: {
      bg:         '#F7F1E3', // page background (cream)
      'bg-alt':   '#EFE8D6', // slightly deeper section background
      'bg-dark':  '#2C2A24', // dark sections (= ink)
      cream:      '#FBF8EE', // lightest surface (cards on cream)
      white:      '#FFFFFF', // pure white (checkmarks, etc.)
      black:      '#000000', // shadow base (used only as rgba())
      ink:        '#2C2A24', // primary text
      'ink-soft': '#5C5A52', // secondary text
      'ink-faint':'#6B6861', // muted text / captions (WCAG-AA on cream surfaces)
      'ink-hover':'#3D3B34', // dark-button hover (a touch lighter than ink)
      moss:       '#4A5D3F', // primary accent (botanical green)
      'moss-soft':'#8A9A75', // soft moss (borders, dots)
      clay:       '#B05138', // warm accent / CTA (cream text on clay clears WCAG AA)
      'clay-soft':'#E08C72', // soft clay
      amber:      '#946930', // tertiary accent (pending badge clears WCAG AA on cream)
      'moss-mid':  '#6B7E5A', // hero gradient mid-stop
      sand:       '#C8A882', // warm decorative ramp (hero gradients)
      dune:       '#B8A87A', //   ″   sand→moss bridge (homepage hero)
      warm:       '#B8987A', //   ″   mid (about hero)
      umber:      '#9A7A5A', //   ″   deep (about hero)
    },
    tones: {
      moss:  { from: '#4A5D3F', to: '#6B7E5A', text: '#E8E1C9' },
      sage:  { from: '#8A9A75', to: '#A5B391', text: '#2C2A24' },
      warm:  { from: '#B8987A', to: '#D5B898', text: '#2C2A24' },
      cream: { from: '#DCC9A4', to: '#EFE3C9', text: '#3A3830' },
      blush: { from: '#D8B5A0', to: '#E8C8B0', text: '#2C2A24' },
      clay:  { from: '#B05138', to: '#D8775A', text: '#FBF8EE' },
      ink:   { from: '#2C2A24', to: '#4A4640', text: '#CCC5B0' },
      deep:  { from: '#36473F', to: '#56685A', text: '#E8E1C9' },
      stone: { from: '#9A9085', to: '#B5A898', text: '#2C2A24' },
      dark:  { from: '#3A3A38', to: '#5A5852', text: '#DDD3BD' },
    },
  },

  // Example alternate — a cooler twilight variant. Demonstrates a full palette
  // swap: set `active: 'dusk'` below and rebuild to see the whole site change.
  dusk: {
    label: 'Dusk (cool twilight)',
    colors: {
      bg:         '#EEE9EC',
      'bg-alt':   '#E3DCE2',
      'bg-dark':  '#27242E',
      cream:      '#F6F2F4',
      white:      '#FFFFFF',
      black:      '#000000',
      ink:        '#27242E',
      'ink-soft': '#56525E',
      'ink-faint':'#8A8693',
      'ink-hover':'#36323F',
      moss:       '#3F5560', // slate-teal
      'moss-soft':'#7E96A0',
      clay:       '#B0506A', // muted rose
      'clay-soft':'#D4849A',
      amber:      '#9A7B4A',
      'moss-mid':  '#5E7682',
      sand:       '#B6A6BE',
      dune:       '#AC9CB6',
      warm:       '#9E8FA8',
      umber:      '#6E6080',
    },
    tones: {
      moss:  { from: '#3F5560', to: '#5E7682', text: '#E4E7E9' },
      sage:  { from: '#7E96A0', to: '#9DB2BA', text: '#27242E' },
      warm:  { from: '#9E8FA8', to: '#BBAEC4', text: '#27242E' },
      cream: { from: '#C8BCCB', to: '#E3DAE6', text: '#36323F' },
      blush: { from: '#C7A6B4', to: '#E0C4CF', text: '#27242E' },
      clay:  { from: '#B0506A', to: '#C76E86', text: '#F6F2F4' },
      ink:   { from: '#27242E', to: '#433E4C', text: '#C9C3D0' },
      deep:  { from: '#33414A', to: '#516571', text: '#E4E7E9' },
      stone: { from: '#928C99', to: '#ADA6B5', text: '#27242E' },
      dark:  { from: '#343240', to: '#545060', text: '#D6D0DD' },
    },
  },
}

// The palette currently in force across the whole site. Change and rebuild.
export const active = 'woodland'
