// SEN GP - Configuration globale frontend
// Une seule source de vérité pour l'URL de l'API + enregistrement du service worker (PWA)
(function () {
    // URL complète du backend (utilisée uniquement par l'app native Capacitor,
    // où les chemins relatifs ne fonctionnent pas).
    var BACKEND_URL = 'https://2txjgdd3cj.us-east-1.awsapprunner.com';

    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    var isLocalDev = !isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isNative) {
        // App iOS/Android : appel direct du backend
        window.API_BASE_URL = BACKEND_URL + '/api/v1';
    } else if (isLocalDev) {
        // Développement local : backend lancé sur le port 5000
        window.API_BASE_URL = 'http://localhost:5000/api/v1';
    } else {
        // PWA déployée sur Vercel : chemin relatif, proxifié vers AWS via vercel.json
        // (évite les problèmes de mixed content HTTPS→HTTP et de CORS)
        window.API_BASE_URL = '/api/v1';
    }

    // Enregistrement du service worker (hors app native)
    if (!isNative && 'serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function (err) {
                console.warn('Service worker non enregistré :', err);
            });
        });
    }
})();
