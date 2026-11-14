// Homepage studio notices — hide a dated notice once its day has passed.
// The build already drops expired notices (src/build/homepage.js); this covers a
// page that was built before the date and is still being served after it.
export function initNotices(today = new Date().toISOString().slice(0, 10)) {
  const block = document.querySelector('.studio-notices')
  if (!block) return
  block.querySelectorAll('.notice-item[data-until]').forEach(item => {
    if (item.dataset.until < today) item.hidden = true
  })
  if (!block.querySelector('.notice-item:not([hidden])')) block.hidden = true
}
