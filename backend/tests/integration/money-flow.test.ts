import pool from '../../src/config/database';
import {
  api, auth, closeDatabase, createMission, insertPendingPayment, postWaveWebhook,
  registerUser, resetData, setupDatabase, TestUser,
} from './helpers';

const wallet = async (userId: string) => {
  const r = await pool.query('SELECT available_balance, total_earned FROM wallet_balances WHERE user_id = $1', [userId]);
  return r.rows[0] ? { available: Number(r.rows[0].available_balance), earned: Number(r.rows[0].total_earned) } : { available: 0, earned: 0 };
};
const EMPTY = { available: 0, earned: 0 };
const payment = async (id: string) => (await pool.query('SELECT * FROM payments WHERE id = $1', [id])).rows[0];
const spent = async (userId: string) =>
  Number((await pool.query('SELECT total_spent FROM expediteur_profiles WHERE user_id = $1', [userId])).rows[0].total_spent);

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

describe('webhook de paiement Wave', () => {
  let owner: TestUser;
  let mission: { id: string };

  beforeEach(async () => {
    owner = await registerUser('expediteur');
    mission = await createMission(owner);
  });

  const completedEvent = (code: string) => ({
    type: 'checkout.session.completed',
    data: { id: 'cos-1', client_reference: code, checkout_status: 'complete' },
  });

  it('rejette une signature invalide et laisse le paiement en attente', async () => {
    const p = await insertPendingPayment(mission, owner, null);
    const res = await postWaveWebhook(completedEvent(p.payment_code), 't=1,v1=deadbeef');
    expect(res.status).toBe(400);
    expect((await payment(p.id)).status).toBe('pending');
    expect(await spent(owner.id)).toBe(0);
  });

  it('règle le paiement une seule fois, même si le webhook est rejoué', async () => {
    const p = await insertPendingPayment(mission, owner, null, 20000);

    const first = await postWaveWebhook(completedEvent(p.payment_code));
    expect(first.status).toBe(200);
    expect((await payment(p.id)).status).toBe('completed');
    expect(await spent(owner.id)).toBe(20000);

    const replay = await postWaveWebhook(completedEvent(p.payment_code));
    expect(replay.status).toBe(200);
    expect(await spent(owner.id)).toBe(20000);
  });

  it('répond 404 pour une référence inconnue', async () => {
    const res = await postWaveWebhook(completedEvent('PAY-INCONNU'));
    expect(res.status).toBe(404);
  });

  it('marque un paiement échoué sans toucher aux dépenses', async () => {
    const p = await insertPendingPayment(mission, owner, null);
    const res = await postWaveWebhook({
      type: 'checkout.session.expired',
      data: { id: 'cos-2', client_reference: p.payment_code, checkout_status: 'expired' },
    });
    expect(res.status).toBe(200);
    expect((await payment(p.id)).status).toBe('failed');
    expect(await spent(owner.id)).toBe(0);
  });
});

describe('livraison et crédit du portefeuille GP', () => {
  let owner: TestUser;
  let gp: TestUser;
  let mission: { id: string };
  let pay: any;

  beforeEach(async () => {
    owner = await registerUser('expediteur');
    gp = await registerUser('gp');
    mission = await createMission(owner);
    pay = await insertPendingPayment(mission, owner, gp.id, 20000);
    await postWaveWebhook({
      type: 'checkout.session.completed',
      data: { id: 'cos-9', client_reference: pay.payment_code, checkout_status: 'complete' },
    });
    await pool.query(
      `UPDATE missions SET gp_id = $1, status = 'out_for_delivery', arrival_confirmed = TRUE WHERE id = $2`,
      [gp.id, mission.id]
    );
  });

  const deliver = () => {
    const qr = JSON.stringify({ id: mission.id });
    return api().post('/api/v1/missions/verify-pair').set(auth(gp)).send({ package_qr: qr, recipient_qr: qr });
  };

  it('crédite le GP du montant net, exactement une fois', async () => {
    const net = Number(pay.net_amount);
    expect(await wallet(gp.id)).toEqual(EMPTY);

    const first = await deliver();
    expect(first.status).toBe(200);
    expect(await wallet(gp.id)).toEqual({ available: net, earned: net });
    expect((await pool.query('SELECT status FROM missions WHERE id = $1', [mission.id])).rows[0].status).toBe('delivered');

    const second = await deliver();
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await wallet(gp.id)).toEqual({ available: net, earned: net });
  });

  it('ne crédite rien tant que l\'arrivée n\'est pas confirmée par l\'admin', async () => {
    await pool.query('UPDATE missions SET arrival_confirmed = FALSE WHERE id = $1', [mission.id]);
    const res = await deliver();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await wallet(gp.id)).toEqual(EMPTY);
  });

  it('refuse la livraison par un autre GP', async () => {
    const other = await registerUser('gp');
    const qr = JSON.stringify({ id: mission.id });
    const res = await api().post('/api/v1/missions/verify-pair').set(auth(other)).send({ package_qr: qr, recipient_qr: qr });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await wallet(other.id)).toEqual(EMPTY);
    expect(await wallet(gp.id)).toEqual(EMPTY);
  });
});
