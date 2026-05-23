// Aura Messenger — Service Worker v16
// Network-first for app shell files, cache-first for icons/static.
const CACHE = 'aura-v20';
const NETWORK_FIRST = [
  '/',
  '/index.html',
  '/app.html',
  '/landing.css',
  '/landing.js',
  '/i18n.js',
  '/boot.js',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(['/manifest.json', '/favicon.svg', '/aura-logo.svg', '/i18n.js', '/vendor/tabler-icons/tabler-icons.min.css', '/vendor/tabler-icons/fonts/tabler-icons.woff2', '/vendor/tabler-icons/fonts/tabler-icons.woff', '/vendor/tabler-icons/fonts/tabler-icons.ttf', '/feature-icons/chat.png', '/feature-icons/voice.png', '/feature-icons/call.png', '/feature-icons/ai.png', '/feature-icons/squares.png', '/feature-icons/browser.png']).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/upload')
  ) {
    return;
  }

  const shouldNetworkFirst = NETWORK_FIRST.includes(url.pathname);

  if (shouldNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => null);

      return cached || network;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((client) => client.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow('/app.html');
    })
  );
});
