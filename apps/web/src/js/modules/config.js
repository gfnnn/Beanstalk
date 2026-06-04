// Shared front-end config.
//
// The Cloudflare Worker both the enquiry form and the flash-claim form POST to.
// Defaults below point at the project's Worker on the `harrisonfisher1990`
// workers.dev subdomain; override per-build with VITE_ENQUIRY_FN_URL (e.g. the
// local `wrangler dev` URL, http://localhost:8787/enquiry). See .env.example.
export const ENQUIRY_FN_URL =
  import.meta.env.VITE_ENQUIRY_FN_URL ||
  'https://beansprout-forms.harrisonfisher1990.workers.dev/enquiry'

// The Worker route the newsletter signup form POSTs to — adds the subscriber to a
// Resend Audience. Override with VITE_NEWSLETTER_FN_URL.
export const NEWSLETTER_FN_URL =
  import.meta.env.VITE_NEWSLETTER_FN_URL ||
  'https://beansprout-forms.harrisonfisher1990.workers.dev/newsletter'

// Read-only route the flash grid calls on load to reflect live availability (a
// piece claimed since the last build). Override with VITE_FLASH_STATUS_FN_URL.
export const FLASH_STATUS_FN_URL =
  import.meta.env.VITE_FLASH_STATUS_FN_URL ||
  'https://beansprout-forms.harrisonfisher1990.workers.dev/flash-status'
