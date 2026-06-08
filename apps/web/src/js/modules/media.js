// Hero media clips (homepage hero + About hero) — playback as progressive
// enhancement. The build (src/build/media.js) ships each clip WITHOUT autoplay,
// so no-JS visitors see only the poster. Here we:
//   • respect prefers-reduced-motion — never start a clip, and freeze a GIF to
//     its still poster where one was supplied;
//   • otherwise play a <video> only while it's on screen (and pause it off
//     screen) via one IntersectionObserver, to save battery/CPU.
// No-ops when there are no clips or the APIs are unavailable, so it's safe in the
// single shared bundle on every page.
export function initMedia() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // GIFs: under reduced motion, swap to the still poster if one was provided.
  if (reduce) {
    document.querySelectorAll('img[data-media-gif][data-poster]').forEach(img => {
      const poster = img.getAttribute('data-poster')
      if (poster) img.src = poster
    })
  }

  const videos = document.querySelectorAll('video[data-media]')
  if (!videos.length) return

  // Reduced motion: leave every clip paused on its poster.
  if (reduce) return

  // No IntersectionObserver → start them once (still muted/looping) and bail.
  if (!('IntersectionObserver' in window)) {
    videos.forEach(v => safePlay(v))
    return
  }

  const obs = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) {
        if (target.preload === 'none') target.preload = 'auto'
        safePlay(target)
      } else {
        target.pause()
      }
    })
  }, { threshold: 0.25 })

  videos.forEach(v => obs.observe(v))
}

// Autoplay policies can reject play() (it returns a promise) — muted inline
// playback is normally allowed, but swallow the rejection so it never throws.
function safePlay(video) {
  const p = video.play()
  if (p && typeof p.catch === 'function') p.catch(() => {})
}
