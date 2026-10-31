import pool from '../../src/config/database';
import { withTransaction } from '../../src/utils/transaction';
import {
  api, auth, closeDatabase, createAdmin, createMission, insertPendingPayment, postWaveWebhook,
  registerUser, resetData, setupDatabase,
} from './helpers';

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

async function createTrip(gpId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO trips (trip_code, gp_id, departure_country, departure_city, arrival_country, arrival_city,
       departure_date, arrival_date, available_weight, status)
     VALUES ('TRP-IT-' || substr(md5(random()::text), 1, 8), $1,'Sénégal','Dakar','France','Paris',
       NOW() + interval '3 days', NOW() + interval '4 days', 20, 'published')
     RETURNING id`,
    [gpId]
  );
  return r.rows[0].id;
}

describe('affectation et acceptation', () => {
  it('l\'admin affecte, le GP accepte, le trajet compte le colis une seule fois', async () => {
    const owner = await registerUser('expediteur');
    const gp = await registerUser('gp');
    const admin = await createAdmin();
    const mission = await createMission(owner);
    const tripId = await createTrip(gp.id);

    const assign = await api().post(`/api/v1/admin/missions/${mission.id}/assign`).set(auth(admin))
      .send({ gp_id: gp.id, trip_id: tripId });
    expect(assign.status).toBe(200);

    const first = await api().post(`/api/v1/missions/${mission.id}/accept`).set(auth(gp)).send({});
    expect(first.status).toBe(200);
    const second = await api().post(`/api/v1/missions/${mission.id}/accept`).set(auth(gp)).send({});
    expect(second.status).toBeGreaterThanOrEqual(400);

    const trip = (await pool.query('SELECT current_packages FROM trips WHERE id = $1', [tripId])).rows[0];
    expect(Number(trip.current_packages)).toBe(1);
    expect((await pool.query('SELECT status FROM missions WHERE id = $1', [mission.id])).rows[0].status).toBe('accepted');
  });

  it('deux acceptations simultanées ne comptent le colis qu\'une fois', async () => {
    const owner = await registerUser('expediteur');
    const gp = await registerUser('gp');
    const admin = await createAdmin();
    const mission = await createMission(owner);
    const tripId = await createTrip(gp.id);
    await api().post(`/api/v1/admin/missions/${mission.id}/assign`).set(auth(admin)).send({ gp_id: gp.id, trip_id: tripId });

    const call = () => api().post(`/api/v1/missions/${mission.id}/accept`).set(auth(gp)).send({});
    const [a, b] = await Promise.all([call(), call()]);

    expect([a.status, b.status].filter(s => s === 200)).toHaveLength(1);
    const trip = (await pool.query('SELECT current_packages FROM trips WHERE id = $1', [tripId])).rows[0];
    expect(Number(trip.current_packages)).toBe(1);
  });

  it('un GP ne peut pas accepter une mission affectée à un autre', async () => {
    const owner = await registerUser('expediteur');
    const gp = await registerUser('gp');
    const other = await registerUser('gp');
    const admin = await createAdmin();
    const mission = await createMission(owner);
    await api().post(`/api/v1/admin/missions/${mission.id}/assign`).set(auth(admin)).send({ gp_id: gp.id });

    const res = await api().post(`/api/v1/missions/${mission.id}/accept`).set(auth(other)).send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query('SELECT status FROM missions WHERE id = $1', [mission.id])).rows[0].status).toBe('matched');
  });
});

describe('paiement : erreurs typées', () => {
  it('répond 409 quand la mission est déjà payée', async () => {
    const owner = await registerUser('expediteur');
    const mission = await createMission(owner);
    const p = await insertPendingPayment(mission, owner, null);
    await postWaveWebhook({
      type: 'checkout.session.completed',
      data: { id: 'c1', client_reference: p.payment_code, checkout_status: 'complete' },
    });

    const res = await api().post('/api/v1/payments').set(auth(owner)).send({ mission_id: mission.id, payment_method: 'wave' });
    expect(res.status).toBe(409);
  });
});

describe('withTransaction', () => {
  it('valide si la fonction réussit, annule et relance si elle échoue', async () => {
    const owner = await registerUser('expediteur');

    await expect(withTransaction(async c => {
      await c.query(`UPDATE users SET first_name = 'Annule' WHERE id = $1`, [owner.id]);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect((await pool.query('SELECT first_name FROM users WHERE id = $1', [owner.id])).rows[0].first_name).toBe('Test');

    await withTransaction(c => c.query(`UPDATE users SET first_name = 'Valide' WHERE id = $1`, [owner.id]));
    expect((await pool.query('SELECT first_name FROM users WHERE id = $1', [owner.id])).rows[0].first_name).toBe('Valide');
  });
});
