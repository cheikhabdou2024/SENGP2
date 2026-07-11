// SEN GP - Service Worker (PWA)
// Stratégie : réseau d'abord pour les pages et l'API, cache en secours pour l'offline.
const CACHE_NAME = 'sengp-v1';

const PRECACHE = [
    './',
    'index.html',
    'connexion.html',
    'inscrire.html',
    'manifest.json',
    'config.js',
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

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ne jamais mettre en cache les appels API ni les requêtes non-GET
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        return;
    }

    // Réseau d'abord, cache en secours (permet un fonctionnement hors ligne minimal)
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
