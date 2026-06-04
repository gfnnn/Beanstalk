// Build-time renderer: testimonials[] → homepage "Kind words" figures.
// Imported by vite.config.js; replaces the `<!-- testimonials -->` marker in
// index.html with this output, so the cards ship as static HTML from the single
// data source (src/data/testimonials.js). Reuses the shared HTML escaper.
import { esc } from './html.js'

export function renderTestimonials(items = []) {
  return items.map(t => {
    const credit = t.piece ? `${esc(t.name)} · ${esc(t.piece)}` : esc(t.name)
    return `    <figure class="testimonial">
      <span class="quote-mark" aria-hidden="true">"</span>
      <blockquote class="quote-text">${esc(t.quote)}</blockquote>
      <figcaption class="quote-credit">${credit}</figcaption>
    </figure>`
  }).join('\n\n')
}
