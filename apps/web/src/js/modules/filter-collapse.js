// Collapse the filter bar behind a "Filters" toggle — mobile only.
//
// On a narrow screen the portfolio / flash filter bar (chips + selects) covers a
// big slice of the grid, so it starts COLLAPSED (the CSS default on mobile),
// showing just a full-width "Filters" trigger — with the active-filter summary
// kept visible alongside, so applied filters aren't hidden. This wires that
// trigger: tapping it toggles `.filters-open` on the bar to reveal / hide the
// controls. It's deterministic — a tap, not inferred from scroll — so unlike a
// scroll-driven auto-hide it can't flicker on mobile browsers whose dynamic
// toolbar perturbs the scroll position.
//
// Desktop: the trigger is hidden (CSS) and the full bar always shows, so this is
// a no-op there; it also clears the open state if the viewport grows past the
// breakpoint, so a stale `.filters-open` can't linger. No-ops when the bar or its
// trigger is absent — without JS the bar simply stays open and fully usable.
const MOBILE_MQ = '(max-width: 639px)'

export function initFilterCollapse(filterBar) {
  if (!filterBar) return
  const toggle = filterBar.querySelector('.filter-toggle')
  if (!toggle) return

  const mobileMq = window.matchMedia?.(MOBILE_MQ) ?? null

  const setOpen = open => {
    filterBar.classList.toggle('filters-open', open)
    toggle.setAttribute('aria-expanded', String(open))
  }

  toggle.addEventListener('click', () =>
    setOpen(!filterBar.classList.contains('filters-open'))
  )

  // Growing past the mobile breakpoint clears the open state (desktop shows the
  // full bar regardless; a leftover `.filters-open` shouldn't carry over).
  mobileMq?.addEventListener?.('change', e => { if (!e.matches) setOpen(false) })
}
