// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderer: business/operational copy → inline HTML text
// ─────────────────────────────────────────────────────────────────────────────
// Imported by vite.config.js. The generated-grids plugin replaces the
// `<!-- reply-time -->` marker (on /enquire/ and /enquiry-received/) with this
// output in dev + build, so the enquiry turnaround promise is authored once in
// src/data/business.js and can never drift between the two pages.
import { esc } from './html.js'

// The enquiry reply-time phrase for the marker, authored in src/data/business.js
// (`replyTime`). Trimmed + escaped like every other rendered string. It sits mid-
// sentence ("…usually <reply-time>."), so falsy/blank → '' would leave "usually ."
// — keep replyTime a non-empty phrase per the data file's note.
export function renderReplyTime(replyTime = '') {
  return esc(String(replyTime ?? '').trim())
}
