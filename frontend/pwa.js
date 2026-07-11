// SEN GP - Enregistrement du service worker (PWA web uniquement).
// Dans l'app native Capacitor, le service worker est inutile : on ne l'enregistre pas.
(function () {
    var isNative = !!(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
    );
    if (isNative || !('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
            console.warn('Service worker non enregistré :', err);
        });
    });
})();
