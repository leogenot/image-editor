// Swipe gesture handler for mobile bottom sheet

export function setupBottomSheet(el: HTMLElement): void {
  const COLLAPSED_H = 240  // px when collapsed (shows content)
  const EXPANDED_H = Math.min(window.innerHeight * 0.65, 520)
  const SNAP_THRESHOLD = 10 // px — below this delta, treat as a tap

  const handleEl = el.querySelector<HTMLElement>('[data-handle]')
  const tabBarEl = el.querySelector<HTMLElement>('.flex.overflow-x-auto')

  // py-3 handle (24px pad + 3px bar ≈ 27) + py-3 tab row (≈ 44px) = 71px
  const measuredHandle = handleEl?.offsetHeight ?? 0
  const measuredTabBar = tabBarEl?.offsetHeight ?? 0
  const PEEK_H = measuredHandle > 0 && measuredTabBar > 0
    ? measuredHandle + measuredTabBar
    : 71

  const SNAPS = [PEEK_H, COLLAPSED_H, EXPANDED_H]

  let startX = 0
  let startY = 0
  let startH = 0
  let tracking = false   // finger is down on a drag target
  let dirLocked = false  // direction has been determined
  let isVertical = false // confirmed vertical (sheet drag) vs horizontal (tab scroll)

  function snapNearest(h: number): number {
    return SNAPS.reduce((best, s) => Math.abs(s - h) < Math.abs(best - h) ? s : best)
  }

  function setHeight(h: number, animate = false): void {
    el.style.transition = animate ? 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
    el.style.height = Math.round(h) + 'px'
  }

  setHeight(COLLAPSED_H)

  if (!handleEl) return

  const dragTargets = [handleEl, tabBarEl].filter(Boolean) as HTMLElement[]

  dragTargets.forEach(target => {
    target.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      startH = el.offsetHeight
      tracking = true
      dirLocked = false
      isVertical = false
      el.style.transition = 'none'
    }, { passive: true })
  })

  window.addEventListener('touchmove', (e) => {
    if (!tracking) return

    const dx = Math.abs(e.touches[0].clientX - startX)
    const dy = e.touches[0].clientY - startY

    // Lock direction after the first 4px of movement
    if (!dirLocked && (Math.abs(dy) > 4 || dx > 4)) {
      isVertical = Math.abs(dy) > dx
      dirLocked = true
    }

    // Horizontal swipe — let the tab bar scroll naturally
    if (!dirLocked || !isVertical) return

    // Vertical swipe — resize the sheet and block scroll
    const newH = Math.max(PEEK_H, Math.min(EXPANDED_H + 40, startH - dy))
    setHeight(newH)
    e.preventDefault()
  }, { passive: false })

  window.addEventListener('touchend', (e) => {
    if (!tracking) return
    tracking = false

    // Horizontal gesture — don't trigger sheet snap
    if (dirLocked && !isVertical) return

    const dy = startY - e.changedTouches[0].clientY
    const h = el.offsetHeight

    // Tap (tiny movement): cycle peek → collapsed → expanded → collapsed
    if (Math.abs(dy) < SNAP_THRESHOLD) {
      const current = snapNearest(h)
      if (current === PEEK_H) setHeight(COLLAPSED_H, true)
      else if (current === COLLAPSED_H) setHeight(EXPANDED_H, true)
      else setHeight(COLLAPSED_H, true)
      return
    }

    // Drag: snap to nearest of 3 positions
    setHeight(snapNearest(h), true)
  }, { passive: true })
}
