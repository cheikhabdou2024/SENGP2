// SEN GP - PWA : enregistrement du service worker + invite d'installation.
// Dans l'app native Capacitor, tout ceci est désactivé.
(function () {
    var isNative = !!(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
    );
    if (isNative) return;

    // --- Service worker ---
    if ('serviceWorker' in navigator &&
        (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function (err) {
                console.warn('Service worker non enregistré :', err);
            });
        });
    }

    // --- Invite d'installation ---
    var isStandalone =
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true;
    if (isStandalone) return; // déjà installée

    var DISMISS_KEY = 'sengp-install-dismissed';
    var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    try {
        var dismissed = localStorage.getItem(DISMISS_KEY);
        if (dismissed && Date.now() - Number(dismissed) < SEVEN_DAYS) return;
    } catch (e) { /* localStorage indisponible : on affiche quand même */ }

    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    var SHARE_ICON =
        '<svg width="18" height="22" viewBox="0 0 16 21" fill="none" style="vertical-align:-4px">' +
        '<path d="M8 1v12M8 1L4 5m4-4l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M3 8H1.8v11.4h12.4V8H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    var PLUS_ICON =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px">' +
        '<rect x="1" y="1" width="14" height="14" rx="3.5" stroke="currentColor" stroke-width="1.6"/>' +
        '<path d="M8 4.8v6.4M4.8 8h6.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

    function buildBanner(innerHTML) {
        var banner = document.createElement('div');
        banner.id = 'sengp-install-banner';
        banner.style.cssText =
            'position:fixed;left:12px;right:12px;bottom:14px;z-index:99999;' +
            'display:flex;align-items:center;gap:12px;padding:14px 16px;' +
            'background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;' +
            'border-radius:16px;box-shadow:0 8px 30px rgba(30,64,175,.45);' +
            'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
            'font-size:14px;line-height:1.45;' +
            'transform:translateY(120%);transition:transform .4s cubic-bezier(.2,.9,.3,1.2);' +
            'max-width:480px;margin:0 auto;';
        banner.innerHTML = innerHTML;
        document.body.appendChild(banner);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { banner.style.transform = 'translateY(0)'; });
        });

        banner.querySelector('.sengp-install-close').addEventListener('click', function () {
            try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
            banner.style.transform = 'translateY(140%)';
            setTimeout(function () { banner.remove(); }, 450);
        });
        return banner;
    }

    var ICON_IMG =
        '<img src="icons/icon-192.png" alt="" width="44" height="44" ' +
        'style="border-radius:11px;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.3)">';
    var CLOSE_BTN =
        '<button class="sengp-install-close" aria-label="Fermer" style="' +
        'background:rgba(255,255,255,.15);border:0;color:#fff;border-radius:50%;' +
        'width:28px;height:28px;font-size:15px;cursor:pointer;flex-shrink:0;' +
        'display:flex;align-items:center;justify-content:center">✕</button>';

    function showBannerWhenReady(html, after) {
        if (document.body) {
            after(buildBanner(html));
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                after(buildBanner(html));
            });
        }
    }

    if (isIOS) {
        // iOS : pas d'installation automatique — on explique Partager → écran d'accueil
        showBannerWhenReady(
            ICON_IMG +
            '<div style="flex:1;min-width:0">' +
            '<strong style="font-size:15px">Installez SEN GP</strong><br>' +
            'Dans Safari : appuyez sur <span style="font-weight:700">' + SHARE_ICON + ' Partager</span> ' +
            'puis <span style="font-weight:700">' + PLUS_ICON + ' Sur l’écran d’accueil</span>' +
            '</div>' + CLOSE_BTN,
            function () {}
        );
        return;
    }

    // Android / Chrome / Edge : bouton d'installation directe
    var deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        showBannerWhenReady(
            ICON_IMG +
            '<div style="flex:1;min-width:0">' +
            '<strong style="font-size:15px">SEN GP sur votre téléphone</strong><br>' +
            'Installez l’application gratuitement' +
            '</div>' +
            '<button class="sengp-install-go" style="' +
            'background:#fff;color:#1e40af;border:0;border-radius:12px;' +
            'padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer;' +
            'flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.25)">⬇️ Installer</button>' +
            CLOSE_BTN,
            function (banner) {
                banner.querySelector('.sengp-install-go').addEventListener('click', function () {
                    if (!deferredPrompt) return;
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(function () {
                        deferredPrompt = null;
                        banner.style.transform = 'translateY(140%)';
                        setTimeout(function () { banner.remove(); }, 450);
                    });
                });
            }
        );
    });

    window.addEventListener('appinstalled', function () {
        var b = document.getElementById('sengp-install-banner');
        if (b) b.remove();
    });
})();
