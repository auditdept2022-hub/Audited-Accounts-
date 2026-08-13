// Service worker for the Audit Dashboard.
//
// What this does:
//   - The first time the page is opened online, it's cached automatically
//     ("network first" below). After that, opening it with no connection
//     at all serves the cached copy instead of a browser error, so the
//     app shell loads offline.
//   - Precaches the manifest/icons up front so "Add to Home Screen" /
//     install works offline too.
//
// Bump CACHE_NAME whenever you deploy a change, to drop old cached files
// and pick up new ones.
const CACHE_NAME = 'audit-dashboard-shell-v1';

const PRECACHE_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_FILES.map((url) =>
          cache.add(url).catch(() => {
            /* ignore files that don't exist yet */
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // Page navigations: try the network first so edits are picked up right
  // away when online, and cache each page as it's visited. Fall back to
  // the cached copy when offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else same-origin (icons/manifest/CSS/JS): cache-first, then
  // network, caching whatever the network returns for next time.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
