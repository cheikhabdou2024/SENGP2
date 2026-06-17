/**
 * Deep-link handler for the sengp:// scheme.
 * When the payment result page button (sengp://payment/success|error) reopens the
 * app, close the in-app browser and route the user accordingly.
 *
 * Include <script src="deeplink.js"></script> on app pages.
 */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () {
    var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App || !App.addListener) return;
    App.addListener('appUrlOpen', function (data) {
      try {
        var url = (data && data.url) || '';
        if (url.indexOf('sengp://') !== 0) return;
        var Browser = window.Capacitor.Plugins.Browser;
        if (Browser && Browser.close) { try { Browser.close(); } catch (e) {} }
        if (url.indexOf('payment/success') >= 0) {
          window.location.href = 'envois.html';
        } else if (url.indexOf('payment/error') >= 0) {
          window.location.href = 'dashexpediteur.html';
        }
      } catch (e) { /* no-op */ }
    });
  });
})();
