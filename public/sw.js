/* DarkRoom service worker — offline-first PWA shell */
const VERSION = 'v1'
const CACHE = `darkroom-${VERSION}`
const SCOPE = new URL(self.registration?.scope || './', self.location).pathname

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.ico',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })))),
    ).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})

/** Share target: POST with image → redirect to app with file stashed in Cache Storage */
async function handleShareTarget(request) {
  try {
    const form = await request.formData()
    const file = form.get('image') || form.get('file')
    if (file && file instanceof File) {
      const cache = await caches.open('darkroom-share')
      const res = new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': encodeURIComponent(file.name || 'shared'),
        },
      })
      await cache.put('/shared-image', res)
    }
  } catch {
    // ignore, still redirect
  }
  return Response.redirect(SCOPE + '?shared=1', 303)
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method === 'POST' && new URL(req.url).pathname === SCOPE) {
    event.respondWith(handleShareTarget(req))
    return
  }
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Navigation: network-first, fall back to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})
        return res
      }).catch(() =>
        caches.match(req).then(r => r || caches.match(SCOPE) || caches.match('./index.html')),
      ),
    )
    return
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req)
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          cache.put(req, res.clone()).catch(() => {})
        }
        return res
      }).catch(() => cached)
      return cached || network
    }),
  )
})
