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
#page-loader .pl-sprig{width:35px;height:60px;color:#4A5D3F;color:var(--moss,#4A5D3F)}
#page-loader .pl-sprig path{fill:currentColor}
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
// sprig is the brand mark — the same calligraphic sprout as favicon.svg, inlined
// (favicons can't be referenced here: the overlay must not race the network) at a
// coarser curve fit with slightly bolder weights so it stays compact and reads at
// 35×60px. It's shown fully
// formed at full opacity from the first painted frame, with only a gentle
// COMPOSITOR-only opacity breathe. A self-inking stroke-dashoffset draw was tried
// but is a MAIN-THREAD property that janks under load-time main-thread contention,
// and a staggered per-path draw renders mid-draw inconsistently on a quick cover —
// the reported "two leaves, no stem" flash (a delayed path with only `forwards`
// fill shows its default DRAWN state during the delay while the un-delayed stem is
// still hidden). Shown-complete + breathe reads right at any load speed and glimpse
// length.
export const LOADER_MARKUP = `<div id="page-loader" role="status" aria-label="Loading">
  <svg class="pl-sprig" viewBox="120 88 392 666" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M169 622C170 621 173 612 176 605C178 598 182 588 186 580C189 571 193 561 197 553C200 544 204 536 207 528C210 520 213 512 216 504C220 496 224 488 227 480C231 473 234 465 237 457C240 449 243 440 245 432C248 424 251 416 253 408C256 400 258 392 261 384C263 377 266 369 268 361C271 353 273 345 276 337C278 329 281 321 283 313C286 305 288 298 291 291C293 284 296 278 299 272C302 265 306 259 309 253C312 247 316 241 319 235C323 229 326 223 329 218C332 213 334 208 337 203C340 198 343 193 346 189C348 184 351 179 353 174C355 169 356 163 357 158C357 153 357 148 356 143C356 138 354 134 352 129C351 125 349 121 346 117C343 114 340 111 336 108C333 105 329 103 324 102C320 100 316 99 312 98C308 96 304 96 299 95C295 94 290 94 286 93C281 93 276 93 271 93C266 94 261 94 256 95C251 96 246 98 241 100C236 101 230 103 225 106C220 108 215 111 210 114C205 117 201 120 196 123C192 127 188 131 185 136C181 140 178 145 175 149C172 154 169 159 167 164C164 169 162 174 160 179C158 184 156 189 155 194C153 200 152 205 151 211C150 216 149 221 149 227C149 232 149 237 149 242C150 247 151 252 152 257C153 262 154 267 156 271C157 275 159 279 161 283C163 286 166 290 168 293C171 296 174 299 177 301C180 303 183 305 186 307C189 309 193 310 196 311C200 311 204 312 208 312C212 312 216 312 219 311C223 311 227 310 230 308C233 307 236 305 239 302C242 300 244 297 246 294C249 291 251 288 252 285C254 282 254 278 255 275C255 271 255 268 255 264C254 260 253 256 252 253C251 249 249 246 247 243C245 240 242 238 239 236C236 235 232 233 228 232C225 231 221 231 217 230C214 230 211 230 208 231C205 231 202 233 199 234C196 236 194 238 192 240C190 242 188 245 186 247C185 250 184 253 183 256C182 259 182 262 182 265C182 268 183 272 184 275C184 279 185 282 186 285C188 289 189 292 191 296C193 300 196 304 198 307C200 311 203 314 205 317C207 320 209 323 211 326C214 328 216 330 218 332C220 334 222 335 224 337C226 338 228 339 229 341C231 342 233 343 235 345C237 346 239 347 241 348C243 349 245 350 246 350C246 350 245 350 246 349C247 348 251 344 251 343C252 341 249 342 248 341C246 340 244 339 243 339C241 338 239 337 238 336C236 335 234 333 232 332C230 331 228 330 227 328C225 327 223 325 221 324C219 322 217 320 215 317C213 315 211 312 209 309C206 306 204 302 202 299C200 295 198 292 196 288C194 285 193 282 192 279C192 276 191 273 190 270C190 267 190 264 190 262C190 259 190 257 191 255C192 252 193 251 194 249C195 247 197 245 199 243C201 242 203 240 205 239C208 238 209 238 212 237C214 237 218 237 221 238C224 238 227 239 230 241C233 242 236 243 238 245C240 246 241 248 243 250C244 253 245 256 246 259C246 262 247 266 247 269C247 272 247 274 246 277C245 280 244 282 243 284C241 287 239 289 237 292C235 294 233 296 230 298C228 299 226 300 223 301C221 302 217 302 214 302C211 303 208 303 204 302C201 302 198 301 195 300C193 299 190 298 188 296C185 294 183 292 181 290C178 288 176 285 174 282C172 280 171 277 169 273C168 270 166 266 165 262C164 258 163 254 162 249C161 245 161 240 161 236C161 231 162 227 162 222C163 218 164 213 166 208C167 203 169 198 171 193C173 188 175 184 177 179C179 175 182 170 184 166C187 162 190 157 193 153C195 149 198 145 202 142C205 139 208 136 212 133C216 130 220 128 224 126C229 124 233 122 238 120C243 118 247 117 252 116C256 115 260 114 264 113C268 113 273 113 277 113C281 113 285 113 289 113C293 114 297 114 300 115C304 116 308 117 311 118C314 119 317 121 320 122C322 123 324 125 326 127C328 128 329 130 330 133C331 135 333 138 333 141C334 144 335 147 335 150C335 153 335 157 334 160C333 163 332 166 330 170C328 173 326 177 323 182C320 186 316 191 313 196C310 201 307 207 304 212C300 218 297 223 293 229C290 235 286 241 282 248C279 254 275 261 272 269C269 276 266 283 263 291C261 299 258 307 256 315C253 323 251 331 249 339C247 347 244 355 242 363C240 371 237 379 235 387C232 395 230 403 228 411C225 419 223 427 220 435C218 443 215 451 213 459C210 467 208 475 205 483C203 491 200 500 197 508C195 516 192 524 189 533C186 541 184 551 182 560C179 569 177 580 175 588C173 597 171 606 170 612C169 618 168 624 169 622Z"/>
    <path d="M190 461C191 461 197 457 202 454C207 452 212 449 218 446C224 442 230 438 236 435C242 431 248 429 256 426C263 423 271 420 279 417C287 415 296 412 305 410C313 408 322 406 331 405C339 404 348 404 357 404C366 404 376 404 386 405C395 405 405 406 414 407C422 408 430 409 438 412C446 414 454 418 461 421C469 425 476 429 483 433C489 437 496 442 499 444C502 445 501 444 499 442C496 439 489 434 483 429C477 425 469 419 462 415C455 410 447 406 439 402C431 399 422 397 413 395C404 393 394 391 384 390C374 389 364 388 354 388C345 388 335 389 326 390C317 392 307 394 298 397C289 400 281 403 272 406C264 409 256 413 249 416C242 419 235 423 229 426C222 430 216 434 211 438C205 443 201 448 198 451C194 455 190 460 190 461Z"/>
    <path d="M250 471C250 472 260 477 266 482C273 487 282 493 290 499C299 504 308 510 317 514C327 518 336 520 345 521C355 522 364 521 374 520C384 519 394 516 403 514C412 511 421 508 429 504C438 500 446 496 453 491C461 486 469 480 476 474C483 469 489 461 493 457C497 452 502 447 501 447C499 447 491 453 485 458C479 462 471 467 464 472C456 477 449 483 441 487C434 491 426 493 418 496C410 499 400 501 391 503C382 505 373 507 364 508C355 508 347 509 338 508C330 508 322 506 313 502C304 499 294 494 285 489C277 485 268 479 262 476C256 473 249 470 250 471Z"/>
    <path d="M256 464C257 464 267 464 274 463C282 463 291 462 301 462C310 461 320 461 329 460C338 460 347 459 355 459C364 459 373 459 382 458C391 458 400 457 408 457C416 456 424 456 431 455C438 454 444 453 450 453C456 452 462 451 467 450C472 450 476 449 480 448C483 448 487 447 486 447C486 447 480 447 476 447C472 448 467 448 462 448C457 449 451 449 444 449C438 449 432 450 424 450C417 450 408 450 400 451C392 451 382 452 373 452C365 453 356 453 347 454C338 455 330 456 320 457C311 458 301 459 292 460C283 461 274 462 268 463C262 463 255 464 256 464Z"/>
    <path d="M162 428C161 429 157 438 153 445C150 452 144 461 140 470C137 479 132 489 130 498C127 507 126 516 127 526C127 535 130 546 133 556C135 565 139 576 142 584C145 592 148 603 149 605C150 607 149 601 147 595C146 589 143 579 142 569C140 560 137 549 137 539C136 530 135 522 136 513C137 504 139 495 141 486C144 477 147 467 150 459C154 450 158 441 159 436C161 431 163 426 162 428Z"/>
    <path d="M172 545C171 547 167 557 163 566C160 574 154 585 150 596C147 606 142 618 141 629C139 640 140 651 142 661C145 672 152 684 157 694C163 705 171 716 176 725C182 733 189 745 191 747C193 749 190 743 187 736C183 729 177 717 172 707C168 697 162 684 159 674C155 664 153 655 152 645C151 635 153 625 154 614C156 604 159 592 162 582C164 571 168 560 170 554C171 548 173 543 172 545Z"/>
    <path d="M257 531C255 531 255 540 253 546C251 551 250 558 248 564C246 570 243 576 240 582C237 588 234 593 230 599C225 605 219 612 212 619C206 625 198 632 192 638C186 643 178 651 178 654C177 656 182 653 187 650C192 648 201 642 209 637C216 632 225 625 232 619C239 614 246 608 251 602C256 596 260 588 263 582C267 575 269 567 272 561C274 555 278 547 277 545C276 543 267 549 263 547C260 545 259 532 257 531Z"/>
  </svg>
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
