import {
  missionAccessLevel,
  toPoolView,
  pickEditableFields,
  EDITABLE_MISSION_FIELDS,
} from '../src/utils/missionAccess';

const owner = { id: 'u-exp', user_type: 'expediteur' };
const gp = { id: 'u-gp', user_type: 'gp' };
const otherGp = { id: 'u-gp2', user_type: 'gp' };
const stranger = { id: 'u-x', user_type: 'expediteur' };
const admin = { id: 'u-adm', user_type: 'admin' };

describe('missionAccessLevel', () => {
  const pending = { expediteur_id: 'u-exp', gp_id: null, status: 'pending' };
  const assigned = { expediteur_id: 'u-exp', gp_id: 'u-gp', status: 'matched' };

  it('donne un accès complet à l’admin, au propriétaire et au GP assigné', () => {
    expect(missionAccessLevel(admin, assigned)).toBe('full');
    expect(missionAccessLevel(owner, assigned)).toBe('full');
    expect(missionAccessLevel(gp, assigned)).toBe('full');
  });

  it('refuse un expéditeur tiers', () => {
    expect(missionAccessLevel(stranger, pending)).toBe('none');
    expect(missionAccessLevel(stranger, assigned)).toBe('none');
  });

  it('donne une vue réduite à un GP sur une mission non assignée', () => {
    expect(missionAccessLevel(otherGp, pending)).toBe('pool');
  });

  it('refuse un GP non assigné dès que la mission est prise', () => {
    expect(missionAccessLevel(otherGp, assigned)).toBe('none');
    expect(missionAccessLevel(otherGp, { ...pending, status: 'accepted' })).toBe('none');
  });
});

describe('toPoolView', () => {
  const full = {
    id: 'm1',
    mission_code: 'MIS-1',
    status: 'pending',
    arrival_city: 'Paris',
    price: 35000,
    expediteur_phone: '+221770000000',
    gp_phone: '+33600000000',
    delivery_token: 'secret-token',
    qr_code_url: 'data:image/png;base64,AAA',
    pickup_address: '12 rue X',
    delivery_address: '3 rue Y',
    recipient_name: 'Awa',
    recipient_phone: '+33611111111',
    tracking_number: 'TRK-1',
    package_value: 90000,
  };

  it('retire coordonnées, adresses, jeton de livraison et QR', () => {
    const view = toPoolView(full);
    for (const secret of [
      'expediteur_phone', 'gp_phone', 'delivery_token', 'qr_code_url', 'pickup_address',
      'delivery_address', 'recipient_name', 'recipient_phone', 'tracking_number', 'package_value',
    ]) {
      expect(view).not.toHaveProperty(secret);
    }
  });

  it('garde les informations utiles à la recherche d’une mission', () => {
    expect(toPoolView(full)).toMatchObject({ id: 'm1', mission_code: 'MIS-1', arrival_city: 'Paris', price: 35000 });
  });
});

describe('pickEditableFields', () => {
  it('ignore statut, GP, prix, paiement et clés SQL malveillantes', () => {
    const picked = pickEditableFields({
      status: 'delivered',
      gp_id: 'u-gp',
      offered_price: 1,
      final_price: 1,
      arrival_confirmed: true,
      "status = 'x', gp_id = (SELECT 1) --": 'x',
      package_description: 'Vêtements',
    });
    expect(picked).toEqual({ package_description: 'Vêtements' });
  });

  it('ne retourne que des champs de la liste blanche', () => {
    const body: Record<string, any> = {};
    EDITABLE_MISSION_FIELDS.forEach(k => { body[k] = 'v'; });
    expect(Object.keys(pickEditableFields(body)).sort()).toEqual([...EDITABLE_MISSION_FIELDS].sort());
  });

  it('accepte un corps vide ou absent', () => {
    expect(pickEditableFields(undefined)).toEqual({});
    expect(pickEditableFields({})).toEqual({});
  });
});
