// Cache version — auto-injected by CI (see .github/workflows/deploy.yml)
// In local dev the placeholder stays as-is, so we fallback to a date-based version
const _RAW_VERSION = '__SW_VERSION__';
const SW_VERSION = _RAW_VERSION.includes('__') ? `dev-${new Date().toISOString().slice(0,10)}` : _RAW_VERSION;
const STATIC_CACHE = `daily-why-static-v${SW_VERSION}`;
const API_CACHE = `daily-why-api-v${SW_VERSION}`;

// Static assets to pre-cache on install
const PRE_CACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.webp',
];

// Install: pre-cache static shell, then wait for client to trigger activation
self.addEventListener('install', (event) => {
  // Do NOT call skipWaiting() here — let the client decide when to activate
  // This prevents interrupting the user's current reading session
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRE_CACHE_URLS);
    })
  );
});

// Activate: clean up ALL old caches that don't match current version
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Notify all clients that SW has been updated
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
      });
    })
  );
});

// Fetch: differentiated caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API content requests — differentiated by params
  if (url.pathname.startsWith('/api/content')) {
    const hasDate = url.searchParams.has('date');
    const hasRefresh = url.searchParams.has('_refresh');

    // Helper: normalize URL for cache key (strip _refresh, _t, _d params)
    const getCacheKey = (reqUrl) => {
      const cacheUrl = new URL(reqUrl);
      cacheUrl.searchParams.delete('_refresh');
      cacheUrl.searchParams.delete('_t');
      cacheUrl.searchParams.delete('_d');
      return cacheUrl.toString();
    };

    if (hasDate && hasRefresh) {
      // Force refresh: network-only, then update cache
      event.respondWith(
        fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(getCacheKey(request.url), response.clone());
          }
          return response;
        }).catch(async () => {
          // Network failed — try cache as last resort
          const cache = await caches.open(API_CACHE);
          const cached = await cache.match(getCacheKey(request.url));
          if (cached) return cached;
          return new Response(JSON.stringify({ error: '离线状态，暂无缓存内容' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );
      return;
    }

    if (hasDate && !hasRefresh) {
      // Normal content load: cache-first, miss goes to network
      event.respondWith(
        (async () => {
          const cache = await caches.open(API_CACHE);
          const cacheKey = getCacheKey(request.url);
          const cached = await cache.match(cacheKey);
          if (cached) return cached;

          // Cache miss — fetch from network
          try {
            const response = await fetch(request);
            if (response.ok) {
              cache.put(cacheKey, response.clone());
            }
            return response;
          } catch {
            return new Response(JSON.stringify({ error: '离线状态，暂无缓存内容' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        })()
      );
      return;
    }

    // Date list (no date param): stale-while-revalidate
    // Return cache immediately if available, fetch in background and notify client if changed
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        const cacheKey = getCacheKey(request.url);
        const cached = await cache.match(cacheKey);

        // Background revalidation — fetch network and update cache
        const revalidate = fetch(request).then(async (response) => {
          if (response.ok) {
            if (cached) {
              const newBody = await response.clone().text();
              const oldBody = await cached.clone().text();
              if (newBody !== oldBody) {
                // Date list changed — notify all clients
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach((client) => {
                  client.postMessage({ type: 'DATES_UPDATED' });
                });
              }
            }
            cache.put(cacheKey, response.clone());
          }
          return response;
        }).catch(() => null);

        if (cached) {
          // Return stale cache immediately, revalidate in background
          event.waitUntil(revalidate);
          return cached;
        }

        // No cache — wait for network
        const response = await revalidate;
        if (response) return response;
        return new Response(JSON.stringify({ error: '离线状态，暂无缓存内容' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })()
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

// ============================================================
// Push notifications — daily reminder
// ============================================================

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : null;
  const title = payload?.title || '每日一个为什么';
  const options = {
    body: payload?.body || '今天的新问题已更新，来看看吧！',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'daily-why-reminder',
    data: { url: payload?.url || '/' },
    requireInteraction: false,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: '去看看' },
      { action: 'dismiss', title: '知道了' },
    ],
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data?.url || '/';
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ============================================================
// Heartbeat — client posts message once per day
// ============================================================

self.addEventListener('message', (event) => {
  // Allow clients to trigger skipWaiting when user clicks "update"
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'HEARTBEAT') {
    const deviceId = event.data.deviceId;
    // Forward heartbeat to server in background (fire-and-forget)
    event.waitUntil(
      fetch('/api/push/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      }).catch(() => {})
    );
  }
});
