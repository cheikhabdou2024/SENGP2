/**
 * Lecture des contenus de QR code SEN GP (fonctions pures, sans accès base de données).
 *
 * Un envoi porte un seul QR : le lien `/d/<jeton>`. L'ancien format JSON `{ id, ... }`
 * reste lisible pour les QR déjà imprimés.
 */

/** Identifiant de mission contenu dans un ancien QR JSON, sinon null. */
export function missionIdFromPackageQr(qr: string): string | null {
  try {
    const parsed = JSON.parse(qr);
    return parsed && parsed.id ? String(parsed.id) : null;
  } catch {
    return null;
  }
}

/** Jeton de livraison contenu dans un lien `/d/<jeton>`, un JSON `{ token }` ou un jeton brut, sinon null. */
export function tokenFromRecipientQr(qr: string): string | null {
  const text = String(qr || '').trim();
  const link = text.match(/\/d\/([A-Za-z0-9_-]{8,100})/);
  if (link) return link[1];
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.token) return String(parsed.token);
  } catch {
    /* ce n'est pas du JSON */
  }
  return /^[A-Za-z0-9_-]{16,100}$/.test(text) ? text : null;
}
