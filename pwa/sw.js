/**
 * Manusilva PWA — Service Worker
 *
 * JS/HTML: sempre rede (evita Ctrl+F5 sem atualizar módulos ES).
 * Mapas: passthrough direto à rede.
 */
const CACHE_VERSION = '6790799';

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

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  if (url.includes('api.mapbox.com') || url.includes('project-osrm.org')) {
    event.respondWith(fetch(request));
    return;
  }

  if (!isSameOrigin(url)) return;

  const path = new URL(url).pathname;
  if (path.startsWith('/js/') || path.endsWith('.html') || path === '/sw.js') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
  }
});
