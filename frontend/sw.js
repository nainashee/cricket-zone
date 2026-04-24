// Howzat — Service Worker
// Phase 4: video caching — pre-cache all player videos on install,
//          reconstruct 206 range responses from cached full bodies.
const SW_VERSION = 'v6';

const SHELL_CACHE = `shell-${SW_VERSION}`;
const API_CACHE   = `api-${SW_VERSION}`;
const FONTS_CACHE = `fonts-${SW_VERSION}`;
const VIDEO_CACHE = `video-${SW_VERSION}`;

// Pre-cache the app shell (index.html) on install so the app loads
// instantly and works offline from the very first visit.
const SHELL_ASSETS = ['/'];

// All player video files — pre-cached at install so they are ready
// before the user ever hits Play. Must be updated whenever a new player
// is added (which also requires a SW_VERSION bump anyway).
const VIDEO_ASSETS = [
  '/content/batting/anwar.mp4',
  '/content/batting/azam.mp4',
  '/content/batting/bradman.mp4',
  '/content/batting/ponting.mp4',
  '/content/batting/lara.mp4',
  '/content/batting/pietersen.mp4',
  '/content/batting/tendulkar.mp4',
  '/content/bowling/akhtar.mp4',
  '/content/bowling/bumrah.mp4',
  '/content/bowling/anderson.mp4',
  '/content/bowling/boult.mp4',
  '/content/bowling/harbhajan.mp4',
];

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  // skipWaiting unconditionally — SW must activate regardless of whether
  // pre-caching succeeds. If cache.addAll fails (network hiccup, CDN issue),
  // the SW still installs and assets get cached lazily on first fetch.
  self.skipWaiting();

  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE)
        .then(cache => cache.addAll(SHELL_ASSETS))
        .catch(() => {}), // pre-caching is best-effort; never fail the install

      caches.open(VIDEO_CACHE)
        .then(cache => cache.addAll(VIDEO_ASSETS))
        .catch(() => {}), // best-effort — videos cache lazily on first play if this fails
    ])
  );
});

self.addEventListener('activate', event => {
  // Delete every cache that belongs to an older SW version.
  // New cache names use SW_VERSION so old entries are never served after update.
  const keep = [SHELL_CACHE, API_CACHE, FONTS_CACHE, VIDEO_CACHE];
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

  // Player videos — cache-first with range-request support.
  // Browsers always use Range requests when playing <video>. We store the
  // full 200 response in VIDEO_CACHE and reconstruct proper 206 responses
  // from the cached body so video seeking works entirely from cache.
  if (url.pathname.startsWith('/content/')) {
    event.respondWith(handleVideo(request));
    return;
  }

  // Everything else passes through to the network unchanged.
});

// ─── Video cache handler ──────────────────────────────────────────────────────

// Cache-first for video assets; reconstructs 206 Partial Content responses
// from cached full bodies so browser <video> seeking works offline.
async function handleVideo(request) {
  const cache = await caches.open(VIDEO_CACHE);
  const rangeHeader = request.headers.get('Range');

  // Always look up the full video in cache (stored without a Range header).
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);

  if (cached) {
    if (!rangeHeader) return cached;

    // Reconstruct a 206 Partial Content response from the cached full body.
    // This lets the browser seek freely through a cached video without any
    // network access.
    const buf = await cached.clone().arrayBuffer();
    const { start, end } = parseRange(rangeHeader, buf.byteLength);
    return new Response(buf.slice(start, end + 1), {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  // Not in cache — fetch from network.
  const networkResponse = await fetch(request);

  // Only store complete (non-partial) responses. A 200 from the pre-cache
  // addAll or from a direct src="" load gets stored for future range requests.
  if (networkResponse.ok && networkResponse.status === 200) {
    cache.put(cacheKey, networkResponse.clone());
  }

  return networkResponse;
}

// Parse an HTTP Range header into {start, end} byte offsets.
// Handles the three RFC 7233 forms:
//   bytes=500-999  → start=500, end=999
//   bytes=500-     → start=500, end=total-1
//   bytes=-500     → last 500 bytes
function parseRange(header, total) {
  const m = /bytes=(\d*)-(\d*)/.exec(header);
  if (!m) return { start: 0, end: total - 1 };
  const start = m[1] ? parseInt(m[1], 10) : total - parseInt(m[2], 10);
  const end   = m[2] ? parseInt(m[2], 10) : total - 1;
  return { start: Math.max(0, start), end: Math.min(end, total - 1) };
}

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
