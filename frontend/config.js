/**
 * Runtime API configuration for the SEN GP frontend.
 *
 * Resolution order:
 *  - Native mobile app (Capacitor / Play Store / App Store): the app is bundled
 *    on the device and loads from capacitor://localhost, so it has NO same-origin
 *    backend. It must call the deployed API over HTTPS — set PROD_API_BASE_URL.
 *  - Local web dev (localhost / file://): talk to the local backend on :5000.
 *  - Deployed web: the backend serves these files from the same origin and
 *    exposes /api/v1, so a relative path works.
 *
 * Pages read `window.API_BASE_URL`.
 */
(function () {
  // ⚠️ SET THIS to your deployed HTTPS API base URL before building the mobile
  // app (e.g. https://api.sengp.com/api/v1). Must be HTTPS — Android/iOS block
  // cleartext HTTP by default.
  var PROD_API_BASE_URL = 'https://2txjgdd3cj.us-east-1.awsapprunner.com/api/v1';

  var isNative = !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );

  if (isNative) {
    window.API_BASE_URL = PROD_API_BASE_URL;
    return;
  }

  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

  window.API_BASE_URL = isLocal
    ? 'http://localhost:5000/api/v1'
    : '/api/v1';
})();
