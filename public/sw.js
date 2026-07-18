const CACHE = 'canopy-static-v2'
const STATIC_ASSETS = ['/manifest.webmanifest', '/canopy_favicon_no_bg.ico', '/canopy_logo@2x.png']

// Cache essential app shell files on install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'Canopy', {
      body: data.body || '',
      icon: '/canopy_favicon_no_bg.ico',
      badge: '/canopy_favicon_no_bg.ico',
      data: { url: data.url || '/app' },
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const target = e.notification.data?.url || '/app'
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(target)
          return c.focus()
        }
      }
      return clients.openWindow(target)
    })
  )
})

// Only cache public static assets. Document HTML can contain private workspace
// data and must never be persisted in the shared service-worker cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  if (!STATIC_ASSETS.includes(url.pathname)) return

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
