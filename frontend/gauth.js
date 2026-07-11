// SEN GP - Connexion Google sur le web (PWA / navigateur).
// Dans l'app native Capacitor, le plugin GoogleAuth est utilisé à la place :
// ce script ne fait alors rien.
//
// Fonctionnement :
//  1. Charge Google Identity Services (GIS).
//  2. Remplace le bouton Google maison (.social-btn-google) par le bouton officiel.
//  3. Au clic, GIS renvoie un ID token (credential) → transmis à
//     window.handleGoogleCredential(idToken), défini par la page
//     (connexion.html / inscrire.html), qui appelle POST /api/v1/auth/google.
(function () {
    var isNative = !!(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
    );
    if (isNative) return;

    var CLIENT_ID = '1022151111172-re1mqoru6lo5fvgbnkrjqfk7vtoj1rco.apps.googleusercontent.com';

    function initGoogleButton() {
        if (!(window.google && google.accounts && google.accounts.id)) return;

        var custom = document.querySelector('.social-btn-google');
        if (!custom) return;

        google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: function (resp) {
                if (resp && resp.credential && typeof window.handleGoogleCredential === 'function') {
                    window.handleGoogleCredential(resp.credential);
                }
            }
        });

        // Mesurer le bouton maison avant de le masquer (largeur GIS max : 400px)
        var width = Math.max(200, Math.min(custom.offsetWidth || 360, 400));
        var host = document.createElement('div');
        host.style.cssText = 'display:flex;justify-content:center';
        custom.parentNode.insertBefore(host, custom);
        custom.style.display = 'none';

        google.accounts.id.renderButton(host, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'left',
            locale: 'fr',
            width: width
        });
    }

    function start() {
        var s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        s.onload = initGoogleButton;
        s.onerror = function () {
            console.warn('Google Identity Services n’a pas pu être chargé (hors ligne ?). ' +
                'Le bouton Google maison reste affiché.');
        };
        document.head.appendChild(s);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
