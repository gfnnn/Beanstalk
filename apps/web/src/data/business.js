// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS / OPERATIONAL COPY — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// Small operational facts that are repeated across more than one page and so
// must not be hand-edited per page (where they drift apart). They live here and
// are injected at BUILD TIME via markers, exactly like the flash `season` label
// and the homepage notices — edit the value here, never the rendered HTML.
//
// REPLY TIME — how long an enquiry typically takes to get a reply. Shown mid-
// sentence on BOTH /enquire/ ("…reply by email, usually <replyTime>.") and
// /enquiry-received/ ("…you'll get a reply…, usually <replyTime>."), so the two
// pages can never promise different turnaround times. The surrounding "usually "
// and full stop are authored in each page; this is just the duration phrase, so
// keep it a bare phrase ("within 3 days", "in 2–3 working days") with no leading
// "usually" and no trailing punctuation.
//
// TODO(roxy): "within 3 days" is a sensible placeholder default — confirm your
// real reply time here before launch. Changing it here updates both pages at once.
// ROXY-COPY · BUS-01 · pending approval — see docs/COPY-REVIEW.md
export const replyTime = 'within 3 days'
