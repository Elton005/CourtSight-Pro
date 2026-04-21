const CACHE_VERSION = 'v2.4-offline-fix';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Rutas RELATIVAS (funcionan en raíz o subcarpeta de GitHub Pages)
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/auth-guard.js',
  './pictures/logo.png',
  './pictures/logo-192.png',
  './pictures/logo-512.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
    .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => 
      Promise.all(names.filter(n => n.startsWith('static-') || n.startsWith('dynamic-'))
                  .filter(n => n !== STATIC_CACHE && n !== DYNAMIC_CACHE)
                  .map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Datos críticos: Network-First
  if (request.url.includes('/data/')) {
    event.respondWith(
      fetch(request).then(res => {
        const clone = res.clone();
        caches.open(DYNAMIC_CACHE).then(c => c.put(request, clone));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Assets y páginas: Cache-First con fallback a red y offline
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(DYNAMIC_CACHE).then(c => c.put(request, clone));
        return res;
      }).catch(() => {
        // 🔒 Fallback offline: sirve index.html si todo falla
        return caches.match('./index.html');
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
