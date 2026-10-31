import axios from 'axios';
import pool from '../../src/config/database';
import { MissionService } from '../../src/services/mission.service';
import { MissionStatus } from '../../src/types';
import {
  api, auth, closeDatabase, createAdmin, createMission, insertPendingPayment, postWaveWebhook,
  registerUser, resetData, setupDatabase, TestUser,
} from './helpers';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

process.env.WAVE_API_KEY = 'wave_test_key';

beforeAll(setupDatabase);
beforeEach(async () => {
  await resetData();
  mockedAxios.post.mockReset();
  mockedAxios.post.mockResolvedValue({ data: { id: 'cos-x', wave_launch_url: 'https://pay.test/x' } });
});
afterAll(closeDatabase);

const paymentRow = async (id: string) => (await pool.query('SELECT * FROM payments WHERE id = $1', [id])).rows[0];
const balance = async (userId: string) =>
  Number((await pool.query('SELECT available_balance FROM wallet_balances WHERE user_id = $1', [userId])).rows[0].available_balance);

const completed = (code: string, amount?: number) => ({
  type: 'checkout.session.completed',
  data: { id: 'cos-1', client_reference: code, checkout_status: 'complete', ...(amount !== undefined ? { amount: String(amount) } : {}) },
});

describe('création de paiement', () => {
  it('utilise le prix de la mission, jamais le montant envoyé par le client', async () => {
    const owner = await registerUser('expediteur');
    const m = await createMission(owner, { offered_price: 20000 });

    const res = await api().post('/api/v1/payments').set(auth(owner)).send({ mission_id: m.id, payment_method: 'wave', amount: 1 });
    expect(res.status).toBeLessThan(300);

    const p = (await pool.query('SELECT amount FROM payments WHERE mission_id = $1', [m.id])).rows[0];
    expect(Number(p.amount)).toBe(20000);
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({ amount: '20000' });
  });

  it('refuse de payer deux fois la même mission', async () => {
    const owner = await registerUser('expediteur');
    const m = await createMission(owner);
    const first = await insertPendingPayment(m, owner, null);
    await postWaveWebhook(completed(first.payment_code));

    const res = await api().post('/api/v1/payments').set(auth(owner)).send({ mission_id: m.id, payment_method: 'wave' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query(`SELECT count(*)::int AS n FROM payments WHERE mission_id = $1`, [m.id])).rows[0].n).toBe(1);
  });

  it('la base interdit deux paiements réglés pour une même mission', async () => {
    const owner = await registerUser('expediteur');
    const m = await createMission(owner);
    const a = await insertPendingPayment(m, owner, null);
    const b = await insertPendingPayment(m, owner, null);
    await postWaveWebhook(completed(a.payment_code));
    await postWaveWebhook(completed(b.payment_code));
    expect((await paymentRow(a.id)).status).toBe('completed');
    expect((await paymentRow(b.id)).status).not.toBe('completed');
  });
});

describe('webhook', () => {
  it('refuse un règlement dont le montant diffère du montant attendu', async () => {
    const owner = await registerUser('expediteur');
    const m = await createMission(owner);
    const p = await insertPendingPayment(m, owner, null, 20000);

    const res = await postWaveWebhook(completed(p.payment_code, 100));
    expect(res.status).toBe(400);
    expect((await paymentRow(p.id)).status).toBe('pending');

    const ok = await postWaveWebhook(completed(p.payment_code, 20000));
    expect(ok.status).toBe(200);
    expect((await paymentRow(p.id)).status).toBe('completed');
  });
});

describe('livraison et remboursement', () => {
  let owner: TestUser;
  let gp: TestUser;
  let admin: TestUser;
  let mission: { id: string };
  let pay: any;

  beforeEach(async () => {
    owner = await registerUser('expediteur');
    gp = await registerUser('gp');
    admin = await createAdmin();
    mission = await createMission(owner);
    pay = await insertPendingPayment(mission, owner, null, 20000);
    await postWaveWebhook(completed(pay.payment_code));
    await pool.query(
      `UPDATE missions SET gp_id = $1, status = 'out_for_delivery', arrival_confirmed = TRUE WHERE id = $2`,
      [gp.id, mission.id]
    );
  });

  const refund = () => api().post(`/api/v1/admin/payments/${pay.id}/refund`).set(auth(admin)).send({ reason: 'test' });

  it('crédite une seule fois quand deux livraisons arrivent en même temps', async () => {
    const run = () => MissionService.updateStatus(mission.id, MissionStatus.DELIVERED, gp.id, { internal: true });
    const results = await Promise.allSettled([run(), run()]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balance(gp.id)).toBe(Number(pay.net_amount));
    expect((await paymentRow(pay.id)).credited_at).not.toBeNull();
  });

  it('refuse le remboursement d\'un paiement déjà crédité au GP', async () => {
    await MissionService.updateStatus(mission.id, MissionStatus.DELIVERED, gp.id, { internal: true });
    const res = await refund();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await paymentRow(pay.id)).status).toBe('completed');
    expect(await balance(gp.id)).toBe(Number(pay.net_amount));
  });

  it('un remboursement avant livraison empêche tout crédit ultérieur', async () => {
    const res = await refund();
    expect(res.status).toBe(200);
    expect((await paymentRow(pay.id)).status).toBe('refunded');

    await MissionService.updateStatus(mission.id, MissionStatus.DELIVERED, gp.id, { internal: true });
    expect(await balance(gp.id)).toBe(0);
  });

  it('un webhook tardif ne ressuscite pas un paiement remboursé', async () => {
    await refund();
    const res = await postWaveWebhook(completed(pay.payment_code));
    expect(res.status).toBe(200);
    expect((await paymentRow(pay.id)).status).toBe('refunded');
  });
});
