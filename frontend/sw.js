// Howzat — Service Worker
// Phase 3: shell caching + leaderboard JSON fallback.
const SW_VERSION = 'v3';

const SHELL_CACHE = `shell-${SW_VERSION}`;
const API_CACHE   = `api-${SW_VERSION}`;
const FONTS_CACHE = `fonts-${SW_VERSION}`;

// Pre-cache the app shell (index.html) on install so the app loads
// instantly and works offline from the very first visit.
const SHELL_ASSETS = ['/'];

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // Delete every cache that belongs to an older SW version.
  // New cache names use SW_VERSION so old entries are never served after update.
  const keep = [SHELL_CACHE, API_CACHE, FONTS_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch handler ────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Navigation requests (index.html) — stale-while-revalidate.
  // Serve the cached shell immediately so the app feels instant, then update
  // the cache in the background so the next load gets the latest version.
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, request));
    return;
  }

  // Google Fonts CSS — cache-first.
  // The CSS URL encodes the requested font families; treat it as immutable
  // once fetched. A new font request gets a new URL automatically.
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(cacheFirst(FONTS_CACHE, request));
    return;
  }

  // Google Fonts files — cache-first.
  // Individual font files (woff2) are content-addressed by Google and never
  // change, so caching them indefinitely is safe.
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONTS_CACHE, request));
    return;
  }

  // Leaderboard API — network-first with cache fallback.
  // Only cache responses that:
  //   1. The app has not explicitly marked cache:'no-store' — the daily
  //      leaderboard and post-game fetches all use no-store deliberately
  //      so they always reflect live scores.
  //   2. Are not authenticated — caching user-specific summaries would leak
  //      one user's data to the next user on the same browser.
  // This leaves only the all-time Hall of Fame calls, which are public and
  // safe to serve stale when offline.
  if (
    request.method === 'GET' &&
    url.hostname.includes('execute-api') &&
    url.pathname.includes('/leaderboard') &&
    request.cache !== 'no-store' &&
    !request.headers.has('Authorization')
  ) {
    event.respondWith(networkFirst(API_CACHE, request));
    return;
  }

  // Everything else passes through to the network unchanged.
});

// ─── Cache strategies ─────────────────────────────────────────────────────────

// Serve from cache immediately; revalidate in the background.
// Best for the app shell: fast first paint, always fresh on next load.
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || networkPromise;
}

// Serve from cache if available; fall back to network and populate cache.
// Best for assets that never change (fonts, icons).
async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

// Try network first; fall back to cache on failure.
// Best for data that should be live but can degrade gracefully when offline.
async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
