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

  // API content requests — stale-while-revalidate
  // Return cached first (fast), then update cache from network in background.
  // When data changes, notify all clients so the page can refresh itself.
  if (url.pathname.startsWith('/api/content')) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);

        // Start network fetch in background (do NOT await before responding)
        const networkPromise = fetch(request).then(async (response) => {
          if (response.ok) {
            const oldBody = cached ? await cached.clone().text() : '';
            const newBody = await response.clone().text();

            // Update cache
            cache.put(request, new Response(newBody, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            }));

            // If content changed, notify clients to refresh
            if (oldBody && oldBody !== newBody) {
              const clients = await self.clients.matchAll({ type: 'window' });
              clients.forEach((client) => {
                client.postMessage({ type: 'CONTENT_UPDATED', url: request.url });
              });
            }

            // Also cache individual date content requests (warm the cache)
            // Parse availableDates from the new list and pre-cache known-good dates
            if (!url.searchParams.has('date') && !url.searchParams.has('type')) {
              try {
                const data = JSON.parse(newBody);
                if (data.availableDates) {
                  for (const date of data.availableDates) {
                    const dateUrl = new URL(request.url);
                    dateUrl.searchParams.set('date', date);
                    // Fire-and-forget: pre-cache individual date content
                    fetch(dateUrl).then((r) => {
                      if (r.ok) cache.put(dateUrl.toString(), r.clone());
                    }).catch(() => {});
                  }
                }
              } catch {}
            }
          }
          return response;
        }).catch(() => null);

        // Return cached response immediately if available
        if (cached) return cached;

        // No cache — wait for network
        const response = await networkPromise;
        if (response) return response;

        // Offline and no cache — return empty content
        return new Response('', { status: 503, statusText: 'Offline' });
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
