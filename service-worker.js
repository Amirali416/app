const CACHE_NAME = 'ai-chat-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/provider-bridge.js',
  '/provider-ui-patch.js',
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
  const html = await networkResponse.text();
  const marker = '<script src="app.js"></script>';
  const injection = `${marker}\n  <script src="provider-bridge.js"></script>\n  <script src="provider-ui-patch.js"></script>`;
  if (!html.includes(marker) || html.includes('provider-bridge.js')) {
    return new Response(html, { status: networkResponse.status, statusText: networkResponse.statusText, headers: networkResponse.headers });
  }
  return new Response(html.replace(marker, injection), {
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
