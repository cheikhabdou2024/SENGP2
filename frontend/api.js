/**
 * SEN GP — helpers partages par toutes les pages.
 *
 *  - sengpEsc(valeur)  : echappement HTML unique (texte ET attributs). Toute donnee venue
 *                        de l'API qui est injectee dans innerHTML doit passer par la.
 *  - fetch "conscient de la session" : quand l'API repond 401 a une requete authentifiee
 *    (jeton expire, compte suspendu ou supprime, role modifie, sessions revoquees), la
 *    session locale est effacee et l'utilisateur est renvoye vers la connexion, au lieu
 *    de rester sur une page cassee. Les appels /auth/* (mauvais mot de passe = 401) ne
 *    declenchent rien.
 *
 * Une page qui gere elle-meme sa session (admin.html) pose window.SENGP_OWN_SESSION = true
 * avant de charger ce fichier : l'evenement 'sengp:session-expired' reste emis, mais ni
 * le nettoyage ni la redirection ne sont faits.
 *
 * Chargement : <script src="api.js"></script> juste apres config.js.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  if (typeof window !== 'undefined' && root === window) lib.install(window);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SESSION_KEYS = ['authToken', 'userData'];
  var PUBLIC_PAGES = ['connexion.html', 'inscrire.html', 'oublie.html', 'index.html'];
  var LOGIN_PAGE = 'connexion.html?expired=1';

  var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
  }

  function headerValue(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    var wanted = name.toLowerCase();
    if (Array.isArray(headers)) {
      for (var i = 0; i < headers.length; i++) {
        if (String(headers[i][0]).toLowerCase() === wanted) return headers[i][1];
      }
      return null;
    }
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === wanted) return headers[key];
    }
    return null;
  }

  /** Jeton envoye avec la requete, ou null. */
  function bearerSent(input, init) {
    var value = headerValue(init && init.headers, 'Authorization')
      || (input && typeof input === 'object' ? headerValue(input.headers, 'Authorization') : null);
    var m = value && /^Bearer\s+(.+)$/i.exec(String(value));
    return m ? m[1] : null;
  }

  function urlOf(input) {
    if (typeof input === 'string') return input;
    return input && input.url ? input.url : String(input);
  }

  /** Vrai si la reponse 401 a cette requete signifie "session invalide". */
  function isSessionFailure(input, init, apiBase) {
    if (!apiBase) return false;
    var url = urlOf(input);
    if (url.indexOf(apiBase) !== 0) return false;
    if (url.slice(apiBase.length).indexOf('/auth/') === 0) return false;
    return !!bearerSent(input, init);
  }

  function pageName(win) {
    var path = (win.location && win.location.pathname) || '';
    return path.split('/').pop() || 'index.html';
  }

  function install(win) {
    if (!win || typeof win.fetch !== 'function' || win.__sengpApiInstalled) return;
    win.__sengpApiInstalled = true;
    win.sengpEsc = esc;

    var originalFetch = win.fetch.bind(win);

    function onSessionFailure(input, init) {
      if (!isSessionFailure(input, init, win.API_BASE_URL)) return;
      var storage = win.localStorage;
      try {
        // Un jeton plus recent (nouvelle connexion) ou deja efface : cette 401 est perimee.
        if (storage.getItem('authToken') !== bearerSent(input, init)) return;
      } catch (e) { return; }

      if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') {
        win.dispatchEvent(new win.CustomEvent('sengp:session-expired'));
      }
      if (win.SENGP_OWN_SESSION) return;

      SESSION_KEYS.forEach(function (k) { try { storage.removeItem(k); } catch (e) { /* ignore */ } });
      if (PUBLIC_PAGES.indexOf(pageName(win)) === -1) win.location.replace(LOGIN_PAGE);
    }

    // La langue de l'application accompagne chaque appel a l'API : le serveur traduit ses messages d'erreur.
    function withLanguage(input, init) {
      var base = win.API_BASE_URL;
      var lang = win.SengpI18n && win.SengpI18n.lang;
      if (!lang || !base || typeof win.Headers !== 'function' || urlOf(input).indexOf(base) !== 0) return init;
      var headers = new win.Headers(init && init.headers);
      if (!headers.has('Accept-Language')) headers.set('Accept-Language', lang);
      var out = {};
      for (var k in init) if (Object.prototype.hasOwnProperty.call(init || {}, k)) out[k] = init[k];
      out.headers = headers;
      return out;
    }

    // Choix explicite de langue (selecteur) : enregistre sur le compte pour les notifications et les autres appareils.
    if (typeof win.addEventListener === 'function') {
      win.addEventListener('sengp:languagechange', function (e) {
        var d = e && e.detail;
        if (!d || !d.explicit || !win.API_BASE_URL) return;
        var token;
        try { token = win.localStorage.getItem('authToken'); } catch (err) { token = null; }
        if (!token) return;
        win.fetch(win.API_BASE_URL + '/users/me', {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: d.lang })
        }).catch(function () { /* au mieux : la langue reste choisie sur l'appareil */ });
      });
    }

    win.fetch = function (input, init) {
      init = withLanguage(input, init);
      return originalFetch(input, init).then(function (res) {
        if (res && res.status === 401) {
          try { onSessionFailure(input, init); } catch (e) { /* ne jamais casser l'appel */ }
        }
        return res;
      });
    };
  }

  return { esc: esc, install: install, bearerSent: bearerSent, isSessionFailure: isSessionFailure };
});
