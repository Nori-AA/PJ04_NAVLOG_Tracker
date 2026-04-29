// ★ アプリを更新する時は、ここの数字を必ず変更してください（例：v25.9.2）
const CACHE_NAME = 'navlog-cache-v25.10.2';

// オフライン用に保存しておく基本ファイルのリスト
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './crew.js',
    './parser.js',
    './manifest.json'
];

// 【1】インストール時：ファイルを保管庫（キャッシュ）に入れる
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(urlsToCache.map(url => {
                return cache.add(url).catch(err => console.log('Cache skip:', url));
            }));
        })
    );
    self.skipWaiting();
});

// 【2】アクティベート時：古いバージョンの保管庫を削除する（重要）
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 【3】通信発生時（★ Cache First 戦略に変更）
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // ① 保管庫にデータがあれば、絶対にネット通信を試みない（iOSの警告を完全に封じる）
            if (response) {
                return response;
            }
            // ② 保管庫にない未知のデータ（外部サイトの画像など）の場合のみネットを見に行く
            return fetch(event.request).catch(() => console.log('Offline mode'));
        })
    );
});