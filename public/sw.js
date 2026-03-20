// Aura Messenger — Service Worker v5
// Network-first for JS/CSS (always fresh), cache-first for static assets
const CACHE = 'aura-v5';
const NETWORK_FIRST = ['/script.js', '/style.css', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.add(new Request('/manifest.json', { credentials: 'same-origin' })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/upload') ||
    e.request.method !== 'GET'
  ) return;

  const path = url.pathname;

  // Network-first for all app files — always fresh, fall back to cache
  if (NETWORK_FIRST.some(p => path === p) || path === '/') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const toCache = res.clone(); // clone BEFORE returning original
            caches.open(CACHE).then(c => c.put(e.request, toCache));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (icons etc)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const toCache = res.clone(); // clone BEFORE returning
          caches.open(CACHE).then(c => c.put(e.request, toCache));
        }
        return res;
      }).catch(() => null);
      return cached || net;
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const w = list.find(c => c.url.includes(self.location.origin));
      if (w) return w.focus();
      return clients.openWindow('/');
    })
  );
});
