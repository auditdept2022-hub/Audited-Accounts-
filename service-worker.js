// Audited Accounts — service worker
// Bump this on every deploy so old caches are dropped and the new
// index.html is picked up instead of being served stale.
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'audited-accounts-' + CACHE_VERSION;

// App shell: things that rarely change and are safe to cache aggressively.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-48.png',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-192.png',
  './icon-384.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './stamp-logo.png',
  './favicon.ico'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // Add individually so one missing file doesn't fail the whole install.
        return Promise.all(
          APP_SHELL.map(function (url) {
            return cache.add(url).catch(function () { /* ignore missing */ });
          })
        );
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) { return name.indexOf('audited-accounts-') === 0 && name !== CACHE_NAME; })
            .map(function (name) { return caches.delete(name); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POST/PUT (data writes)

  const url = new URL(req.url);

  // Live account data (Google Apps Script / Sheets) must always be fresh —
  // never serve this from cache, or the app would show stale figures.
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('googleusercontent.com') !== -1 ||
      url.hostname.indexOf('docs.google.com') !== -1) {
    event.respondWith(fetch(req));
    return;
  }

  // The HTML shell: network-first so users always get the latest app code
  // when online, falling back to the cached copy when offline.
  if (req.mode === 'navigate' || (isSameOrigin(url) && url.pathname.endsWith('index.html'))) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          return res;
        })
        .catch(function () { return caches.match(req).then(function (m) { return m || caches.match('./index.html'); }); })
    );
    return;
  }

  // Everything else same-origin (icons, manifest, fonts, the xlsx lib):
  // cache-first, refresh quietly in the background.
  if (isSameOrigin(url) || url.hostname.indexOf('fonts.g') !== -1 || url.hostname.indexOf('cdnjs.cloudflare.com') !== -1) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        const network = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
  }
});
