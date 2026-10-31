import pool from '../../src/config/database';
import {
  api, auth, closeDatabase, createAdmin, registerUser, resetData, setupDatabase,
} from './helpers';

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

const me = (token: string) => api().get('/api/v1/missions').set({ Authorization: `Bearer ${token}` });

describe('révocation des sessions', () => {
  it('un jeton fonctionne tant que le compte est valide', async () => {
    const u = await registerUser('expediteur');
    expect((await me(u.token)).status).toBe(200);
  });

  it('un changement de mot de passe révoque les anciens jetons, le nouveau login fonctionne', async () => {
    const u = await registerUser('expediteur');
    const change = await api().post('/api/v1/auth/change-password').set(auth(u))
      .send({ oldPassword: 'Passw0rd!x', newPassword: 'NouveauPass1!' });
    expect(change.status).toBe(200);

    expect((await me(u.token)).status).toBe(401);

    const login = await api().post('/api/v1/auth/login').send({ email: u.email, password: 'NouveauPass1!' });
    expect(login.status).toBe(200);
    expect((await me(login.body.data.token)).status).toBe(200);
  });

  it('un compte suspendu perd l\'accès immédiatement', async () => {
    const u = await registerUser('expediteur');
    await pool.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [u.id]);
    expect((await me(u.token)).status).toBe(401);
  });

  it('un compte supprimé perd l\'accès immédiatement', async () => {
    const u = await registerUser('expediteur');
    await pool.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [u.id]);
    expect((await me(u.token)).status).toBe(401);
  });

  it('un jeton émis avant un changement de rôle est refusé', async () => {
    const u = await registerUser('expediteur');
    await pool.query(`UPDATE users SET user_type = 'admin' WHERE id = $1`, [u.id]);
    expect((await me(u.token)).status).toBe(401);
  });

  it('un jeton ancien sans version (avant ce lot) reste valable', async () => {
    const admin = await createAdmin();
    expect((await api().get('/api/v1/admin/me/permissions').set(auth(admin))).status).toBe(200);
  });
});
