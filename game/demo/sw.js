// UNTITLED demo — service worker.
// Strategy: NETWORK-FIRST for the game itself (you always get the newest build
// when online; cache is the offline fallback). Cache-first for icons/manifest.
const VERSION = 'untitled-demo-v23';
const ASSETS = [
  './untitled-demo.html',
  './play-offline.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const isGame = e.request.mode === 'navigate' || e.request.url.includes('play-offline.html') || e.request.url.includes('untitled-demo.html');
  if (isGame) {
    // network-first: fresh build every online launch; cached copy when offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
  } else {
    // cache-first with background refresh for small assets
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then((cached) => {
        const fetched = fetch(e.request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(e.request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
