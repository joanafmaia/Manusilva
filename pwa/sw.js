/**
 * Manusilva PWA — Service Worker
 *
 * APIs externas de mapas (deslocação Km): bypass total — rede direta, sem cache offline.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (
    event.request.url.includes('nominatim.openstreetmap.org') ||
    event.request.url.includes('router.project-osrm.org')
  ) {
    return;
  }

  event.respondWith(fetch(event.request));
});
