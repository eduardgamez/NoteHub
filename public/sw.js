const CACHE = 'notehub-shell-v5';
const ROOT = new URL('./', self.registration.scope).pathname;
const CORE = [ROOT, `${ROOT}manifest.webmanifest`, `${ROOT}notehub-mark.svg`, `${ROOT}notehub-192.png`, `${ROOT}notehub-512.png`];

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE);
  const shell = await fetch(ROOT);
  const html = await shell.clone().text();
  await cache.put(ROOT, shell);
  const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => match[1]);
  await Promise.allSettled(assets.map((asset) => cache.add(asset)));
})()));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('notehub-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(ROOT, copy)); return response; }).catch(() => caches.match(ROOT)));
    return;
  }
  const path = new URL(event.request.url).pathname;
  if (!path.startsWith(`${ROOT}assets/`) && !CORE.includes(path)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); } return response; })));
});
