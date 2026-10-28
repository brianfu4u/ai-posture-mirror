/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'apm-pwa-v1.0.0';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/models/pose_landmarker_lite.task',
  '/sounds/camera_focus.wav',
  '/sounds/device_locked.wav',
  '/sounds/cartoon_boing.wav',
  '/sounds/cartoon_whistle.wav',
  '/sounds/cartoon_laugh.wav',
  '/sounds/cartoon_coin.wav',
  '/sounds/pixel_bloop.wav',
  '/sounds/pixel_oops.wav',
  '/sounds/pixel_rewind.wav',
  '/sounds/pixel_levelup.wav',
  '/sounds/forest_woodblock.wav',
  '/sounds/forest_marimba.wav',
  '/sounds/forest_windchime.wav',
  '/sounds/forest_cello.wav',
];

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Cache available core resources without aborting if optional models or sounds are 404
        for (const url of PRECACHE_URLS) {
          try {
            await cache.add(url);
          } catch {
            // Optional model or asset might not be loaded yet in dev mode
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
            return Promise.resolve(true);
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') {
    return;
  }

  // Bypass cache for cloud sync endpoints
  if (req.url.includes('/api/') || req.url.includes('/v1/')) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Background fetch for freshness if online
        if (navigator.onLine) {
          fetch(req)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
              }
            })
            .catch(() => {
              // Ignore background update errors
            });
        }
        return cachedResponse;
      }

      // Not in cache, try network
      return fetch(req)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          return networkResponse;
        })
        .catch(async () => {
          // If offline and requesting navigation, return index.html
          if (req.mode === 'navigate') {
            const indexFallback = await caches.match('/index.html');
            if (indexFallback) return indexFallback;
          }
          return new Response('Network error (Offline)', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
    })
  );
});
