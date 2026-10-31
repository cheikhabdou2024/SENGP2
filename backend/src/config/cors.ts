/**
 * Origins allowed to call the API from a browser.
 *
 * - FRONTEND_URL (comma-separated) overrides the defaults when set.
 * - In production without FRONTEND_URL, only the known SEN GP front ends and the
 *   native-app webviews are allowed (never "any origin").
 * - Outside production without FRONTEND_URL, every origin is allowed (local dev).
 */
const PRODUCTION_DEFAULTS = [
  'https://sengp.vercel.app',
  'https://www.sengp.co',
  'https://sengp.co',
];

// Capacitor / Ionic webviews (Android uses https://localhost, iOS capacitor://localhost).
const NATIVE_APP_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost'];

export function resolveAllowedOrigins(frontendUrl: string | undefined, nodeEnv: string | undefined): string[] {
  const configured = (frontendUrl || '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (configured.length > 0) {
    return configured.includes('*') ? ['*'] : [...configured, ...NATIVE_APP_ORIGINS];
  }
  if (nodeEnv === 'production') {
    return [...PRODUCTION_DEFAULTS, ...NATIVE_APP_ORIGINS];
  }
  return ['*'];
}

export function isOriginAllowed(origin: string, allowed: string[]): boolean {
  return allowed.includes('*') || allowed.includes(origin);
}
