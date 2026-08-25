// SEN GP - Service Worker (PWA)
// Stratégie : réseau d'abord, cache en secours (offline minimal).
// Jamais mis en cache : appels API, requêtes non-GET, vidéos.
const CACHE_NAME = 'sengp-v1';

const PRECACHE = [
    './',
    'index.html',
    'connexion.html',
    'inscrire.html',
    'manifest.json',
    'config.js',
    'theme.css',
    'ui.js',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// --- Web Push (VAPID, self-hosted) ---
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'SEN GP', body: event.data ? event.data.text() : '' }; }
    const title = data.title || 'SEN GP';
    const options = {
        body: data.body || '',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        data: { url: data.url || 'notifications.html' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || 'notifications.html';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
            if (self.clients.openWindow) return self.clients.openWindow(target);
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (
        event.request.method !== 'GET' ||
        url.pathname.startsWith('/api/') ||
        url.pathname.endsWith('.mp4')
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok && url.origin === self.location.origin) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request).then((cached) => {
                if (cached) return cached;
                if (event.request.mode === 'navigate') return caches.match('index.html');
                return Response.error();
            }))
    );
});
