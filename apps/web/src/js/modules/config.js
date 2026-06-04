// Shared front-end config.
//
// The Netlify function both the enquiry form and the flash-claim form POST to.
// Set VITE_ENQUIRY_FN_URL at build time (see .env.example); the fallback string
// is here so you can also just hardcode the URL.
export const ENQUIRY_FN_URL =
  import.meta.env.VITE_ENQUIRY_FN_URL ||
  'https://beansprout.netlify.app/.netlify/functions/enquiry'

// The Netlify function the newsletter signup form POSTs to — adds the subscriber
// to a Resend Audience. Set VITE_NEWSLETTER_FN_URL at build time; the fallback
// mirrors the enquiry URL on the same Netlify site.
export const NEWSLETTER_FN_URL =
  import.meta.env.VITE_NEWSLETTER_FN_URL ||
  'https://beansprout.netlify.app/.netlify/functions/newsletter'

// Read-only endpoint the flash grid calls on load to reflect live availability
// (a piece claimed since the last build). Set VITE_FLASH_STATUS_FN_URL at build
// time; the fallback mirrors the other functions on the same Netlify site.
export const FLASH_STATUS_FN_URL =
  import.meta.env.VITE_FLASH_STATUS_FN_URL ||
  'https://beansprout.netlify.app/.netlify/functions/flash-status'
