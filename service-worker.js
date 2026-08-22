const CACHE_NAME = 'ai-chat-v13';
const urlsToCache = [
  '/', '/index.html', '/style.css', '/app.js', '/provider-bridge.js',
  '/provider-ui-patch.js', '/provider-runtime-fixes.js', '/provider-local-detect.js',
  '/provider-settings-ui.js', '/manifest.json', '/icons/icon-192x192.png', '/icons/icon-512x512.png'
];
const RUNTIME_SCRIPTS = ['provider-ui-patch.js','provider-bridge.js','provider-runtime-fixes.js','provider-local-detect.js','provider-settings-ui.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))])));
function stripLegacyPuter(html){return html.replace(/\s*<!-- Puter\.js SDK for TTS -->\s*<script[^>]+src=["']https:\/\/js\.puter\.com\/v2\/["'][^>]*><\/script>\s*/gi,'\n');}
function injectRuntimeScripts(html){let r=stripLegacyPuter(html);const tags=RUNTIME_SCRIPTS.map(n=>`<script src="${n}"></script>`).join('\n  ');RUNTIME_SCRIPTS.forEach(n=>{const e=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');r=r.replace(new RegExp(`\\s*<script[^>]+src=["']${e}["'][^>]*><\\/script>\\s*`,'gi'),'\n');});return r.includes('</head>')?r.replace('</head>',`  ${tags}\n</head>`):`${r}\n${tags}\n`;}
async function handleNavigation(request){try{const response=await fetch(request,{cache:'no-store'});if(!response.ok)return caches.match('/index.html');const html=await response.text();const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');return new Response(injectRuntimeScripts(html),{status:response.status,statusText:response.statusText,headers});}catch(e){const cached=await caches.match('/index.html');if(!cached)throw e;return new Response(injectRuntimeScripts(await cached.text()),{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}}
async function networkFirst(request){try{const r=await fetch(request,{cache:'no-store'});if(r.ok){const c=await caches.open(CACHE_NAME);await c.put(request,r.clone());}return r;}catch(_){return caches.match(request);}}
self.addEventListener('fetch',event=>{const r=event.request,u=new URL(r.url);if(r.mode==='navigate'){event.respondWith(handleNavigation(r));return;}if(u.origin===self.location.origin&&u.pathname.endsWith('.js')){event.respondWith(networkFirst(r));return;}event.respondWith(caches.match(r).then(c=>c||fetch(r)));});
