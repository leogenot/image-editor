// Swipe gesture handler for mobile bottom sheet

export function setupBottomSheet(el: HTMLElement): void {
  const COLLAPSED_H = 240  // px when collapsed
  const EXPANDED_H = Math.min(window.innerHeight * 0.65, 520) // px when expanded

  let startY = 0
  let startH = 0
  let isDragging = false

  function setHeight(h: number, animate = false): void {
    if (animate) {
      el.style.transition = 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
    } else {
      el.style.transition = 'none'
    }
    el.style.height = Math.round(h) + 'px'
  }

  setHeight(COLLAPSED_H)

  const handle = el.querySelector<HTMLElement>('[data-handle]')
  if (!handle) return

  handle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY
    startH = el.offsetHeight
    isDragging = true
    el.style.transition = 'none'
  }, { passive: true })

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    const dy = startY - e.touches[0].clientY
    const newH = Math.max(160, Math.min(EXPANDED_H + 40, startH + dy))
    setHeight(newH)
  }, { passive: true })

  window.addEventListener('touchend', () => {
    if (!isDragging) return
    isDragging = false
    const h = el.offsetHeight
    const mid = (COLLAPSED_H + EXPANDED_H) / 2
    setHeight(h > mid ? EXPANDED_H : COLLAPSED_H, true)
  }, { passive: true })
}
