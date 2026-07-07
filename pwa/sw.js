/**
 * Manusilva PWA — Service Worker
 *
 * Online: rede primeiro (JS/HTML atualizados).
 * Offline: cache local (arranque e módulos já visitados).
 */
const CACHE_VERSION = 'offline-v1';
const CACHE_SHELL = `manusilva-shell-${CACHE_VERSION}`;
const CACHE_RUNTIME = `manusilva-runtime-${CACHE_VERSION}`;

const SHELL_URLS = [
  './dashboard.html',
  './warehouse.html',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/tech.css',
  './css/warehouse.css',
  './js/force-refresh-page.js',
  './js/build-version.js',
  './js/bootstrap-entry.js',
  './assets/icons/favicon.png',
  './assets/icons/icon-192.png',
];

const SUPABASE_CDN = 'cdn.jsdelivr.net/npm/@supabase/supabase-js';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_SHELL && key !== CACHE_RUNTIME)
            .map((key) => caches.delete(key)),
        ),
      )
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

async function cachePutSafe(cacheName, request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
}

async function networkFirstWithCache(request, cacheName = CACHE_RUNTIME) {
  try {
    const response = await fetch(request);
    await cachePutSafe(cacheName, request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function navigateWithCache(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    await cachePutSafe(CACHE_SHELL, request, response.clone());
    return response;
  } catch {
    const cached =
      (await caches.match(request)) ||
      (await caches.match('./dashboard.html')) ||
      (await caches.match('/dashboard.html'));
    if (cached) return cached;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  if (url.includes('api.mapbox.com') || url.includes('project-osrm.org')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.includes(SUPABASE_CDN)) {
    event.respondWith(networkFirstWithCache(request, CACHE_SHELL));
    return;
  }

  if (!isSameOrigin(url)) return;

  const path = new URL(url).pathname;

  if (request.mode === 'navigate') {
    event.respondWith(navigateWithCache(request));
    return;
  }

  if (
    path.startsWith('/js/') ||
    path.startsWith('/css/') ||
    path.endsWith('.html') ||
    path === '/sw.js' ||
    path.startsWith('/assets/')
  ) {
    event.respondWith(networkFirstWithCache(request));
  }
});
