// Reusable inline newsletter-capture band.
//
// Injected at the `<!-- newsletter:inline -->` marker (see vite.config.js) on the
// pages that should carry a signup surface — homepage, flash, and the post-enquiry
// confirmation — so the "drops land on the newsletter first" promise actually has
// somewhere to capture. One source here keeps all instances identical.
//
// Behaviour is wired by src/js/modules/newsletter.js, which drives every
// `form[data-newsletter]` on the page (email + consent → the Resend function).
// Reuses the `.signup-*` classes from pages/newsletter.css; layout is in
// components/newsletter-band.css.
//
// Copy is intentionally placeholder (marked COPY) — tune per launch.
export function renderNewsletterInline() {
  return `
<section class="newsletter-band" aria-labelledby="nl-band-title">
  <div class="newsletter-band-inner">
    <div class="newsletter-band-copy">
      <p class="eyebrow">The newsletter</p>
      <!-- COPY: inline newsletter band heading + subhead -->
      <h2 class="newsletter-band-title" id="nl-band-title">New work &amp; flash, <em>before anywhere else.</em></h2>
      <p class="newsletter-band-sub">Drops, fresh flash and the occasional studio note, in your inbox before they go up on Instagram.</p>
    </div>

    <form class="newsletter-band-form reveal" data-newsletter data-nl-success="#nl-band-success" novalidate>
      <div class="newsletter-band-row">
        <div class="signup-field">
          <label class="signup-label" for="nli-email">Email</label>
          <input class="signup-input" type="email" id="nli-email" name="email"
                 autocomplete="email" placeholder="you@example.com" required />
        </div>
        <button type="submit" class="btn btn-primary signup-submit">Subscribe</button>
      </div>

      <!-- Honeypot — leave empty; bots fill it and get silently dropped. -->
      <div class="signup-hp" aria-hidden="true">
        <label for="nli-company">Company</label>
        <input type="text" id="nli-company" name="_gotcha" tabindex="-1" autocomplete="off" />
      </div>

      <label class="signup-consent" for="nli-consent">
        <input type="checkbox" id="nli-consent" name="consent" required />
        <!-- COPY: confirm the consent wording with your privacy policy. -->
        <span>I'd like to receive emails from Beansprout and agree to the <a href="/privacy/">privacy policy</a>.</span>
      </label>

      <p class="signup-feedback" data-nl-feedback role="alert" hidden></p>
    </form>

    <div class="signup-success newsletter-band-success" id="nl-band-success" tabindex="-1" hidden>
      <div class="signup-success-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>
      </div>
      <h3>You're <em>on the list.</em></h3>
      <p>Thanks for signing up, keep an eye on your inbox. <span data-already hidden>(Looks like you were already subscribed; you're all set.)</span></p>
    </div>
  </div>
</section>`
}
