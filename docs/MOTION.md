# Motion & page transitions

How the site's load, entrance, and page-transition motion fits together. It's
deliberately calm — "felt, not noticed" (woodland direction, §3) — but it spans
several files and a few non-obvious coordination points (the production CSP, the
deferred-module timing, cross-document View Transitions, and a shared CSS-variable
switch), so this is the map.

Everything here is **progressive enhancement**: it all sits behind
`prefers-reduced-motion: no-preference`, and every hold-then-reveal step carries a
pure-CSS failsafe, so a reduced-motion visitor — or one whose JS never runs — still
gets a fully visible, static page.

## The layers

| Layer | Lives in | Job |
|---|---|---|
| **Entrance animations** | `src/js/modules/animations.js` (GSAP) | Hero / page-header entrance, scroll reveals, grid + card cascades |
| **FOUC guard** | `src/styles/motion.css` | Hold the entrance elements hidden from first paint so GSAP's `.from()` never flashes |
| **Full-page loader** | `src/build/loader.js` (inject) + `src/js/modules/loader.js` (dismiss) | The cream cover for the slow **cold** first load |
| **Page transitions** | `src/styles/components/atmosphere.css` | Cross-document View Transition — a soft cross-fade between routes |
| **Animated hairline rules** | `atmosphere.css` (the `--rule-scale` switch + `.divider`) + per-page hairline pseudos | Dividers that grow in from the left as the page builds |
| **Brand-mark ink-rise** | preloader copy in `src/build/loader.js`; shared `mark-rise` in `atmosphere.css` | The calligraphic logo "draws" in (clip-path wipe from the base) on the preloader, the nav logo (cold load only) and the confirmation mark |

## The coordination spine: `pageReady` → `motion-ready`

The whole reveal hangs off one promise and one class.

1. **First paint.** `motion.css` holds the entrance elements at `opacity: 0` (the
   FOUC guard), and the `--rule-scale` switch is `0` so the hairline rules are
   collapsed. On a **cold** load the loader cover is also painted over everything.
   So nothing animated is visible yet — by design, no flash.
2. **`initPageLoader()`** (first call in `main.js`) decides *when the page should be
   revealed* and resolves the exported **`pageReady`** promise at that moment:
   - **Warm** in-session navigation (this tab has loaded a page already this
     session — `sessionStorage['bs-visited']`): the cover is dropped instantly and
     `pageReady` resolves right away. The View Transition is doing the cross-fade,
     so the cover would only get in the way.
   - **Cold** load: the cover holds until `document.fonts.ready` (the font swap is
     the real cause of the reflow), then fades — and `pageReady` resolves as the
     fade *begins*, so the entrance plays **as the cover lifts**, not behind it.
     A 3s JS ceiling and a 6s pure-CSS failsafe guarantee the cover can never trap
     the page.
3. **`pageReady.then(...)`** in `main.js` does the reveal: add `motion-ready` to
   `<html>`, then run `initHeroAnimation()` + `initScrollAnimations()`. The class
   flip and GSAP's `.from()` start-states land in **one synchronous tick**, so the
   browser never paints the in-between — the FOUC guard hands straight off to GSAP.
   Adding `motion-ready` also flips `--rule-scale` to its default `1`, so the
   hairline rules transition (grow) in.

Everything that isn't part of the reveal (nav, smooth-scroll, forms, load-more,
lightbox, …) initialises immediately on `DOMContentLoaded`; only the *visual
entrance* waits on `pageReady`.

## Entrance animations (`animations.js`)

- **Hero (home)** and **page-header (inner pages)** play an on-load GSAP timeline:
  eyebrow → title (blur-rise) → descriptor/body. Eyebrows **fade only** — the
  leftward motion is carried by the eyebrow's leading rule growing in (see below).
- **`revealGroup(items, …)`** is the shared card/tile cascade. Two deliberate
  choices make it read right everywhere:
  - **Per-item stagger (`each`), not a fixed total.** A fixed total split across a
    big grid (the portfolio has 16+ tiles) is ~15ms per tile — they flash in as one
    block. A constant per-item gap keeps the cascade visible at any count.
  - **Above-the-fold groups play a deliberate on-load cascade** (sequenced just
    after the header); below-the-fold groups reveal on scroll. So the portfolio /
    flash grids, which sit right under the header, cascade after it instead of
    flashing in on load.
- **Unified section reveal (one registry).** Every section's *eyebrow · heading ·
  body* animates the same way site-wide through a single registry in
  `initScrollAnimations` — the generic semantic classes the homepage uses
  (`.eyebrow`, `.section-title`, `.body-text`, `.serif-note`) **plus** the per-page
  bespoke equivalents inner pages invented (`.chooser-*`, `.contact-*`,
  `.newsletter-band-*`). This is the fix for the old drift where a page that named
  its header differently silently got **no** motion. Headings carry the
  blur-to-sharp; offsets shrink on mobile. A **claim guard** skips anything already
  animated by another pass — explicit `.reveal` wrappers, the hero / page-header
  timelines, the filter-bar cascade, the grid `revealGroup`s, and the dynamic
  regions a page module reveals itself (the aftercare `[hidden]` stage, the enquiry
  `.form-steps`) — so the registry never *double*-animates. It's above-the-fold
  aware (on-load cascade vs. own scroll trigger), exactly like the generic
  `.reveal` below.
- **`cascadeReveal(items, …)`** is the homepage card cascade exported for content a
  page **module** reveals itself at runtime rather than on load (the aftercare step
  / rule lists, which live inside a `[hidden]` stage until a dressing is picked, so
  a load-time scroll trigger can't measure them). `modules/aftercare.js` calls it on
  the first route pick so the steps stagger in instead of the stage fading as one
  flat block. Reduced-motion / empty inputs no-op.
- **Scroll reveals** (the registry above, the generic `.reveal` + `.reveal-d1/2/3`
  stagger classes) fade/blur content up as it enters the viewport. Most inner-page
  content is tagged `.reveal` in the markup; it's also FOUC-guarded and grouped in
  `motion.css`.
  - **The generic `.reveal` handler is above-the-fold-aware** (same split as
    `revealGroup`): an element already in the first viewport on load plays an
    **on-load** reveal, while one below the fold reveals on its own scroll trigger.
    This matters because a `from()` + ScrollTrigger whose `start` is *already passed*
    when it's created doesn't animate — ScrollTrigger resolves it straight to the end
    state, so an above-the-fold element would otherwise just appear with no blur-fade
    (the "blur fade-in broken on load" on inner pages — worst on 404 / enquiry-received
    / per-piece pages, whose whole entrance is this path). The on-load reveal sidesteps
    that, matching the home hero / `revealGroup`.
  - **`.reveal-d1/2/3` is a *fixed delay* on whichever path the element takes** — the
    on-load stagger for a first-viewport block, or a delay after its own scroll
    trigger fires below the fold. Either way it only reads as a *cascade* for a group
    that enters *together* (a same-row grid like About's credentials / studio tiles,
    or a small block that's all in the first viewport on load, like the
    confirmation / 404 / per-piece headers). **Do not put `.reveal-d*` on a long
    *vertical* list whose items each get their own scroll trigger** (the FAQ accordion,
    the legal-page sections): there the items cross the line one at a time, so the
    delay isn't a cascade — it just makes the lower items *lag* (sit invisible past
    their reveal point and blur in late, or not visibly at all). Those use plain
    `.reveal` so every item blurs to focus cleanly on its own trigger.
- **The filter bar** (portfolio / flash) cascades its chips + controls in between
  the header and the grid (children only — the sticky `.filter-bar` itself is left
  untouched so `position: sticky` keeps working).

## Full-page loader (`build/loader.js` + `modules/loader.js`)

Why it exists: both the Google-Fonts stylesheet and the bundled `main.css` are
render-blocking, and the fonts ship `display=swap`. On a slow **cold** load that
means a blank hold, then content paints in fallback fonts and visibly reflows when
Fraunces/Karla swap in (the reported iPad flash). The FOUC guard only covers the
GSAP *entrance* elements, not whole-page CSS/font arrival — so the loader covers the
whole page from first paint.

- The critical `<style id="page-loader-css">` is **inline in `<head>`** (so it
  applies before `main.css`/fonts) and CSP-safe via `style-src 'unsafe-inline'`. The
  overlay markup is injected right after `<body>`. The `pageLoader` Vite plugin does
  this site-wide; `piece-page.js` carries its own copy for the per-piece pages (both
  inserts are idempotent).
- The mark plays a single **ink-rise draw** on load (`pl-draw`: a clip-path wipe
  from the base up, as if the calligraphy is being laid down), then settles into a
  gentle compositor **opacity breathe**; the word fades up under it. See *Brand-mark
  ink-rise* below for why a clip-path works here where the old per-path
  `stroke-dashoffset` draw didn't, and how the cover masks its cost.
- Dismissal and `pageReady` are described in the coordination spine above.

### Brand-mark ink-rise (the shared logo "draw")

The calligraphic brand mark (`src/build/favicon.js`, one **filled** `<path>`) appears
in three motion contexts, all sharing a single **clip-path wipe from the base up**:

- **Preloader** — draws on the **cold** load, then breathes (above).
- **Nav logo** — draws **only on a cold first load** (`html.cold-start`, set by
  `modules/loader.js`), hung off `.motion-ready` so it reveals *as the cover lifts*.
  Warm in-session navs deliberately skip it — the page transition already carries the
  header, so re-drawing it every navigation would be busywork. No first-paint guard is
  needed: the cover is over the nav until `.motion-ready` flips.
- **Confirmation mark** (`/enquiry-received/`) — a one-time success flourish. A warm
  redirect has no cover, so it's clip-guarded from first paint (`html:not(.motion-ready)`)
  and drawn when the bundle flips `.motion-ready`, riding inside its `.reveal` block.

Why clip-path, not the hero sprig's self-ink: the mark is **one filled silhouette** —
there are no strokes to draw and no sub-parts to stagger, so `stroke-dashoffset`
can't apply at all. A clip-path `inset()` is a single **monotonic** reveal on one
element (no half-drawn per-path inconsistency — the old "two leaves, no stem" failure),
and on the cold load the cream cover hides any first-frame cost until it lifts. The
preloader keeps its **own copy** of the keyframe (`pl-draw`) because its CSS is
inline-critical and paints before `atmosphere.css` (which holds the shared `mark-rise`)
loads. All of it sits under `prefers-reduced-motion: no-preference`, so a reduced-motion
visitor simply sees the mark, shown complete.

## Page transitions (`atmosphere.css`)

`@view-transition { navigation: auto }` opts the whole site into **cross-document
View Transitions** — a soft cross-fade (old fades out 320ms, new fades in + small
upward settle 420ms). The key property is that it **overlaps** the old and new page
snapshots, so the page never empties to a blank frame between routes.

> ⚠️ This is why the transition is a View Transition and **not** a JS
> "fade-out → navigate → fade-in" engine. Across an MPA navigation a JS fade can't
> overlap old and new — it has to empty the current page to a blank screen *before*
> the next one paints, which reads as a flash. A JS engine was tried (to retract the
> rules on leave) and reverted for exactly this reason — see *Known follow-ups*.

Because the loader is **suppressed on warm navs**, the View Transition cross-fades
real content, not the cream cover. Browsers without cross-document View Transitions
simply hard-cut (progressive enhancement). Reduced motion disables the VT animations
for an instant, motion-free swap.

## Animated hairline rules (the `--rule-scale` switch + `.divider`)

Every thin divider on the site grows in from the left as the page builds: the
eyebrow's leading dash, the `.page-header` divider, the per-page border-replacement
hairlines (filter bar, FAQ item separators, contact rows …), and the reusable
`.divider` element.

They all read **one inherited custom property — `--rule-scale`** — toggled in a
single place by page state:

```
@property --rule-scale { syntax: '<number>'; inherits: true; initial-value: 1; }
html:not(.motion-ready) { --rule-scale: 0; animation: rule-failsafe 1ms linear 3s forwards; }
/* each rule: */  transform: scaleX(var(--rule-scale)); transform-origin: left center; transition: transform …;
```

So the motion logic lives in one spot, it's transform-only (compositor), and the
`@property` registration lets the 3s failsafe animate the variable back to `1` if
the motion layer never runs. On leave the rules just cross-fade out with the page
(via the View Transition).

**Borders can't be `scaleX`-animated**, so the named dividers are drawn as 1px
`::before`/`::after` hairlines (not `border-top`/`border-bottom`) and listed in the
"registry" in `atmosphere.css`.

## The CSP constraint that shaped all of this

The production Content-Security-Policy is `script-src 'self'` (`src/build/security.js`)
— **no inline scripts**. So none of this can use a tiny inline `<head>` script to
beat first paint; all JS runs from the bundled `main.js`. The hold-then-reveal steps
therefore lean on CSS that applies at first paint, with the bundle doing the reveal,
and a pure-CSS failsafe on each so a blocked/failed bundle can never strand content:

| Failsafe | Where | Fires |
|---|---|---|
| `motion-fouc-failsafe` | `motion.css` | 2s — reveals FOUC-guarded entrance elements |
| `rule-failsafe` | `atmosphere.css` | 3s — restores `--rule-scale: 1` (rules visible) |
| `pl-failsafe` | `build/loader.js` | 6s — removes the loader cover |

## How to add motion

- **A new section (eyebrow / heading / body)** → reuse the generic classes
  (`.eyebrow`, `.section-title`, `.body-text`/`.serif-note`) and it animates for
  free via the unified registry. If the page needs a bespoke header class, **add
  that class to the matching role in the registry** (`initScrollAnimations`) — and,
  only if it can sit **above the fold**, to the FOUC-guard list in `motion.css`.
  Don't hand-wrap it in `.reveal` *as well* — the claim guard already keeps the two
  from double-animating, but a redundant wrapper is noise.
- **A new entrance element / card cascade** → add it in `animations.js` (use
  `revealGroup` for a card/tile group on load, or a `.reveal` / `.reveal-d*` class
  for scroll-up content). For content a **module** reveals at runtime (hidden until
  an interaction), call the exported **`cascadeReveal`** from that module instead of
  relying on a load-time trigger. Add above-the-fold targets to the FOUC-guard list
  in `motion.css` so they don't flash before the reveal.
- **A new hairline divider** → no JS, no new state rule. Either drop a
  `<div class="divider">` (or `<hr class="divider">`) element, **or** draw a 1px
  `::before`/`::after` hairline and add its selector to the registry list in
  `atmosphere.css`. It inherits the grow-in / cross-fade-out automatically.

## Known follow-ups (deferred, not bugs)

- **Per-element rule "retract to the left" on leave.** The rules currently grow in
  on load and cross-fade out with the page. An earlier version retracted each rule
  leftward on leave, but it required a JS transition engine that emptied the page to
  a blank frame first (the flash). It can return as a **View-Transition-native**
  effect — `view-transition-name` on the rules + a `::view-transition-old(...)`
  retract animation — which animates the leaving snapshot without reintroducing the
  blank gap.
- **Below-the-fold dividers draw on load, not per-scroll.** Because the rules are
  driven by the page-level `--rule-scale` switch (flipped once at reveal), a divider
  far down the page finishes growing while still off-screen — so you don't *see* it
  draw as you scroll to it. Drawing them as they enter the viewport would mean a
  per-element (scroll-triggered) trigger instead of the global switch.
- **Cold-load entrance on a genuinely slow first visit.** The entrance is
  coordinated to begin as the cover lifts (`pageReady`), which is correct; it's only
  worth revisiting if profiling on real slow connections shows the cover lingering.
