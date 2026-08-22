const CACHE_NAME = 'ai-chat-v10';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/provider-bridge.js',
  '/provider-ui-patch.js',
  '/provider-runtime-fixes.js',
  '/provider-local-detect.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

const RUNTIME_SCRIPTS = [
  'provider-ui-patch.js',
  'provider-bridge.js',
  'provider-runtime-fixes.js',
  'provider-local-detect.js'
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

function stripLegacyPuter(html) {
  return html.replace(
    /\s*<!-- Puter\.js SDK for TTS -->\s*<script[^>]+src=["']https:\/\/js\.puter\.com\/v2\/["'][^>]*><\/script>\s*/gi,
    '\n'
  );
}

function injectRuntimeScripts(html) {
  let result = stripLegacyPuter(html);
  const tags = RUNTIME_SCRIPTS
    .map(name => `<script src="${name}"></script>`)
    .join('\n  ');

  // Remove any previously injected copies before inserting exactly one set.
  RUNTIME_SCRIPTS.forEach(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\s*<script[^>]+src=["']${escaped}["'][^>]*><\\/script>\\s*`, 'gi'), '\n');
  });

  if (result.includes('</head>')) {
    return result.replace('</head>', `  ${tags}\n</head>`);
  }
  if (result.includes('</body>')) {
    return result.replace('</body>', `  ${tags}\n</body>`);
  }
  return `${result}\n${tags}\n`;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return caches.match(request);
  }
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response.ok) return caches.match('/index.html');
    const html = await response.text();
    const injected = injectRuntimeScripts(html);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(injected, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (_) {
    const cached = await caches.match('/index.html');
    if (!cached) throw _;
    const html = await cached.text();
    return new Response(injectRuntimeScripts(html), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Always fetch JS from the network first so a new provider bridge cannot remain stale.
  if (url.origin === self.location.origin && url.pathname.endsWith('.js')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
