// AQUA TERRITORY service worker: アプリの見た目（静的ファイル）をキャッシュし、再起動を速くする。
// 対戦はサーバー通信が必要なので、通信データはキャッシュしない。
const CACHE = 'aqua-territory-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/socket.io')) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok && url.origin === self.location.origin) {
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
  );
});
