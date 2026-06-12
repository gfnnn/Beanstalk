// ─────────────────────────────────────────────────────────────────────────────
// Build-time: the full-page preloader (overlay + its inline-critical CSS)
// ─────────────────────────────────────────────────────────────────────────────
// Why this exists: both the Google-Fonts stylesheet and the bundled main.css are
// render-blocking, and the fonts ship `display=swap`. On a slow connection (the
// reported iPad case) that means a blank hold, then content paints in fallback
// fonts and visibly reflows when Fraunces/Karla swap in — and in the Vite dev
// server, where CSS is injected by JS, it's a full flash of unstyled content. The
// motion.css FOUC guard only covers the GSAP *entrance* elements, not whole-page
// CSS/font arrival.
//
// Fix: cover every page from the very first paint with a cream overlay carrying a
// small sprig mark, then fade it out once the page is genuinely ready
// (src/js/modules/loader.js dismisses it on document.fonts.ready). The styling is
// INLINE-CRITICAL in <head> on purpose — it must apply before main.css loads — and
// is CSP-safe because style-src allows 'unsafe-inline' (src/build/security.js).
// No inline <script> is used (script-src is 'self'); the bundle does the dismissal,
// and a pure-CSS failsafe animation reveals the page if that bundle never runs.
//
// Wired site-wide by the `beansprout-page-loader` plugin in vite.config.js (dev +
// build) for the normal pages, and emitted directly into the per-piece pages by
// src/build/piece-page.js (which bypass Vite's HTML transforms). Both inserts are
// idempotent — see injectPageLoader's guards.

// The inline-critical stylesheet. Palette custom properties (--bg, --moss,
// --ink-rgb) are injected into the same <head> by the palette plugin, so they
// resolve here; each still carries a hard-coded fallback so the overlay is never
// the wrong colour even if that block is missing (e.g. a hand-rendered page).
export const LOADER_STYLE = `<style id="page-loader-css">
#page-loader{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#F7F1E3;background:var(--bg,#F7F1E3);opacity:1;visibility:visible;transition:opacity .45s ease,visibility .45s ease;animation:pl-failsafe 1ms linear 6s forwards}
html.page-loaded #page-loader{opacity:0;visibility:hidden;pointer-events:none}
#page-loader .pl-sprig{width:35px;height:60px}
#page-loader .pl-word{font-family:'JetBrains Mono',monospace;font-family:var(--mono,'JetBrains Mono',monospace);font-size:11px;letter-spacing:.3em;text-transform:lowercase;color:#5b574d;color:rgba(var(--ink-rgb),.5)}
@media (prefers-reduced-motion:no-preference){
#page-loader .pl-sprig{animation:pl-breathe 3.2s ease-in-out infinite}
#page-loader .pl-word{animation:pl-pulse 3.2s ease-in-out infinite}
}
@media (prefers-reduced-motion:reduce){#page-loader{transition:none}}
@keyframes pl-breathe{0%,100%{opacity:1}50%{opacity:.82}}
@keyframes pl-pulse{0%,100%{opacity:.4}50%{opacity:.72}}
@keyframes pl-failsafe{to{opacity:0;visibility:hidden;pointer-events:none}}
</style>`

// The overlay itself. role="status" + aria-label announces "Loading" once; the
// sprig is the brand mark — the same artwork as the favicons, inlined as a small
// moss-tinted PNG data URI (the overlay covers the very first paint, so it can't
// reference a network asset; the tint is baked in rather than CSS-masked so an
// old browser can never show a solid rectangle). It's shown fully
// formed at full opacity from the first painted frame, with only a gentle
// COMPOSITOR-only opacity breathe. A self-inking stroke-dashoffset draw was tried
// but is a MAIN-THREAD property that janks under load-time main-thread contention,
// and a staggered per-path draw renders mid-draw inconsistently on a quick cover —
// the reported "two leaves, no stem" flash (a delayed path with only `forwards`
// fill shows its default DRAWN state during the delay while the un-delayed stem is
// still hidden). Shown-complete + breathe reads right at any load speed and glimpse
// length.
export const LOADER_MARKUP = `<div id="page-loader" role="status" aria-label="Loading">
  <img class="pl-sprig" alt="" aria-hidden="true" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGoAAAC0CAMAAABLy0n6AAAC/VBMVEVMaXFKXj9KXT9LXkD///9KXT////////////////9MX0BLX0BLXkBMYEH///+awoP///////9Vakj///////////9RZkWbw4RUaUdNYUH///9WbUr///////////////+l0IxQZUT///+kzov///9qhVqIq3RQZET///9PZET///9NYUJPY0NOYkL//+xSZ0b///9NYEH////A8aNVa0j///////9Zb0ut2ZP///////9SZ0WTuX1ZcEz///9XbUpzkWL////G+almgFf///9bck1ddU9TaUdUakhbc03///5yj2H///9PZEP///uizIr///94mGb1/9CDpXCRtnuSt3xOY0OBom5MYEFtiV1jfVX///9mgFa15JpOYkL///9Xbkr//9xTaEdWbElNYUJack3N/66r15Lr/8j///+m0Y6Co26y35d4l2b///+Ep3Fuil3C9KVifFT///////9vi15geVJed1BfeFFacUz///9geFGNsnh6mWj//+hqhVqYv4FngVd7m2n///////9phFn//+Jlf1ZhelL///////9xjmBjfFRzkGHj/8GKrnaMsHf///+o04///////+Vfd1H////7/9Z/oGxwjmD//+/E96dTaEb///e56J1og1hwjV9WbEl3lmX///+fyIhhelNSaEbe/718nGn///////91lGTb/7r///+66p9edlCOs3mHqnOhyon////u/8uex4f///P///90kmNQZUS+76Lo/8Zie1P///9RZkVngliVvH////9rh1tog1lcc05tiVyUun6DpG/4/9PU/7RYb0v////////Y/7iGqXLK/6x5mWf////m/8P////////I/KqdxYVVa0mz4ZnW/7Z8nWqq1ZCFqHGJrXWLr3eAoW1Ybkv///9kflWZwIL//9nR/7K35pt9nmuu25RkflWQtXrg/79ZcExvjF///9/P/7D///+87aDx/83///+w3ZZ1k2NcdE5ddU92lWX///9+n2tsiFxcdE9rhltKXT+m2G2iAAAA/nRSTlMA/P37Av4FAwEE+Pn69wZ6Bw/eDQkR6Hng9BrZIjkOC3LqJ3MMsorrEuwb8u7wROU29SRi3SET1G0sNeaA0gjYoy9fuBXPyeHfzj+lHu1AdCmcTY+Cge+S9qy9Hblo8TzXSeLb89BcblA4cZFqnSOOq2G/Ci2qw8fF0RjEhZpFsXy3mTM+s0e6wiYqpr6kU4iGNHAZRsYUS5SnQ2DjQWa1qNqeFnbB5FWYOhygVi5lyISLdSBPd0IoouljUcAr57Z+Ma+0za1/kExZ1RA3V4xdmz1SMDteeNxpWJdvjYmHk9YlvHtKWmeWbLuDVNOpSFsfZE4Xa6HMyp8yla7LsNtfSvMAAAAJcEhZcwAAA+gAAAPoAbV7UmsAABFQSURBVHjavVx3fBTl1j67O7szk2xCeiMBAoQQkkBCCSVU6b1JL9KlCNJ7RwGlSRdFqoCAoFIEFVQEG2D32r32a9f73fvd/n3P7573nd1k0zazmx3mD/1l3Z1nTnlPec4ZiSq6NF3lf1D9Oz569cj8MDgx4fr+jC2zWor/pGoUukvR+W71x35+bSicztEHZ49cEJPPcIBzyd1jaxKFDExjoLrvbsoC3PMT71msi8/0lOO/jarXMYsBx22bQ4oaEiRVoZRqXfmeC/ad8AipeKWo/9zL4UDCU9GkV10wft74QYNZoANpitCkqsl7aoqq6rrC5pt7KAxIekg8URVF0mjW8yzRC/8iTdOVcrxFoytfswVfZPSqWYkuzIcN7QYwaAXmEJ8/OwFYEU1VwNJUOpYPhN0eVyGQR8eXxwDXUylo52CN3A4HnrhSqYPpVLAQqF4QrFwaRd3LSPV0E8dGpZo/AkdqUlB+qGmRHWHPmexXd75YLNe6yKCwVOoJR+4Ucmkmv769KfBmMOZS6RXYs9aQy/wP3rHZ0DBwLJ1ugy03j/RAfvIgsKhGoCpUaEYO3O8EgiR+k2tH60DFUugFoE5ASEKFX8A5+ERgYqmsPowM9JQodN9QO6YFJJZGnZKQc1/AB1Khl+Ec3SsQsXR6AKgWoPqkMs4hHFOpbQBCNchEUqfAT6NGNxoBXwegDVUItS9wocQvf4Xd3cw0lkaLn8GHdYMJMTq1YA0+Z9oxdLoT+N+gEoJKfRhqdQAK+QcaxQcVN7l66w3MNvtblXoAnwWX5TRyVQfGmY3vKocyR4cgk5xKGbDZ7zf3a36w5rgWbOZW6V64kWZOJypNceLJ0oZVdXMFrE4D2S9MQulUC3i/xHdVo5w0U+jpVI2h7jErVX/sjfO1K5eybd/ffEc0KZqJXy9jqDvMOlVn7Pc1q0qtHvvQ7nQmTN9VubUVWmXaVhpFHkRPH1Pp9DRk02HH9ZTKnJiLrBiuULea8kDOOQ60KIZSqGUhhi7r++hnWTZ0cVWCpVBjLuCz6ps6VwrVduDZIij+8ygm9hHVZ+p44NNKNKPSa6y/bi6zUDYfKI1GwvkOReq6i5qNQ7dKakqdWiMMHc2dYIUaDC5WoEoPicQvCzQXfQf8wX8kFSVJGAaZDredcbIY6gDwg+cvjRZgmF8NahTdiBX4hkkoha4iw6MBjebsRURjz18iuYzzq0ERqe3IbmAy2upc1Y7z1I0q3QQ6e38obpTut6LUaRDrL8NsqFbpDuA3Q08qDQDe9upMoWa2nFh/UBrt5Fhx2qypZGRfZtxePCUe8P6SjxgS/CmQvZd78NwGprOqTueRYHxdpz8Ck71SiWx+rz+30Kkv62+I+ayq0YhM3C1FkVDLvT/VaSVq+VdOF9hsVwKqzabCkSbuKRX4UNFTqr/Yz/q5j0KtuMnMCCR/c8zsgu7xDCTdwtsx6fQGXvWnHJWGMNT7AZUKCl3OxRImWHRKA3Z4vTG+a0K0H4trFH8UJfOPKRU+koxFc7ndjhtvRCkmMGgeXvMvVBOOFDsCLbUYKxPZiTU0OoQVHGy5sNh+CXdVcmAWAJcCLx+5ib4KHF154ziyOrFOos9k43G/SCp9y5YKohUWdcS7beB0zM7Bybs+GG7DyNr+76JwWYb+QVWqTMBEPt3zeckvIv2xrYIF8ovE8SwrNTiKRBZjcTfzvsfCBkzMKUolXtsROB88yaQK36N/i/47SqvEts8BE12kVYU700UNf7KmZFX9nKkaY+A+TlVkH7mCaeFM/5j8GUunesBAqjKByxDNViDprhoV2kul3ziF1qUQ8NJ8gtccQfqftPI5U+YeYuDMo5Cw0oJ63J2E9eU31CrTFVwmhYb/lmA1NyAzrRwsF3cfWKKEcITArrgF18uWMToNcDqHrqmq95WKVW3/4VvOe7VXu9AZDHVTSdXRBDNLPb1CBdxoz9dJCymUQhdwreQ9Nc21H7bRLUOqPoNbRJcSUJqireDKb3PIvK8Y6itPKeXbZUdUmjKDYgrWluyodXqRC79aoUfiAzSzs6/+RDsfhsSQIyl6JFe3T/sIZSBVs0AmhdJsg8ognQ89kvLR9xe//L0UUriwkxZyoXat3dHW5/TolMhIP1igPW/i8kVy40++SJoiLi0EQmq+eVEiOR/2Imm+bJemh3JOLOzkcHtLUEX+S70xYm7emvtPRBXNkUOFZIsYYCAJYdum9T3QvTDbxkVjfszsz3fXN8mzmUNKbijZDJGeOwzsJkmo4ss2e1Js8GBaUZZV2U4Ot4HEVsm7amMgJyKaH7rzdIfa/S70m/zD9KYYuvosmzAIMJ8ZoIvZizA0MZDor39zwmHH0IzHm0X6PlizlV2xoVcQ83Z++LpbDYbOxb1juBFh2fcnJyDcgaaJ26Xn8fRbXDwF52/q71bHwNgAtci3zNvTyAh/OvVJtqGvRFLoSdjDMHhfW1Fyl0rO4u+3crMnBbQiwQ3jXdw5vS1CBbd4+TacEdrjmvAkwt14KdW4b1nvUahuf8xODUAwhVazcb4WdK5KW5Md2CK9XKH2CLPbt/k5Q2zh5b0dLUyvYyhcjjPvIZoMhQ63A5NnwhlVepPzb+Y5cil+FdLpXvzY2JxgOpMYEVgqAjhTcJ2Bl2SYEz12OLrdV9ksl1cmViK7hWai+NDp4yIkSQ5ek+FdoQ4TnGj0VeWBnaPWuSxsvFCpYEx8D7YJQksTbv4mnN1SjUSirIfb3rAYSVN076WU7Fc0F93/fxj9kSdU+unQvgQek0g6zYIjvJXUhMoThgj8TxGlVtoDBXCxK+gUO50Vf9ivYGIiio1xmkQaa7PbN8u7a9SrtxOHDP0rcmulbsuPW1zctKn9nmmT+p3o5H0CzyMwRJNsFB7zE6l0ehQYIxsClY5PcON2Qw4xjcBBSaaL3yr3b8tIKg64ToQ1XThtVF6sZiQvRXrijFVABlOz5fs9M2EO5HQQD69SvwQ7NnnSBv3LbRcMj9yVST3fRWxQOZv2nJa4/NuxY9c2+eLiL41ECP5y9c8phsvrKq83/D4OYZ9Fy8ypUalynKK6A7eJ2yu0iw/UEx4yVaE9YA7NxRaM3J0RwTftunrS3KgSj1m/2dgtO8NgH7/68RTV01HXqNUIox8tr41VeVsFn8hoR5EbYe9d2+N8dMWNNlGsmOhRbZiATu+/u6bBPOiquIo9ImprrY48eizcsO14qvHJ8ZeSuy29WRBFkV+VUN+UcEysaRhqCAeMcx6HU+kxMIemRVcr5J2ihaMKOByqZX3Q85Gr5aiZe1m/g9NXney5rPUfVyUDOS90Xji5FL0yNM0w1ABGeqCI2D+RieGkN+F9rfD9y2Wo0ypKp7oRJA4/0mL6+hinTKETmterF9MzpYT6noXhcRrFsqHWe6suUSxl105bxBL9/6nKCxYW2Ht04w83a9WhVyzVGX/Ml5bgkzIGi+YY6tsCR/LlooHCriR8MoRttDONTGZZoU3dKBj4SI7p1oz0EoXeGWCsUB/bzO0o3vLQqQ7yn+Els9/J3CqQb4epRtLH9l8jS0ROnlp/iPaecDBfDHs079ej/g67ExdvBApklEIrBT2klHT01si5IHQmZi72Cd4JjCJiboTT/lwQQOJoXRTmL3V6Dx/lfRrpE3/OcnItoXqewFWPnciGfwclE23CT6U7FzFca7rL8In2QPe2hv506jUcXad+Mhr4mxpoD6Joygb8s3Tu54WLQq705JFqCLu9h3cY89A4rOAT0ZgD1s7agdVdnLt7YpVeulERSb67p/RnQnuTROIk/HA4PhDBk27w5lH+pxQAhaDQnGFoV2awzLO46hxmpVCnYY+QewZ8gj5H7jl5IviI1IpgCqafaYvp1KA70ueWeTaVJqGzWJnguoU31p6Up0vRhmBvK49ROf9cfgJITlTM1kIjqiP/kbJa0OgIT0qlUN8A6SmyLIsdifG1i2e4KmnbeJd0Zx//nK73hPRIQsTkso6kUB7aRUmhUtKBF/kbjHQJbUb4fpcVOmIYx8H2ZysLg6zytyI8ia+M/l7Fo4ZQzP2mHxYHIvYI2jQoKb+oxRs2B0a/UuCvu2Fr1l3Gj1QekpjtJi+WQo3gYmWQOAk1L+FgrzKaZsHaNmGG7vnEeJEvlPKqW/7wLzHA0NfLO4bCKd42hNrCo4cU4REZSGhZnmezMFGjkhhsaWNPyaL5Zg8RAnZc4uCSOaXcKlihYZhCouDangk+3pzdpiHnZgXBQbQb+zidRQzfN8MoPETC0OVmM++T3XkNTjs6ppR7AjUqyG9jSPcNbI73KJLPE45VHIb42eM2r2K7O/7+1ObLsd6PIzv1WLkxmY2ERqcr4MzFcEMkJ8693UTXEUmvV7KTKHu11KlLHByI3Qk/rpv3SuK0VR27Zxst8vg68RWdPZVOYgbrj8MQ0y27iZa7eamkknMqrK+l/qH9wfASrX74+EMNoyqs1fm0NvJwpkt4PTiOTjTFohLDdE1c5e/Wa67ar3/Tf+Hwne26LFnS8adPW6rk54QrdIoPlS4n+Q6sJNdVTLjiY1RP0JMDoDJoRasnUd5U4Y8DEn3vKam/T+CckMqEKS+p6L50VlR0jRrRevl0i6hXVOF97AiKt3KpuKEaliCURPULgQPUIxwvFxmKnzDuL+2b9s7MzFl09ak+fsdZpq6uBxhPZb9z8/T+FxT28lZlOsV/sLfI7E6sS6siud4AkyTUTKCpiIGziumxzc9wPWuTYI6wiDDmwavGrr+GsyL1bc8Blm51Fg3/VYruz1mSqaQuPafWeSmXk9WzVZ1N1Nkrzf8WR64eXZDtmUCoNGMiwhw4er6XdNP31g1vWeWJwcwVXv3N5qlUa2+bmPcMN7+jz8QaVJJnf6CK14JXRFQr4FJ5+ng0N/oulU6lcy8y/8+i8TX2c9SqM4vq0R7imPKaRfICJ143aiWKb84yPWgitwdyRbdZLNz6C9jc+Z5KnfdyjrBMZ0JDkRZfrbrLA7iImxqbZ1VFldOcbSHn7sfOEw/f2A2nDRs9htrBbNKQ0E8Jfm4t0u4bLJKN2Rb5ytUcfttkXshnYUStR4mNmFcFH/u85EDkftHBglAP+PiqNkXEivWc6vG90TN2yHc6n7ZAKKol6ur4BG4/jPmbyss3pYZ+obr6zuG7rxFlzkRVFtB5tqCW6E1c9VwswVtCf4kG4/MrSs5zQnfdJg7wUs5VNtHqKNQvDGPiLBGKlovyeBgfpPVGe1pPvBmgWoFEs8R9JzKU2NJnkrOrZULRPWyXeGa7HPfJWuYYMMoioegdruNTeSH4upGR5iFzsUVCUZxctQ3HdNnAjRjsXbW05FLpcU4ZonrRuZbGIxZCGcOWm9LVV6CNapX+JNRPcOb+VZSdBQlibkAWQg1hRliOdRrC/L59cFBMzQp+TudJWExNC/XHGHsMJlWjdV5K0DKoDcDPcryYhIetNBVDHZIm4hIW7sYWZN+StkpuLNqB09a6uvF24rg4kUuewh5LTcVQ0xATJVqE/QG/bRgw1EBRi3GHGFPqfRsLoD5jxXGBGZ8c0cBSr5Dzsf6i7myFGJelXiHfVJoloNbyKpul+pNQD4sSty+3ObrFUH3xnYC6u1xiMrRQH+Fbsdx7t/+d8pAEpsnidRqF3687a60DynU5qbnmSLUcqhUPKRiqem6stb4uimdjOy6musVIop/Hf24VlJq+Trie9VCMMjxbRKSYdpZDiUQl3myIaX4LoL5DH5atWxvLofh1Q6axXNR8ouVQ3AFnbWR+fXqS5VDiRdwE7h37d7UeSoyCeXj5wC2QimkRrCU69qH1UEyTJ7xI1K+z61YYa8Nwlu2JuRZHdgn1biEX0k/uth6Ka8Dqa4jeu916KPEySx0+xAMW3wrHOCU2D3WdrL8U+mBEFf/3QObF6nCPxYb6LzTOo47II6vKAAAAAElFTkSuQmCC">
  <span class="pl-word" aria-hidden="true">beansprout</span>
</div>`

/**
 * Add the preloader to a full HTML document: the critical <style> just before
 * </head>, and the overlay markup immediately after the opening <body>. Both are
 * guarded so a second pass (or a piece page that already rendered its own) never
 * doubles up. Function replacers are used so any `$` in the inserted strings isn't
 * treated as a regex back-reference.
 */
export function injectPageLoader(html) {
  if (!html.includes('id="page-loader-css"') && html.includes('</head>')) {
    html = html.replace('</head>', () => `  ${LOADER_STYLE}\n</head>`)
  }
  if (!html.includes('id="page-loader"') && /<body[^>]*>/.test(html)) {
    html = html.replace(/<body[^>]*>/, m => `${m}\n${LOADER_MARKUP}`)
  }
  return html
}
