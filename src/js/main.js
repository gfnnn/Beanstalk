import { initNav } from './modules/nav.js'
import { initScrollReveal, initHeroBg } from './modules/gallery.js'

document.addEventListener('DOMContentLoaded', () => {
  initNav()
  initScrollReveal()
  initHeroBg()
})
