import pool from '../../src/config/database';
import { NotificationService } from '../../src/services/notification.service';
import { NotificationType } from '../../src/types';
import { api, auth, closeDatabase, registerUser, resetData, setupDatabase } from './helpers';

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

const LOGIN = { email: 'inconnu@test.sengp', password: 'Passw0rd!x' };

describe('messages d\'erreur traduits', () => {
  it('suivent l\'en-tete Accept-Language, et restent inchanges sans langue demandee', async () => {
    const cases: Array<[string | undefined, string]> = [
      [undefined, 'Invalid email or password'],
      ['en', 'Invalid email or password'],
      ['fr', 'Email ou mot de passe incorrect'],
      ['ar', 'البريد الإلكتروني أو كلمة المرور غير صحيحة'],
      ['es-ES,es;q=0.9', 'Correo o contraseña incorrectos'],
      ['pt-BR', 'Email ou palavra-passe incorretos'],
      ['de-DE', 'Invalid email or password'],
    ];
    for (const [header, expected] of cases) {
      const req = api().post('/api/v1/auth/login');
      if (header) req.set('Accept-Language', header);
      const res = await req.send(LOGIN);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe(expected);
    }
  });

  it('un jeton absent est refuse dans la langue demandee', async () => {
    const res = await api().get('/api/v1/users/me').set('Accept-Language', 'pt');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Nenhum token fornecido');
  });
});

describe('langue du compte', () => {
  it('est memorisee a l\'inscription selon la langue de la requete', async () => {
    const res = await api().post('/api/v1/auth/register').set('Accept-Language', 'es').send({
      email: 'es1@test.sengp', password: 'Passw0rd!x', user_type: 'expediteur', first_name: 'Ana', last_name: 'Ruiz',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.language).toBe('es');
    const row = (await pool.query('SELECT language FROM users WHERE email = $1', ['es1@test.sengp'])).rows[0];
    expect(row.language).toBe('es');
  });

  it('reste vide sans langue demandee, puis se change par PUT /users/me', async () => {
    const u = await registerUser('expediteur');
    expect((await pool.query('SELECT language FROM users WHERE id = $1', [u.id])).rows[0].language).toBeNull();

    const ok = await api().put('/api/v1/users/me').set(auth(u)).send({ language: 'ar' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.language).toBe('ar');
    const me = await api().get('/api/v1/users/me').set(auth(u));
    expect(me.body.data.language).toBe('ar');
  });

  it('refuse une langue non prise en charge, sans rien modifier', async () => {
    const u = await registerUser('expediteur');
    await api().put('/api/v1/users/me').set(auth(u)).send({ language: 'pt' });
    const bad = await api().put('/api/v1/users/me').set(auth(u)).set('Accept-Language', 'fr').send({ language: 'xx' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Langue invalide');
    expect((await pool.query('SELECT language FROM users WHERE id = $1', [u.id])).rows[0].language).toBe('pt');
  });

  it('est renvoyee a la connexion', async () => {
    const u = await registerUser('expediteur');
    await api().put('/api/v1/users/me').set(auth(u)).send({ language: 'es' });
    const login = await api().post('/api/v1/auth/login').send({ email: u.email, password: 'Passw0rd!x' });
    expect(login.body.data.user.language).toBe('es');
  });
});

describe('notifications dans la langue du destinataire', () => {
  async function notify(userId: string) {
    await NotificationService.create({
      user_id: userId,
      notification_type: NotificationType.PAYMENT_RECEIVED,
      template: 'payment_confirmed',
      params: { amount: 15000 },
    });
    return (await pool.query('SELECT title, message, metadata FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId])).rows[0];
  }

  it('utilise la langue enregistree du destinataire, quelle que soit celle de l\'auteur de l\'action', async () => {
    const u = await registerUser('expediteur');
    await pool.query(`UPDATE users SET language = 'ar' WHERE id = $1`, [u.id]);
    const n = await notify(u.id);
    expect(n.title).toBe('تم تأكيد الدفع');
    expect(n.message).toContain('15,000 FCFA'.replace(',', ',')); // chiffres latins
    expect(n.metadata.template).toBe('payment_confirmed');
  });

  it('retombe sur le francais sans langue enregistree', async () => {
    const u = await registerUser('expediteur');
    const n = await notify(u.id);
    expect(n.title).toBe('Paiement confirmé');
    expect(n.message).toMatch(/15.000 FCFA/);
  });

  it('refuse une notification sans titre ni modele', async () => {
    const u = await registerUser('expediteur');
    await expect(NotificationService.create({ user_id: u.id, notification_type: NotificationType.SYSTEM_ALERT })).rejects.toThrow();
  });
});
