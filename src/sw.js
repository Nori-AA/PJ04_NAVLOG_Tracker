// バージョン番号廃止！ 固定の名前の「保管庫」を1つだけ作ります
const CACHE_NAME = 'navlog-cache-main';

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

// 【1】インストール時：とりあえず基本ファイルを保管庫に入れる
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(urlsToCache.map(url => {
                return cache.add(url).catch(err => console.log('Cache skip:', url));
            }));
        })
    );
    // すぐに新しいService Workerを有効にする
    self.skipWaiting();
});

// 【2】アクティベート時：すぐにコントロールを開始する
self.addEventListener('activate', event => {
    // バージョン管理を廃止したため、古い保管庫を消す処理は不要になりました
    event.waitUntil(self.clients.claim());
});

// 【3】通信発生時（完全メンテナンスフリーのNetwork First戦略）
self.addEventListener('fetch', event => {
    event.respondWith(
        // ① まずはインターネットから「最新のファイル」を取りに行く
        fetch(event.request)
            .then(networkResponse => {
                // ネットに繋がって最新が取れたら、保管庫（キャッシュ）の中身を「最新」に上書き更新する
                if (event.request.url.startsWith(self.location.origin) && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse; // 最新の画面を表示
            })
            .catch(() => {
                // ② ネットに繋がっていない（機内モード）の場合は、保管庫から出す
                console.log('Offline mode: serving from cache');
                return caches.match(event.request);
            })
    );
});