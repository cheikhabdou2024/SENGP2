import crypto from 'crypto';

/** Comparaison de secrets en temps constant (évite de révéler la longueur ou le préfixe correct). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
