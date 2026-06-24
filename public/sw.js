const CACHE_NAME = 'daily-why-v1';
const STATIC_CACHE = 'daily-why-static-v1';
const API_CACHE = 'daily-why-api-v1';

// Static assets to pre-cache on install
const PRE_CACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.webp',
];

// Install: pre-cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRE_CACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API content requests — cache-first (offline priority)
  if (url.pathname.startsWith('/api/content')) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response.ok) {
            // Cache API responses for 24 hours (stale-while-revalidate)
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          // Offline and no cache — return empty content
          return new Response('', { status: 503, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // Static assets — stale-while-revalidate
  if (url.pathname.match(/\.(js|css|png|webp|json|woff2?)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Navigation (HTML) — network-first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/') || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      })
    );
    return;
  }

  // Everything else — network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
