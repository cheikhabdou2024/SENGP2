import pool from '../../src/config/database';
import { api, auth, closeDatabase, createAdmin, registerUser, resetData, setupDatabase } from './helpers';

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

const roleId = async (key: string) => (await pool.query('SELECT id FROM admin_role WHERE key = $1', [key])).rows[0].id;

/** Admin portant un rôle personnalisé aux permissions données. */
async function adminWith(perms: string[]) {
  const key = `custom_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO admin_role (key, name, permissions, is_system) VALUES ($1, $1, $2, FALSE)`,
    [key, JSON.stringify(perms)]
  );
  const admin = await createAdmin(key);
  return admin;
}

describe('droits administrateur : refus par défaut (S1, S2)', () => {
  it('un admin sans rôle n\'a aucun droit', async () => {
    const orphan = await createAdmin(null);
    expect((await api().get('/api/v1/admin/users').set(auth(orphan))).status).toBe(403);
    expect((await api().get('/api/v1/admin/roles').set(auth(orphan))).status).toBe(403);
    const me = await api().get('/api/v1/admin/me/permissions').set(auth(orphan));
    expect(me.body.data.permissions).toEqual([]);
  });

  it('un rôle sans aucune permission ne donne aucun accès', async () => {
    const empty = await adminWith([]);
    expect((await api().get('/api/v1/admin/missions').set(auth(empty))).status).toBe(403);
  });

  it('users:write ne peut pas créer un compte admin ni promouvoir un utilisateur', async () => {
    const editor = await adminWith(['users:read', 'users:write']);
    const create = await api().post('/api/v1/admin/users').set(auth(editor)).send({
      email: 'faux-admin@test.sengp', password: 'Passw0rd!x', user_type: 'admin', first_name: 'A', last_name: 'B',
    });
    expect(create.status).toBe(403);
    expect((await pool.query(`SELECT 1 FROM users WHERE email = 'faux-admin@test.sengp'`)).rows).toHaveLength(0);

    const victim = await registerUser('expediteur');
    const promote = await api().put(`/api/v1/admin/users/${victim.id}`).set(auth(editor)).send({ user_type: 'admin' });
    expect(promote.status).toBe(403);
    expect((await pool.query('SELECT user_type FROM users WHERE id = $1', [victim.id])).rows[0].user_type).toBe('expediteur');
  });

  it('users:write ne peut pas toucher à un compte admin (mot de passe, suspension, suppression)', async () => {
    const editor = await adminWith(['users:read', 'users:write', 'users:delete']);
    const boss = await createAdmin('super_admin');
    const hash = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [boss.id])).rows[0].password_hash;

    expect((await api().put(`/api/v1/admin/users/${boss.id}`).set(auth(editor)).send({ password: 'Nouveau!pass1' })).status).toBe(403);
    expect((await api().put(`/api/v1/admin/users/${boss.id}`).set(auth(editor)).send({ status: 'suspended' })).status).toBe(403);
    expect((await api().delete(`/api/v1/admin/users/${boss.id}`).set(auth(editor))).status).toBe(403);
    const after = (await pool.query('SELECT password_hash, status, deleted_at FROM users WHERE id = $1', [boss.id])).rows[0];
    expect(after.password_hash).toBe(hash);
    expect(after.status).not.toBe('suspended');
    expect(after.deleted_at).toBeNull();
  });

  it('users:write continue de modifier les utilisateurs ordinaires', async () => {
    const editor = await adminWith(['users:read', 'users:write']);
    const user = await registerUser('gp');
    const res = await api().put(`/api/v1/admin/users/${user.id}`).set(auth(editor)).send({ city: 'Thiès' });
    expect(res.status).toBe(200);
    expect(res.body.data.city).toBe('Thiès');
  });
});

describe('attribution des rôles (S3, S4)', () => {
  it('on ne peut pas attribuer ni créer un rôle plus puissant que le sien', async () => {
    const manager = await adminWith(['roles:read', 'roles:manage', 'users:read']);
    const victim = await registerUser('expediteur');

    const superRole = await api().put(`/api/v1/admin/users/${victim.id}/role`).set(auth(manager)).send({ role_id: await roleId('super_admin') });
    expect(superRole.status).toBe(403);
    expect((await pool.query('SELECT user_type FROM users WHERE id = $1', [victim.id])).rows[0].user_type).toBe('expediteur');

    const wildcard = await api().post('/api/v1/admin/roles').set(auth(manager)).send({ name: 'Tout', permissions: ['*'] });
    expect(wildcard.status).toBe(403);
    const wider = await api().post('/api/v1/admin/roles').set(auth(manager)).send({ name: `Finance plus ${Date.now()}`, permissions: ['payments:refund'] });
    expect(wider.status).toBe(403);
    const ok = await api().post('/api/v1/admin/roles').set(auth(manager)).send({ name: `Lecture ${Date.now()}`, permissions: ['users:read'] });
    expect(ok.status).toBe(201);
  });

  it('changer le rôle d\'un admin met fin à sa session immédiatement', async () => {
    const boss = await createAdmin('super_admin');
    const staff = await createAdmin('finance');
    expect((await api().get('/api/v1/admin/payments').set(auth(staff))).status).toBe(200);

    const res = await api().put(`/api/v1/admin/users/${staff.id}/role`).set(auth(boss)).send({ role_id: await roleId('verification') });
    expect(res.status).toBe(200);
    expect((await api().get('/api/v1/admin/payments').set(auth(staff))).status).toBe(401);
  });

  it('modifier les permissions d\'un rôle met fin aux sessions de ses porteurs', async () => {
    const boss = await createAdmin('super_admin');
    const custom = await adminWith(['users:read']);
    const role = (await pool.query('SELECT admin_role_id FROM users WHERE id = $1', [custom.id])).rows[0].admin_role_id;
    expect((await api().get('/api/v1/admin/users').set(auth(custom))).status).toBe(200);

    const res = await api().put(`/api/v1/admin/roles/${role}`).set(auth(boss)).send({ permissions: [] });
    expect(res.status).toBe(200);
    expect((await api().get('/api/v1/admin/users').set(auth(custom))).status).toBe(401);
  });

  it('le dernier super admin ne peut être ni suspendu, ni supprimé, ni rétrogradé', async () => {
    const boss = await createAdmin('super_admin');
    const manager = await adminWith(['roles:manage', 'users:write', 'users:delete', 'users:read']);
    // le gestionnaire détient roles:manage mais pas *, donc ne peut pas viser un super admin avec un rôle plus fort ;
    // on teste le garde-fou avec un second super admin qui tente de se retirer lui-même.
    expect((await api().delete(`/api/v1/admin/users/${boss.id}`).set(auth(boss))).status).toBe(400); // auto-suppression

    const suspend = await api().put(`/api/v1/admin/users/${boss.id}`).set(auth(boss)).send({ status: 'suspended' });
    expect(suspend.status).toBe(400);
    const demote = await api().put(`/api/v1/admin/users/${boss.id}/role`).set(auth(boss)).send({ role_id: await roleId('analyst') });
    expect(demote.status).toBe(400);
    const dtype = await api().put(`/api/v1/admin/users/${boss.id}`).set(auth(boss)).send({ user_type: 'expediteur' });
    expect(dtype.status).toBe(400);
    const still = (await pool.query('SELECT status, user_type FROM users WHERE id = $1', [boss.id])).rows[0];
    expect(still.status).not.toBe('suspended');
    expect(still.user_type).toBe('admin');
    expect(manager.id).toBeTruthy();

    // avec un second super admin, la rétrogradation du premier est permise
    const second = await createAdmin('super_admin');
    const ok = await api().put(`/api/v1/admin/users/${boss.id}/role`).set(auth(second)).send({ role_id: await roleId('analyst') });
    expect(ok.status).toBe(200);
  });

  it('un admin peut changer son propre nom sans être bloqué par le garde-fou', async () => {
    const boss = await createAdmin('super_admin');
    const res = await api().put(`/api/v1/admin/users/${boss.id}`).set(auth(boss)).send({ first_name: 'Awa' });
    expect(res.status).toBe(200);
  });
});

describe('vue d\'ensemble filtrée par droits (S6)', () => {
  it('un rôle KYC ne voit ni paiements, ni retraits, ni fil de paiements', async () => {
    const kyc = await createAdmin('verification');
    const boss = await createAdmin('super_admin');
    const stats = await api().get('/api/v1/admin/stats').set(auth(kyc));
    expect(stats.status).toBe(200);
    expect(stats.body.data.payments).toBeNull();
    expect(stats.body.data.withdrawals).toBeNull();
    expect(stats.body.data.users).not.toBeNull();

    const full = await api().get('/api/v1/admin/stats').set(auth(boss));
    expect(full.body.data.payments).not.toBeNull();

    const act = await api().get('/api/v1/admin/activity').set(auth(kyc));
    expect(act.body.data.every((a: any) => a.kind !== 'payment' && a.kind !== 'mission' && a.kind !== 'claim')).toBe(true);
  });
});
