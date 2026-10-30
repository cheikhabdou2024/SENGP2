import { missionIdFromPackageQr, tokenFromRecipientQr } from '../src/utils/qr';

describe('tokenFromRecipientQr', () => {
  const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  it('lit le jeton dans le lien de livraison', () => {
    expect(tokenFromRecipientQr(`https://api.sengp.co/d/${token}`)).toBe(token);
  });

  it('ignore les espaces autour du lien', () => {
    expect(tokenFromRecipientQr(`  https://x.test/d/${token}\n`)).toBe(token);
  });

  it('accepte un jeton brut', () => {
    expect(tokenFromRecipientQr(token)).toBe(token);
  });

  it('accepte un JSON contenant le jeton', () => {
    expect(tokenFromRecipientQr(JSON.stringify({ token }))).toBe(token);
  });

  it('refuse un contenu étranger ou vide', () => {
    expect(tokenFromRecipientQr('https://example.com/autre')).toBeNull();
    expect(tokenFromRecipientQr('')).toBeNull();
    expect(tokenFromRecipientQr('court')).toBeNull();
  });
});

describe('missionIdFromPackageQr', () => {
  it('lit l’identifiant dans l’ancien QR JSON', () => {
    expect(missionIdFromPackageQr(JSON.stringify({ id: 'abc-123', mission_code: 'MSN-1' }))).toBe('abc-123');
  });

  it('retourne null pour un lien ou un JSON sans identifiant', () => {
    expect(missionIdFromPackageQr('https://api.sengp.co/d/a1b2c3d4e5f6')).toBeNull();
    expect(missionIdFromPackageQr(JSON.stringify({ mission_code: 'MSN-1' }))).toBeNull();
  });
});
