// public/sw.js

const cacheName = 'bella-v5'; // Incremented version to force an update on all devices
const staticAssets = [
  './',
  './index.html',
  './girls.html',
  './boys.html',
  './newborn.html',
  './about.html',
  './admin.html',
  './admin-login.html',
  './css/style.css',
  './js/app.js'
];

// 1. Install Event: Cache static assets and force the new service worker to activate
self.addEventListener('install', async el => {
  self.skipWaiting(); 
  const cache = await caches.open(cacheName);
  await cache.addAll(staticAssets);
});

// 2. Activate Event: Clean up old caches immediately and take control of all tabs
self.addEventListener('activate', el => {
  el.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== cacheName)
        .map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

// 3. Fetch Event: Network First for Pages/API, Stale-While-Revalidate for CSS/JS/Images
self.addEventListener('fetch', el => {
  const req = el.request;
  const url = new URL(req.url);

  // Use Network First for navigation (HTML pages) and API calls
  // This ensures that refreshing the page always pulls the newest version from the server
  if (req.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    el.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
  } else {
    // Use Stale-While-Revalidate for static assets like images, CSS, and JS
    // This serves the cached version INSTANTLY, but secretly fetches the latest version
    // in the background and saves it for the NEXT time the user visits.
    el.respondWith(
      caches.match(req).then(cachedResponse => {
        const fetchPromise = fetch(req).then(networkResponse => {
          // Make sure we only cache valid responses from our own server
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(cacheName).then(cache => {
              cache.put(req, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          // If the network fails (user is offline), fail silently. The cached response will still load.
        });

        // Return the cached response immediately if we have it, otherwise wait for the network fetch
        return cachedResponse || fetchPromise;
      })
    );
  }
});
