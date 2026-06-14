/**
 * Runtime API configuration for the SEN GP frontend.
 *
 * In local development the frontend is served separately (file:// or :8100)
 * while the backend runs on :5000, so we point at the local backend.
 * In production the backend serves these static files from the same origin and
 * exposes the API at /api/v1 (see backend/src/app.ts), so a relative path works.
 *
 * Pages read `window.API_BASE_URL`.
 */
(function () {
  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

  window.API_BASE_URL = isLocal
    ? 'http://localhost:5000/api/v1'
    : '/api/v1';
})();
