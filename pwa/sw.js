/**
 * Manusilva PWA — Service Worker
 *
 * Não interceta pedidos de rede — evita TypeError: Failed to fetch em navegação/assets.
 * Mapas (Nominatim/OSRM) passam diretamente pelo browser.
 */
const CACHE_VERSION = 'v5';

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
  // BYPASS TOTAL — sem respondWith: mapas, HTML, JS e API passam pela rede normal
  if (event.request.url.includes('openstreetmap') || event.request.url.includes('project-osrm')) {
    return;
  }
});
