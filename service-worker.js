const CACHE_NAME = 'ai-chat-v7';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/provider-bridge.js',
  '/provider-ui-patch.js',
  '/provider-runtime-fixes.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
    ])
  );
});

async function buildInjectedIndexResponse(request) {
  const networkResponse = await fetch(request);
  if (!networkResponse.ok) return networkResponse;

  let html = await networkResponse.text();

  // Remove the legacy Puter SDK from the delivered page. The app no longer uses it.
  html = html.replace(/\s*<!-- Puter\.js SDK for TTS -->\s*<script[^>]+src=["']https:\/\/js\.puter\.com\/v2\/["'][^>]*><\/script>\s*/gi, '\n');

  const marker = '<script src="app.js"></script>';
  const providerUi = '<script src="provider-ui-patch.js"></script>';
  const providerRuntime = '<script src="provider-bridge.js"></script>';
  const runtimeFixes = '<script src="provider-runtime-fixes.js"></script>';

  if (html.includes(marker)) {
    html = html.replace(
      marker,
      `${marker}\n  ${providerUi}\n  ${providerRuntime}\n  ${runtimeFixes}`
    );
  }

  return new Response(html, {
    status: networkResponse.status,
    statusText: networkResponse.statusText,
    headers: networkResponse.headers
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.mode === 'navigate') {
    event.respondWith(
      buildInjectedIndexResponse(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
