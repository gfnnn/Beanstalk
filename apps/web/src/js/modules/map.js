// Visit page — click-to-load studio map.
// The Google Maps embed shares the visitor's IP with Google and can set Google's
// cookies, so it is never loaded automatically: the page ships a placeholder with
// the address and a button, and the iframe is only created when that button is
// pressed (the press is the visitor's choice to load Google's content).
export function initMap() {
  const block = document.getElementById('studio-map')
  const btn   = document.getElementById('map-load')
  if (!block || !btn || !block.dataset.mapSrc) return

  btn.addEventListener('click', () => {
    const frame = document.createElement('iframe')
    frame.className = 'map-embed'
    frame.title = block.dataset.mapTitle || 'Map to the studio'
    frame.src = block.dataset.mapSrc
    frame.referrerPolicy = 'no-referrer-when-downgrade'
    frame.allowFullscreen = true
    block.replaceChildren(frame)
    frame.focus()
  })
}
