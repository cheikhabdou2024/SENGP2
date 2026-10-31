import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app';
import pool from '../../src/config/database';
import { initDatabase } from '../../src/config/initDatabase';

export const api = () => request(app);

/** Crée le schéma (même chemin que le démarrage réel) et vérifie qu'il est complet. */
export async function setupDatabase(): Promise<void> {
  await initDatabase();
  const r = await pool.query(
    `SELECT to_regclass('public.users') AS users, to_regclass('public.admin_role') AS admin_role`
  );
  if (!r.rows[0].users || !r.rows[0].admin_role) {
    throw new Error('Le schéma de test n\'a pas été créé correctement.');
  }
}

/** Vide les données (les rôles admin amorcés par la migration sont conservés). */
export async function resetData(): Promise<void> {
  await pool.query(
    `TRUNCATE users, payments, missions, trips, notifications, wallet_balances,
              mission_tracking RESTART IDENTITY CASCADE`
  );
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export interface TestUser {
  id: string;
  token: string;
  email: string;
}

let counter = 0;

export async function registerUser(type: 'expediteur' | 'gp'): Promise<TestUser> {
  counter += 1;
  const email = `${type}${counter}@test.sengp`;
  const res = await api().post('/api/v1/auth/register').send({
    email,
    password: 'Passw0rd!x',
    user_type: type,
    first_name: 'Test',
    last_name: type,
  });
  if (res.status !== 201) {
    throw new Error(`register ${type} a échoué (${res.status}) : ${JSON.stringify(res.body)}`);
  }
  return { id: res.body.data.user.id, token: res.body.data.token, email };
}

export async function createAdmin(): Promise<TestUser> {
  const u = await registerUser('expediteur');
  await pool.query(`UPDATE users SET user_type = 'admin' WHERE id = $1`, [u.id]);
  const login = await api().post('/api/v1/auth/login').send({ email: u.email, password: 'Passw0rd!x' });
  return { id: u.id, token: login.body.data.token, email: u.email };
}

export const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

export function missionPayload(overrides: Record<string, unknown> = {}) {
  const day = 24 * 3600 * 1000;
  return {
    departure_country: 'Sénégal',
    departure_city: 'Dakar',
    pickup_address: '12 rue de Test, Dakar',
    arrival_country: 'France',
    arrival_city: 'Paris',
    delivery_address: '3 rue de Test, Paris',
    package_weight: 2,
    package_description: 'Vêtements',
    desired_departure_date: new Date(Date.now() + 5 * day).toISOString(),
    offered_price: 20000,
    recipient_name: 'Awa',
    recipient_phone: '+33611111111',
    ...overrides,
  };
}

export async function createMission(owner: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await api().post('/api/v1/missions').set(auth(owner)).send(missionPayload(overrides));
  if (res.status !== 201) {
    throw new Error(`création de mission échouée (${res.status}) : ${JSON.stringify(res.body)}`);
  }
  return res.body.data as { id: string; mission_code: string };
}

/** Signe un corps de webhook Wave comme le ferait le fournisseur. */
export function waveWebhook(body: object) {
  const raw = JSON.stringify(body);
  const t = String(Math.floor(Date.now() / 1000));
  const v1 = crypto.createHmac('sha256', process.env.WAVE_API_SECRET as string).update(`${t}.${raw}`).digest('hex');
  return { raw, signature: `t=${t},v1=${v1}` };
}

export async function postWaveWebhook(body: object, signatureOverride?: string) {
  const { raw, signature } = waveWebhook(body);
  return api()
    .post('/api/v1/payments/webhook/wave')
    .set('Content-Type', 'application/json')
    .set('Wave-Signature', signatureOverride ?? signature)
    .send(raw);
}

/** Insère un paiement en attente comme le ferait PaymentService.create (sans appeler le fournisseur). */
export async function insertPendingPayment(mission: { id: string }, payer: TestUser, payee: string | null, amount = 20000) {
  const commission = Math.round(amount * 0.15);
  const code = `PAY-IT-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const r = await pool.query(
    `INSERT INTO payments (payment_code, mission_id, payer_id, payee_id, amount, currency, commission,
       net_amount, payment_method, payment_provider, status, transaction_type)
     VALUES ($1,$2,$3,$4,$5,'XOF',$6,$7,'wave','wave','pending','mission_payment') RETURNING *`,
    [code, mission.id, payer.id, payee, amount, commission, amount - commission]
  );
  return r.rows[0];
}
