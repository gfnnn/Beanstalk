// Shared front-end config.
//
// The Netlify function both the enquiry form and the flash-claim form POST to.
// Set VITE_ENQUIRY_FN_URL at build time (see .env.example); the fallback string
// is here so you can also just hardcode the URL.
export const ENQUIRY_FN_URL =
  import.meta.env.VITE_ENQUIRY_FN_URL ||
  'https://beansprout.netlify.app/.netlify/functions/enquiry'
