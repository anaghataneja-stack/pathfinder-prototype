// Offline and slow-data support.
// The app page and /api/listings: try the network, but if it takes longer than 4 s (or fails), answer from the
// copy saved on this phone and update that copy in the background. Only a real app page (x-pf-app: 1) is saved.
const SHELL = 'pf-shell-v7', DATA = 'pf-data-v2', WAIT_MS = 4000;
const SHELL_FILES = ['/', '/icon.svg', '/manifest.webmanifest', '/tokens/yoma-tokens.css', '/engine/plan-engine.js', '/engine/journey.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Mark a response as coming from the phone's copy, so the page can say so.
async function fromCopy(cacheName, key) {
  const hit = await caches.match(key, { cacheName });
  if (!hit) return null;
  const headers = new Headers(hit.headers); headers.set('x-pf-cache', '1');
  return new Response(await hit.blob(), { status: hit.status, headers });
}

function networkOrCopy(request, cacheName, key, keep) {
  const network = fetch(request).then(res => {
    if (keep(res)) { const copy = res.clone(); caches.open(cacheName).then(c => c.put(key, copy)); }
    return res;
  });
  const slow = new Promise(resolve => setTimeout(resolve, WAIT_MS)).then(() => fromCopy(cacheName, key));
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    network.then(finish, async () => { const c = await fromCopy(cacheName, key); c ? finish(c) : reject(new Error('offline')); });
    slow.then(finish);
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname === '/api/listings') {
    e.respondWith(networkOrCopy(e.request, DATA, '/api/listings', res => res.ok)
      .catch(() => new Response('{"error":"offline"}', { status: 503, headers: { 'content-type': 'application/json' } })));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;   // AI and status: network only
  if (e.request.mode === 'navigate') {
    e.respondWith(networkOrCopy(e.request, SHELL, '/', res => res.ok && res.headers.get('x-pf-app') === '1')
      .catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
