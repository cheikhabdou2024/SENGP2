import pool from '../../src/config/database';
import {
  api, auth, closeDatabase, createAdmin, createMission, registerUser, resetData, setupDatabase,
} from './helpers';

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

const row = async (id: string) => (await pool.query('SELECT * FROM missions WHERE id = $1', [id])).rows[0];

describe('contrôle d\'accès aux missions (régression lot 0)', () => {
  it('exige un jeton', async () => {
    expect((await api().get('/api/v1/missions')).status).toBe(401);
    expect((await api().put('/api/v1/missions/00000000-0000-0000-0000-000000000000').send({})).status).toBe(401);
  });

  it('un tiers ne peut ni lire, ni modifier, ni émettre le QR d\'une mission', async () => {
    const owner = await registerUser('expediteur');
    const stranger = await registerUser('expediteur');
    const m = await createMission(owner);

    expect((await api().get(`/api/v1/missions/${m.id}`).set(auth(stranger))).status).toBe(404);
    expect((await api().get(`/api/v1/missions/${m.id}/tracking`).set(auth(stranger))).status).toBe(404);
    expect((await api().post(`/api/v1/missions/${m.id}/qr-code`).set(auth(stranger))).status).toBe(404);

    const put = await api().put(`/api/v1/missions/${m.id}`).set(auth(stranger)).send({ status: 'delivered', offered_price: 1 });
    expect(put.status).toBe(404);
    const after = await row(m.id);
    expect(after.status).toBe('pending');
    expect(Number(after.offered_price)).toBe(20000);
  });

  it('le propriétaire ne modifie que les champs autorisés', async () => {
    const owner = await registerUser('expediteur');
    const m = await createMission(owner);

    const res = await api().put(`/api/v1/missions/${m.id}`).set(auth(owner)).send({
      package_description: 'Livres',
      status: 'delivered',
      gp_id: owner.id,
      offered_price: 1,
    });
    expect(res.status).toBe(200);
    const after = await row(m.id);
    expect(after.package_description).toBe('Livres');
    expect(after.status).toBe('pending');
    expect(after.gp_id).toBeNull();
    expect(Number(after.offered_price)).toBe(20000);
  });

  it('refuse une clé SQL forgée dans le corps', async () => {
    const owner = await registerUser('expediteur');
    const m = await createMission(owner);
    const res = await api().put(`/api/v1/missions/${m.id}`).set(auth(owner))
      .send({ "status = 'delivered', offered_price = 1 --": 'x' });
    expect(res.status).toBe(400);
    expect((await row(m.id)).status).toBe('pending');
  });

  it('un expéditeur ne voit que ses envois ; l\'admin voit tout', async () => {
    const a = await registerUser('expediteur');
    const b = await registerUser('expediteur');
    const admin = await createAdmin();
    await createMission(a);
    await createMission(b);

    const mine = await api().get('/api/v1/missions').set(auth(a));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);

    const all = await api().get('/api/v1/missions').set(auth(admin));
    expect(all.body.data).toHaveLength(2);
  });

  it('un GP voit la liste réduite des missions à pourvoir, sans coordonnées ni jeton', async () => {
    const owner = await registerUser('expediteur');
    const gp = await registerUser('gp');
    await createMission(owner);

    const res = await api().get('/api/v1/missions?status=pending').set(auth(gp));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const item = res.body.data[0];
    expect(item).not.toHaveProperty('delivery_token');
    expect(item).not.toHaveProperty('recipient_phone');
    expect(item).not.toHaveProperty('pickup_address');
  });
});

describe('endpoints protégés par secret', () => {
  it('refuse bootstrap et reset-password sans le bon secret', async () => {
    process.env.ADMIN_BOOTSTRAP_SECRET = 'bon-secret-de-test';
    const u = await registerUser('expediteur');
    const res = await api().post('/api/v1/admin/bootstrap').send({ email: u.email, secret: 'mauvais' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await pool.query('SELECT user_type FROM users WHERE id = $1', [u.id]);
    expect(after.rows[0].user_type).toBe('expediteur');
  });
});
