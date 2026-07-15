// ====== sw.js (完全オフライン専用 Cache-Only 版) ======
const CACHE_NAME = 'navlog-offline-v26.3.1';

// マージ後の本番環境に存在するファイルだけを指定
const ASSETS = [
    './',
    './index.html'
];


self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// 【最重要】fetch(event.request) を一切使わない
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // キャッシュにあればそれを返す。なければ強制的に index.html を返す。
            // ネットワークへの問い合わせは 1ミリも 行わない。
            return response || caches.match('./index.html');
        })
    );
});