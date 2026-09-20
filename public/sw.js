const CACHE = 'notehub-shell-v3';
const CORE = ['/', '/manifest.webmanifest', '/notehub-mark.svg', '/notehub-192.png', '/notehub-512.png'];

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE);
  const shell = await fetch('/');
  const html = await shell.clone().text();
  await cache.put('/', shell);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  await Promise.allSettled(assets.map((asset) => cache.add(asset)));
})()));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put('/', copy)); return response; }).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); } return response; })));
});
