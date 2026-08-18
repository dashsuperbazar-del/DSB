// DSB Storefront service worker — SEPARATE from the admin's sw.js.
// Scope note: both live at the repo root, so this SW would claim index.html too.
// It therefore never caches or serves anything except the shop shell files below.
// To update: bump CACHE_VERSION to match SHOP_VERSION in shop.html.
const CACHE_VERSION = '2026-08-17-s5';
const CACHE_NAME = 'dsb-shop-' + CACHE_VERSION;
const SHELL = ['shop.html', 'shop-manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('dsb-shop-') && k !== CACHE_NAME)
                                .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch the API: catalog freshness and order placement must hit the network.
  if (url.hostname.endsWith('supabase.co')) return;

  // Never touch the admin app — it has its own service worker and cache.
  if (/\/(index\.html|sw\.js)$/.test(url.pathname)) return;

  // Only handle our own origin.
  if (url.origin !== self.location.origin) return;

  // Network-first, cache as fallback (same pattern as the admin SW).
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('shop.html')))
  );
});
