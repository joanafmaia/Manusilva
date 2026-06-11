/**
 * Manusilva PWA — Service Worker
 *
 * APIs de mapas (Mapbox + OSRM): passthrough direto à rede, sem cache offline.
 */
const CACHE_VERSION = 'v18';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (
    event.request.url.includes('api.mapbox.com') ||
    event.request.url.includes('project-osrm.org')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }
});
