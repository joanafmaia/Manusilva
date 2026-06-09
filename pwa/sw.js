/**
 * Manusilva PWA — Service Worker
 *
 * APIs externas de mapas (deslocação Km): bypass total — rede direta, sem cache offline.
 */
const CACHE_VERSION = 'v4';

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
  // BYPASS TOTAL PARA MAPAS E ROTAS (Ignora o cache e o service worker)
  if (event.request.url.includes('openstreetmap') || event.request.url.includes('project-osrm')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(fetch(event.request));
});
