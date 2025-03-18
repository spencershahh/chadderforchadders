// Service Worker for Chadder App
// This provides offline support, caching, and better performance

const CACHE_NAME = 'chadder-cache-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json'
];

// API routes that should not be cached
const API_ROUTES = [
  '/api/',
  'supabase.co'
];

// Install event - cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper function to determine if a request is for an API
const isApiRequest = (url) => {
  return API_ROUTES.some(route => url.includes(route));
};

// Helper function to determine if a request is for a static asset
const isStaticAsset = (url) => {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.eot'];
  return staticExtensions.some(ext => url.endsWith(ext));
};

// Fetch event - handle caching strategy
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('twitch.tv') &&
      !event.request.url.includes('githubusercontent.com')) {
    return;
  }
  
  // For API requests, use network first with cache fallback
  if (isApiRequest(event.request.url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response as it can only be used once
          const responseToCache = response.clone();
          
          // Cache the response for future use with a 5-minute expiration
          caches.open(CACHE_NAME)
            .then((cache) => {
              const headers = new Headers(responseToCache.headers);
              headers.append('sw-fetched-on', new Date().getTime().toString());
              
              return responseToCache.blob().then(body => {
                return cache.put(event.request, new Response(body, {
                  status: responseToCache.status,
                  statusText: responseToCache.statusText,
                  headers
                }));
              });
            });
          
          return response;
        })
        .catch(() => {
          // Network failed, try to return cached response
          return caches.match(event.request);
        })
    );
  }
  // For static assets, use cache first with network fallback
  else if (isStaticAsset(event.request.url)) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // If found in cache, return the cached version
          if (response) {
            return response;
          }
          
          // Not in cache, fetch from network
          return fetch(event.request)
            .then((networkResponse) => {
              // Check for valid response
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }
              
              // Clone response for caching
              const responseToCache = networkResponse.clone();
              
              // Cache the fetched resource
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              
              return networkResponse;
            });
        })
    );
  }
  // For other requests, use network first
  else {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // If network fails, try the cache
          return caches.match(event.request);
        })
    );
  }
});

// Handle background sync for failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'syncPendingRequests') {
    event.waitUntil(syncPendingRequests());
  }
});

// Function to retry pending requests
const syncPendingRequests = async () => {
  try {
    const pendingRequestsCache = await caches.open('pendingRequests');
    const requests = await pendingRequestsCache.keys();
    
    await Promise.all(
      requests.map(async (request) => {
        try {
          // Get the original request data
          const requestData = await pendingRequestsCache.match(request);
          const { url, method, headers, body } = await requestData.json();
          
          // Recreate the request
          const newRequest = new Request(url, {
            method,
            headers: new Headers(headers),
            body
          });
          
          // Try to send the request
          const response = await fetch(newRequest);
          
          if (response.ok) {
            // If successful, remove from pending
            await pendingRequestsCache.delete(request);
          }
        } catch (err) {
          console.error('Failed to sync request:', err);
        }
      })
    );
  } catch (err) {
    console.error('Error during background sync:', err);
  }
};

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'New notification from Chadder',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Chadder Notification', options)
    );
  } catch (err) {
    console.error('Error showing push notification:', err);
  }
}); 