// DSB Service Worker — network-first shell, never cache Supabase data
// CACHE_NAME includes the app version so a deploy auto-invalidates the old shell.
// To update: change CACHE_VERSION to match APP_VERSION in index.html.
const CACHE_VERSION = '2026-07-21-v16';
const CACHE_NAME    = 'dsb-shell-' + CACHE_VERSION;

// Resources that make up the app shell — everything needed to open the UI offline.
// Supabase REST calls are explicitly excluded (see fetch handler below).
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// ── INSTALL: pre-cache the shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Cache each asset individually so one 404 (e.g. missing manifest.json)
      // doesn't abort the entire install and leave the app un-cacheable.
      Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(url).catch(e => console.warn('SW: could not cache', url, e))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete stale caches from previous versions ─────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('dsb-shell-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // take control of all open tabs immediately
  );
});

// ── FETCH: network-first for shell, passthrough for Supabase ─
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // NEVER intercept Supabase REST/auth/realtime — always go to network.
  // This ensures sync is never served stale data from cache.
  if (url.hostname.endsWith('.supabase.co')) {
    return; // let the browser handle it normally
  }

  // NEVER intercept non-GET requests (POST/PUT/DELETE are mutation calls)
  if (event.request.method !== 'GET') {
    return;
  }

  // For everything else (the app shell): network-first, cache fallback.
  // Network-first means the user always gets fresh HTML when online,
  // but the app still opens when offline (served from the cache).
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Cache a fresh copy on success
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request)
          .then(cached => cached || caches.match('./index.html')); // ultimate fallback
      })
  );
});
