// Howzat — Service Worker
// Phase 2: lifecycle only. No fetch handler. No caching.
const SW_VERSION = 'v2';

self.addEventListener('install', () => {
  // Activate this SW immediately rather than waiting for existing tabs to close.
  // Established here so the update model is consistent from the first version.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Take control of all open tabs immediately after activation.
  // Without this, pages loaded before registration would not be controlled
  // until their next navigation.
  event.waitUntil(self.clients.claim());
});

// No fetch handler.
// All network requests pass through to the browser unchanged.
