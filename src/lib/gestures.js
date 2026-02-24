// Touch gesture handler: pinch-zoom, two-finger pan, double-tap to fit, mouse wheel zoom

export function setupGestures(element, callbacks) {
  let lastTapTime = 0
  let lastDist = 0
  let lastMidX = 0
  let lastMidY = 0
  let isTwoFinger = false

  function getTouchDist(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
  }

  function getMid(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    }
  }

  element.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTapTime < 280) {
        callbacks.doubleTap?.()
      }
      lastTapTime = now
      isTwoFinger = false
    } else if (e.touches.length === 2) {
      isTwoFinger = true
      const mid = getMid(e.touches[0], e.touches[1])
      lastDist = getTouchDist(e.touches[0], e.touches[1])
      lastMidX = mid.x
      lastMidY = mid.y
    }
  }, { passive: true })

  element.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2) return
    e.preventDefault()
    const mid = getMid(e.touches[0], e.touches[1])
    const dist = getTouchDist(e.touches[0], e.touches[1])
    const scale = dist / Math.max(lastDist, 1)
    const dx = mid.x - lastMidX
    const dy = mid.y - lastMidY
    callbacks.pinchZoom?.({ scale, dx, dy, cx: mid.x, cy: mid.y })
    lastDist = dist
    lastMidX = mid.x
    lastMidY = mid.y
  }, { passive: false })

  // Mouse wheel zoom (desktop)
  element.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL
      ? e.deltaY
      : e.deltaY * 30
    const scale = delta < 0 ? 1.08 : 1 / 1.08
    callbacks.pinchZoom?.({ scale, dx: 0, dy: 0, cx: e.clientX, cy: e.clientY })
  }, { passive: false })
}
