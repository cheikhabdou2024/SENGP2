import axios from 'axios';
import pool from '../../src/config/database';
import { invalidateSettingsCache } from '../../src/services/settings.service';
import { api, auth, closeDatabase, createAdmin, createMission, registerUser, resetData, setupDatabase } from './helpers';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeAll(setupDatabase);
beforeEach(async () => {
  await resetData();
  await pool.query(`DELETE FROM platform_setting WHERE key IN ('commission_pct','insurance_pct','min_withdrawal')`);
  invalidateSettingsCache();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
  mockedAxios.post.mockReset();
  mockedAxios.post.mockResolvedValue({ data: { id: 'cs_test_1', url: 'https://checkout.stripe.test/c/cs_test_1', expires_at: 1 } });
});
afterAll(closeDatabase);

describe('filtres de statut (F3)', () => {
  it('accepte tous les statuts de la base et refuse proprement les autres', async () => {
    const admin = await createAdmin();
    const ok = async (path: string, status: string) =>
      expect((await api().get(`/api/v1/admin/${path}?status=${status}`).set(auth(admin))).status).toBe(200);

    for (const s of ['pending', 'matched', 'accepted', 'picked_up', 'in_transit', 'in_customs', 'out_for_delivery', 'delivered', 'cancelled', 'disputed']) await ok('missions', s);
    for (const s of ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled']) await ok('payments', s);
    for (const s of ['pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled']) await ok('withdrawals', s);
    for (const s of ['open', 'in_progress', 'resolved', 'rejected', 'closed']) await ok('claims', s);

    const bad = await api().get('/api/v1/admin/claims?status=investigating').set(auth(admin));
    expect(bad.status).toBe(400);
    expect((await api().get('/api/v1/admin/missions?status=nimporte').set(auth(admin))).status).toBe(400);
    expect((await api().get('/api/v1/admin/missions?status=').set(auth(admin))).status).toBe(200);
  });
});

describe('mode de paiement de la mission (F2)', () => {
  it('enregistre « à la livraison » et l\'affiche dans la liste admin', async () => {
    const owner = await registerUser('expediteur');
    const admin = await createAdmin();
    const m = await createMission(owner, { payment_method: 'cod' });
    expect((await pool.query('SELECT payment_method FROM missions WHERE id = $1', [m.id])).rows[0].payment_method).toBe('cod');

    const list = await api().get('/api/v1/admin/missions').set(auth(admin));
    const row = list.body.data.find((x: any) => x.id === m.id);
    expect(row.payment_method).toBe('cod');
    expect(row.paid).toBe(false);
  });

  it('refuse un mode de paiement inconnu à la création', async () => {
    const owner = await registerUser('expediteur');
    const res = await api().post('/api/v1/missions').set(auth(owner)).send({
      departure_country: 'Sénégal', departure_city: 'Dakar', pickup_address: 'a', arrival_country: 'France', arrival_city: 'Paris',
      delivery_address: 'b', package_weight: 1, desired_departure_date: new Date(Date.now() + 864e5).toISOString(), offered_price: 1000, payment_method: 'troc',
    });
    expect(res.status).toBe(400);
  });

  it('retient le mode choisi quand un paiement en ligne est lancé', async () => {
    const owner = await registerUser('expediteur');
    const m = await createMission(owner);
    await api().post('/api/v1/payments').set(auth(owner)).send({ mission_id: m.id, payment_method: 'card' });
    expect((await pool.query('SELECT payment_method FROM missions WHERE id = $1', [m.id])).rows[0].payment_method).toBe('card');
  });

  it('compte les missions livrées payées à la livraison dans la ventilation par mode', async () => {
    const owner = await registerUser('expediteur');
    const admin = await createAdmin();
    const m = await createMission(owner, { payment_method: 'cod', offered_price: 15000 });
    await pool.query(`UPDATE missions SET status = 'delivered' WHERE id = $1`, [m.id]);
    const today = new Date().toISOString().slice(0, 10);
    const r = await api().get(`/api/v1/admin/analytics/payment-methods?from=${today}&to=${today}`).set(auth(admin));
    expect(r.status).toBe(200);
    const cod = r.body.data.find((x: any) => x.method === 'cod');
    expect(Number(cod.amount)).toBe(15000);
    expect(Number(cod.count)).toBe(1);
  });
});

describe('réglages réellement appliqués (F1)', () => {
  it('la commission enregistrée s\'applique au prochain paiement', async () => {
    const owner = await registerUser('expediteur');
    const admin = await createAdmin();
    const m1 = await createMission(owner, { offered_price: 20000 });
    const first = await api().post('/api/v1/payments').set(auth(owner)).send({ mission_id: m1.id, payment_method: 'card' });
    expect(Number(first.body.data.payment.commission)).toBe(3000); // 15 % par défaut

    const put = await api().put('/api/v1/admin/settings').set(auth(admin)).send({ commission_pct: 10 });
    expect(put.status).toBe(200);
    const m2 = await createMission(owner, { offered_price: 20000 });
    const second = await api().post('/api/v1/payments').set(auth(owner)).send({ mission_id: m2.id, payment_method: 'card' });
    expect(Number(second.body.data.payment.commission)).toBe(2000);
    expect(Number(second.body.data.payment.net_amount)).toBe(18000);
  });

  it('le retrait minimum enregistré s\'applique aux demandes de retrait', async () => {
    const gp = await registerUser('gp');
    const admin = await createAdmin();
    await pool.query(`UPDATE wallet_balances SET available_balance = 100000 WHERE user_id = $1`, [gp.id]);
    const ask = (amount: number) => api().post('/api/v1/withdrawals').set(auth(gp))
      .send({ amount, method: 'wave', account_number: '770000000', account_name: 'GP' });

    expect((await ask(8000)).status).toBe(201);
    await api().put('/api/v1/admin/settings').set(auth(admin)).send({ min_withdrawal: 20000 });
    expect((await ask(8000)).status).toBe(400);
  });

  it('l\'assurance enregistrée s\'applique au calcul du coût de la mission', async () => {
    const owner = await registerUser('expediteur');
    const admin = await createAdmin();
    await api().put('/api/v1/admin/settings').set(auth(admin)).send({ insurance_pct: 5 });
    const m = await createMission(owner, { is_insured: true, package_value: 100000 });
    expect(Number((await pool.query('SELECT insurance_cost FROM missions WHERE id = $1', [m.id])).rows[0].insurance_cost)).toBe(5000);
  });

  it('refuse une valeur hors limites et ne garde que les réglages connus', async () => {
    const admin = await createAdmin();
    for (const body of [{ commission_pct: -1 }, { commission_pct: 90 }, { commission_pct: 'abc' }, { min_withdrawal: 1.5 }]) {
      expect((await api().put('/api/v1/admin/settings').set(auth(admin)).send(body)).status).toBe(400);
    }
    expect((await api().put('/api/v1/admin/settings').set(auth(admin)).send({ supported_countries: ['X'] })).status).toBe(400);
    expect((await pool.query(`SELECT 1 FROM platform_setting WHERE key = 'commission_pct'`)).rows).toHaveLength(0);
  });

  it('journalise l\'ancienne et la nouvelle valeur', async () => {
    const admin = await createAdmin();
    await api().put('/api/v1/admin/settings').set(auth(admin)).send({ commission_pct: 12 });
    await new Promise((r) => setTimeout(r, 300));
    const log = (await pool.query(`SELECT metadata FROM admin_logs WHERE action = 'settings.update' ORDER BY created_at DESC LIMIT 1`)).rows[0];
    expect(log.metadata.before.commission_pct).toBe(15);
    expect(log.metadata.after.commission_pct).toBe(12);
  });
});
