import axios from 'axios';
import crypto from 'crypto';
import pool from '../../src/config/database';
import { api, auth, closeDatabase, createMission, registerUser, resetData, setupDatabase } from './helpers';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const WHSEC = 'whsec_stripe_test';

beforeAll(setupDatabase);
beforeEach(async () => {
  await resetData();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  mockedAxios.post.mockReset();
  mockedAxios.post.mockResolvedValue({ data: { id: 'cs_test_1', url: 'https://checkout.stripe.test/c/cs_test_1', expires_at: 1 } });
});
afterAll(closeDatabase);

const row = async (code: string) => (await pool.query('SELECT * FROM payments WHERE payment_code = $1', [code])).rows[0];

function stripeWebhook(event: object, opts: { secret?: string; ts?: number } = {}) {
  const raw = JSON.stringify(event);
  const t = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const v1 = crypto.createHmac('sha256', opts.secret ?? WHSEC).update(`${t}.${raw}`).digest('hex');
  return api().post('/api/v1/payments/webhook/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', `t=${t},v1=${v1}`).send(raw);
}

const session = (type: string, code: string, extra: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type,
  data: { object: { id: 'cs_test_1', client_reference_id: code, amount_total: 20000, currency: 'xof', payment_status: 'paid', payment_intent: 'pi_1', ...extra } },
});

async function startCardPayment() {
  const owner = await registerUser('expediteur');
  const m = await createMission(owner, { offered_price: 20000 });
  const res = await api().post('/api/v1/payments').set(auth(owner)).set('Accept-Language', 'it').send({ mission_id: m.id, payment_method: 'card' });
  return { owner, m, res };
}

describe('paiement par carte (Stripe Checkout)', () => {
  it('ouvre une session Stripe au prix de la mission, en XOF sans décimales, dans la langue du payeur', async () => {
    const { res, m } = await startCardPayment();
    expect(res.status).toBe(201);
    expect(res.body.data.redirect_url).toBe('https://checkout.stripe.test/c/cs_test_1');

    const [url, body, conf] = mockedAxios.post.mock.calls[0] as any[];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const form = new URLSearchParams(body);
    expect(form.get('line_items[0][price_data][currency]')).toBe('xof');
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('20000');
    expect(form.get('locale')).toBe('it');
    expect(form.get('mode')).toBe('payment');
    expect(form.get('payment_method_types[0]')).toBe('card');
    expect(form.get('client_reference_id')).toBe(res.body.data.payment.payment_code);
    expect(conf.headers.Authorization).toBe('Bearer sk_test_x');
    expect(conf.headers['Idempotency-Key']).toBe(res.body.data.payment.payment_code);

    const p = await row(res.body.data.payment.payment_code);
    expect(p.payment_method).toBe('card');
    expect(p.mission_id).toBe(m.id);
    expect(p.status).toBe('pending');
  });

  it("refuse la carte, sans rien enregistrer, tant que Stripe n'est pas configuré", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { res, m } = await startCardPayment();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Il pagamento con carta non è disponibile');
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect((await pool.query('SELECT count(*)::int AS n FROM payments WHERE mission_id = $1', [m.id])).rows[0].n).toBe(0);
  });

  it('annonce la disponibilité de la carte', async () => {
    const owner = await registerUser('expediteur');
    expect((await api().get('/api/v1/payments/methods').set(auth(owner))).body.data).toEqual({ card: true });
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await api().get('/api/v1/payments/methods').set(auth(owner))).body.data).toEqual({ card: false });
  });

  it('règle le paiement sur checkout.session.completed, une seule fois', async () => {
    const { res, owner } = await startCardPayment();
    const code = res.body.data.payment.payment_code;

    const first = await stripeWebhook(session('checkout.session.completed', code));
    expect(first.status).toBe(200);
    const p = await row(code);
    expect(p.status).toBe('completed');
    expect(p.external_transaction_id).toBe('pi_1');

    expect((await stripeWebhook(session('checkout.session.completed', code))).body.message).toBe('Already processed');
    const spent = (await pool.query('SELECT total_spent FROM expediteur_profiles WHERE user_id = $1', [owner.id])).rows[0].total_spent;
    expect(Number(spent)).toBe(20000);
  });

  it('rejette une signature invalide, un mauvais secret et un horodatage trop ancien', async () => {
    const { res } = await startCardPayment();
    const code = res.body.data.payment.payment_code;
    const evt = session('checkout.session.completed', code);

    expect((await stripeWebhook(evt, { secret: 'whsec_autre' })).status).toBe(400);
    expect((await stripeWebhook(evt, { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
    const noSig = await api().post('/api/v1/payments/webhook/stripe').set('Content-Type', 'application/json').send(JSON.stringify(evt));
    expect(noSig.status).toBe(400);
    expect((await row(code)).status).toBe('pending');
  });

  it('rejette un montant ou une devise différents de ce qui a été demandé', async () => {
    const { res } = await startCardPayment();
    const code = res.body.data.payment.payment_code;

    expect((await stripeWebhook(session('checkout.session.completed', code, { amount_total: 100 }))).body.message).toBe('Amount mismatch');
    expect((await stripeWebhook(session('checkout.session.completed', code, { currency: 'eur' }))).body.message).toBe('Currency mismatch');
    expect((await row(code)).status).toBe('pending');
  });

  it("n'encaisse pas tant que la session n'est pas payée", async () => {
    const { res } = await startCardPayment();
    const code = res.body.data.payment.payment_code;

    await stripeWebhook(session('checkout.session.completed', code, { payment_status: 'unpaid' }));
    expect((await row(code)).status).toBe('pending');
    await stripeWebhook(session('checkout.session.async_payment_succeeded', code));
    expect((await row(code)).status).toBe('completed');
  });

  it('marque le paiement échoué quand la session expire', async () => {
    const { res } = await startCardPayment();
    const code = res.body.data.payment.payment_code;
    await stripeWebhook(session('checkout.session.expired', code, { payment_status: 'unpaid' }));
    expect((await row(code)).status).toBe('failed');
  });

  it("ignore un événement qui n'appartient à aucun paiement", async () => {
    const res = await stripeWebhook(session('checkout.session.completed', 'PAY-INCONNU'));
    expect(res.status).toBe(404);
  });
});
