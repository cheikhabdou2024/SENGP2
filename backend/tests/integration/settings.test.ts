import pool from '../../src/config/database';
import { api, auth, closeDatabase, createAdmin, resetData, setupDatabase } from './helpers';

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

const SECRET_KEYS = { publicKey: 'pub-test', privateKey: 'priv-test-never-expose' };

async function seedVapid() {
  await pool.query(
    `INSERT INTO platform_setting (key, value) VALUES ('vapid_keys', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(SECRET_KEYS)]
  );
}

describe('réglages de la plateforme', () => {
  it('ne renvoie jamais les clés VAPID stockées dans platform_setting', async () => {
    const admin = await createAdmin();
    await seedVapid();

    const res = await api().get('/api/v1/admin/settings').set(auth(admin));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('priv-test-never-expose');
    expect(JSON.stringify(res.body)).not.toContain('vapid');
    expect(Object.keys(res.body.data).sort()).toEqual(['commission_pct', 'insurance_pct', 'min_withdrawal', 'supported_countries']);
  });

  it('ne permet pas d\'écraser les clés VAPID par PUT /admin/settings', async () => {
    const admin = await createAdmin();
    await seedVapid();

    const res = await api().put('/api/v1/admin/settings').set(auth(admin)).send({ vapid_keys: { privateKey: 'x' } });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const row = (await pool.query(`SELECT value FROM platform_setting WHERE key = 'vapid_keys'`)).rows[0];
    expect(row.value.privateKey).toBe('priv-test-never-expose');
  });
});
