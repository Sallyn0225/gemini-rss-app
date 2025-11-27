const CACHE_NAME = 'nsyc-station-cache-v2';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
];

// Install: Cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()) // Activate new SW immediately
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim()) // Take control of open pages
  );
});

// Fetch: Serve from cache, fall back to network, and cache new requests
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // For API requests, use a network-first strategy
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Here you could return a generic JSON error response if you want
        return new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }
  
  // For all other requests, use a cache-first strategy
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }

        // Otherwise, fetch from network
        return fetch(event.request).then(networkResponse => {
          // If the fetch is successful, clone it and store in cache.
          if (networkResponse.ok) {
            // Only cache responses from http/https, to avoid caching chrome-extension:// etc.
            if (event.request.url.startsWith('http')) {
               cache.put(event.request, networkResponse.clone());
            }
          }
          return networkResponse;
        });
      });
    })
  );
});
