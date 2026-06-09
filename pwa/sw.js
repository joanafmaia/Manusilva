/**
 * Manusilva PWA — Service Worker
 *
 * APIs externas de mapas (deslocação Km): bypass total — rede direta, sem cache offline.
 * Domínios: nominatim.openstreetmap.org · router.project-osrm.org
 */
const MAP_NETWORK_ONLY_HOSTS = new Set([
  'nominatim.openstreetmap.org',
  'router.project-osrm.org',
]);

function isMapNetworkOnlyRequest(request) {
  try {
    const url = new URL(request.url);
    return MAP_NETWORK_ONLY_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (isMapNetworkOnlyRequest(event.request)) {
    // Network-only: não chamar respondWith — o browser faz o pedido diretamente à rede.
    return;
  }

  event.respondWith(fetch(event.request));
});
