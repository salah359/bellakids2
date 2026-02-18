// public/sw.js

const cacheName = 'bella-v4'; // Increment version (v3 -> v4) to force an update
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

// Constants for hourly cleanup
const ONE_HOUR = 60 * 60 * 1000;
let lastCleared = Date.now();

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

// 3. Fetch Event: Implement a "Network First" strategy for pages and API
// Includes new logic to clear cache if an hour has passed
self.addEventListener('fetch', el => {
  const currentTime = Date.now();
  
  // Check if an hour has passed since the last automatic clear
  if (currentTime - lastCleared > ONE_HOUR) {
    lastCleared = currentTime;
    el.waitUntil(
      caches.keys().then(keys => {
        return Promise.all(keys.map(key => caches.delete(key)));
      })
    );
  }

  const req = el.request;
  const url = new URL(req.url);

  // Use Network First for navigation (HTML pages) and API calls
  // This ensures that refreshing the page always pulls the newest version from the server
  if (req.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    el.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
  } else {
    // Use Cache First for static assets like images, CSS, and JS to maintain speed
    el.respondWith(
      caches.match(req).then(res => res || fetch(req))
    );
  }
});
