const CACHE_NAME = 'market-pro-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

// On installation, cache the static shell resources
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline asset shell');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('[Service Worker] Core pre-cache fallback:', err);
      });
    })
  );
});

// Clean up ancient caches upon activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Expiring old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network First with Cache Fallback strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Exclude API requests, third-party authentication, Firestore streams, and WebSocket Dev Servers
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') || 
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.protocol === 'chrome-extension:' ||
    event.request.url.includes('ws') ||
    event.request.url.includes('localhost')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If valid local response, clone and cache it dynamically
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline), check cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Single Page Application route fallback: if navigating, serve index.html
          if (event.request.mode === 'navigate' || !url.pathname.includes('.')) {
            return caches.match('/');
          }
        });
      })
  );
});
