/** PWA bootstrap: service worker registration + file_handlers + share_target intake. */

const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + '/'

function dispatchOpenFile(file: File) {
  window.dispatchEvent(new CustomEvent('editor:openFile', { detail: { file } }))
}

async function consumeSharedImage() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('shared') !== '1') return
  try {
    const cache = await caches.open('darkroom-share')
    const res = await cache.match('/shared-image')
    if (!res) return
    const filename = decodeURIComponent(res.headers.get('X-Filename') || 'shared')
    const blob = await res.blob()
    const file = new File([blob], filename, { type: blob.type || 'image/*' })
    await cache.delete('/shared-image')
    dispatchOpenFile(file)
  } catch {
    // ignore
  } finally {
    url.searchParams.delete('shared')
    window.history.replaceState({}, '', url.toString())
  }
}

function consumeLaunchQueue() {
  const lq = (window as any).launchQueue
  if (!lq || typeof lq.setConsumer !== 'function') return
  lq.setConsumer(async (params: any) => {
    if (!params?.files?.length) return
    for (const handle of params.files) {
      try {
        const file: File = await handle.getFile()
        dispatchOpenFile(file)
        break // only one at a time
      } catch {
        // ignore
      }
    }
  })
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${BASE}sw.js`, { scope: BASE })
      .then(reg => {
        // Take update as soon as a new worker is installed
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage('skipWaiting')
            }
          })
        })
      })
      .catch(() => {})

    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  })
}

export function registerPwa() {
  registerServiceWorker()
  consumeLaunchQueue()
  consumeSharedImage()
}
