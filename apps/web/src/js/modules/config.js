// Shared front-end config.
//
// The Cloudflare Worker both the enquiry form and the flash-claim form POST to.
// Set VITE_ENQUIRY_FN_URL at build time (see .env.example) to your Worker URL —
// https://beansprout-forms.<your-subdomain>.workers.dev/enquiry. The fallback
// below is only a placeholder: the workers.dev subdomain is account-specific, so
// the build MUST set VITE_ENQUIRY_FN_URL (the form stays inert until it does).
export const ENQUIRY_FN_URL =
  import.meta.env.VITE_ENQUIRY_FN_URL ||
  'https://beansprout-forms.workers.dev/enquiry'

// The Worker route the newsletter signup form POSTs to — adds the subscriber to a
// Resend Audience. Set VITE_NEWSLETTER_FN_URL at build time.
export const NEWSLETTER_FN_URL =
  import.meta.env.VITE_NEWSLETTER_FN_URL ||
  'https://beansprout-forms.workers.dev/newsletter'

// Read-only route the flash grid calls on load to reflect live availability (a
// piece claimed since the last build). Set VITE_FLASH_STATUS_FN_URL at build time.
export const FLASH_STATUS_FN_URL =
  import.meta.env.VITE_FLASH_STATUS_FN_URL ||
  'https://beansprout-forms.workers.dev/flash-status'
