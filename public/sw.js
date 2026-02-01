const cacheName = 'bella-v3'; // Updated to v3 to force a fresh start
const staticAssets = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js'
];

self.addEventListener('install', async el => {
  // 1. Force the new service worker to take control immediately
  self.skipWaiting();
  const cache = await caches.open(cacheName);
  await cache.addAll(staticAssets);
});

self.addEventListener('activate', el => {
  // 2. Delete old caches (v1, v2) instantly so no ghost files remain
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

self.addEventListener('fetch', el => {
  const req = el.request;
  const url = new URL(req.url);

  // 3. STRATEGY: 
  // - If asking for API data (products), go to Network (always get fresh prices)
  // - If asking for Images/CSS/JS, check Cache first (loads faster)
  if (url.pathname.startsWith('/api/')) {
     el.respondWith(fetch(req));
  } else {
     el.respondWith(caches.match(req).then(res => res || fetch(req)));
  }
});