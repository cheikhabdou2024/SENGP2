import { resolveAllowedOrigins, isOriginAllowed } from '../src/config/cors';

describe('resolveAllowedOrigins', () => {
  it('en production sans FRONTEND_URL, n\'autorise jamais "tout le monde"', () => {
    const allowed = resolveAllowedOrigins(undefined, 'production');
    expect(allowed).not.toContain('*');
    expect(isOriginAllowed('https://sengp.vercel.app', allowed)).toBe(true);
    expect(isOriginAllowed('https://www.sengp.co', allowed)).toBe(true);
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
  });

  it('autorise toujours les webviews des applications natives', () => {
    const allowed = resolveAllowedOrigins('https://app.example', 'production');
    expect(isOriginAllowed('https://localhost', allowed)).toBe(true);
    expect(isOriginAllowed('capacitor://localhost', allowed)).toBe(true);
  });

  it('FRONTEND_URL remplace la liste par défaut, espaces et "/" final ignorés', () => {
    const allowed = resolveAllowedOrigins(' https://a.example/ , https://b.example ', 'production');
    expect(isOriginAllowed('https://a.example', allowed)).toBe(true);
    expect(isOriginAllowed('https://b.example', allowed)).toBe(true);
    expect(isOriginAllowed('https://sengp.vercel.app', allowed)).toBe(false);
  });

  it('hors production sans FRONTEND_URL, tout est permis (développement local)', () => {
    expect(isOriginAllowed('http://localhost:3000', resolveAllowedOrigins(undefined, 'development'))).toBe(true);
  });

  it('"*" explicite reste possible mais seul', () => {
    expect(resolveAllowedOrigins('*', 'production')).toEqual(['*']);
  });
});
