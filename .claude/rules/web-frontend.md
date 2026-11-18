---
description: "Front-end JS modules and the design system (palette, contrast, motion) for apps/web"
paths:
  - "apps/web/src/js/**"
  - "apps/web/src/styles/**"
  - "apps/web/src/data/palette.js"
  - "apps/web/*.html"
  - "apps/web/*/index.html"
---

# Web front end (`apps/web/src/js`, `apps/web/src/styles`)

## Front-end JS — single orchestrated init
`src/js/main.js` is the only entry point. On `DOMContentLoaded` it manages the full-page
preloader first (`initPageLoader()`, which resolves a `pageReady` promise),
inits Lenis smooth-scroll (so it drives the GSAP ticker) and nav, then **gates the visual
entrance on `pageReady`**: the `motion-ready` class flip (the FOUC guard) + the hero/scroll
animations run when the page is ready to be shown, so the entrance plays *as the cover lifts*
rather than behind it. Everything else (portfolio load-more + filter + lightbox, aftercare,
faq, enquire, flash, newsletter, hero media, analytics — and finally the mobile sticky CTA)
inits immediately. **The full motion / page-transition system is mapped in
[`docs/MOTION.md`](../../docs/MOTION.md) — read it before changing load/entrance/transition behaviour.**
Modules under `src/js/modules/`: `lenis`, `nav`, `animations`, `loadmore`,
`filter`, `lightbox`, `sticky` (shared sticky-shadow helper for pinned bars — used by
filter, flash and the enquire progress bar), `chip-overflow` (shared responsive "More"
collapse for tight filter rows — used by filter and flash), `filter-collapse` (mobile-only:
collapses the whole filter bar behind a deterministic "Filters" toggle — a tap, not a
scroll-driven auto-hide, so it can't flicker on mobile browser-chrome motion; also shared by
filter and flash), `aftercare`, `faq`, `enquire`,
`flash`, `newsletter`, `map` (the `/visit/` Google map — created only when the visitor presses
"Show the map", never on load, because the embed sets Google cookies), `notices` (hides a dated
homepage notice after its `until` day), `media` (homepage + About hero video/GIF clips: reduced-motion-aware,
on-screen-only playback), `analytics` (GA4 behind `track()`: gtag.js loads at runtime only on a
host with an ID in `src/data/analytics.js` and only if the visitor hasn't opted out via GPC
or the `/privacy/` control, and not until the page has been revealed and loaded — it waits on
`pageReady` from `loader`; `track()` sends only an allowlist of events/params, so no form
values can leak — call sites never touch gtag; see `docs/ANALYTICS.md`), `loader` (dismisses the full-page
preloader), `spinner` (shared button busy-state: swaps a button's label for an
animated `.btn-spinner` + "Loading…"/"Sending…" while an async action runs, used by
load-more and the enquiry/flash/newsletter submits), `cta` (the mobile sticky "Enquire"
bar — a functional control, deliberately NOT reduced-motion gated), and `config`
(function URLs). Portfolio
load-more, filter/sort and lightbox cooperate via callbacks wired in `main.js` (load-more
owns the visible window; filter re-applies after a reveal/sort).

The FOUC guard (`motion-ready`), the full-page preloader, page transitions and the animated
hairline rules are documented only in [`docs/MOTION.md`](../../docs/MOTION.md).

## Design system — don't drift

Warm earthy palette (cream `#F7F1E3`, moss `#4A5D3F`, clay `#B05138`, ink `#2C2A24`)
with Fraunces (serif display) / Karla (sans body) / JetBrains Mono (labels). Reuse the
shared nav, footer, button, and JS-module patterns across pages. Placeholder copy is
marked `<!-- COPY: -->`; image placeholders carry shoot briefs in HTML comments.
Spacing (padding/margin/gap) uses the `--space-*` scale and shadows/halos use the named
tokens (`--shadow-*`, `--focus-halo`, …) in `styles/variables.css`; new rules use them, and
the off-grid literals left in place are legacy.

**Contrast floors (WCAG 2.2 AA).** A form control's resting border uses `--line-field`
(≥3:1), never the decorative `--line`/`--line-soft` hairlines. The focus ring is clay on light
surfaces and cream on dark ones (one scoped override in `styles/a11y.css`; add any new dark
container that holds focusable content to its list). `--moss-soft` is decorative only (borders,
dots, faint background numerals): text that must be read uses `--moss`.

**Motion is one language too — don't drift it either.** The whole site (load reveal,
scroll reveal, hover, ambient, page transition) speaks two curves from the `--ease-*`
tokens — **SOFT** for text, **ORGANIC** for assets that grow/arrive — and the JS
entrance mirrors them via `CustomEase` so JS == CSS. The first view reveals as one
top-to-bottom positional wave. New motion uses those tokens/curves; see
[`docs/MOTION.md`](../../docs/MOTION.md) → *Motion language* before adding any.

**Colour lives in one place — `apps/web/src/data/palette.js`.** Every rule reads a CSS
custom property (`var(--moss)`, `rgba(var(--ink-rgb),
…)`, the `--tone-*` swatch trios). `src/build/palette.js` generates those properties
from the **active** palette in that data file and the `palette` plugin in
`vite.config.js` injects them into every page's `<head>` (dev + build) and points the
`theme-color` meta at the palette background. To recolour the whole site, switch
`active` (or edit a palette's hexes) and rebuild — it's content, like `homepage.js`.
Add a palette by copying a block; keep its `colors`/`tones` keys in step with the
others so a switch can't leave a token undefined. The decorative tile/flash/hero
gradient swatches are defined once in `styles/components/tones.css` from the `tones`
group — never reintroduce the per-surface `.t-*`/`.ci-*`/`.gradient-*` copies.
