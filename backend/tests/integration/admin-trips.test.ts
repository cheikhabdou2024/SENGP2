import pool from '../../src/config/database';
import { api, auth, closeDatabase, createAdmin, createMission, registerUser, resetData, setupDatabase } from './helpers';

beforeAll(setupDatabase);
beforeEach(resetData);
afterAll(closeDatabase);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 32)]);

function tripRequest(gp: { token: string }) {
  const day = 24 * 3600 * 1000;
  return api().post('/api/v1/trips').set('Authorization', `Bearer ${gp.token}`)
    .field('departure_country', 'Sénégal').field('departure_city', 'Dakar')
    .field('arrival_country', 'France').field('arrival_city', 'Paris')
    .field('departure_datetime', new Date(Date.now() + 3 * day).toISOString())
    .field('arrival_datetime', new Date(Date.now() + 3 * day + 7 * 3600 * 1000).toISOString())
    .field('available_weight', '20');
}

describe('billet d\'avion du GP', () => {
  it('est conservé à la création et visible par l\'admin', async () => {
    const gp = await registerUser('gp');
    const admin = await createAdmin();
    const res = await tripRequest(gp).attach('flight_ticket_photo', PNG, 'billet.png');
    expect(res.status).toBe(201);
    const row = (await pool.query('SELECT ticket_status, flight_ticket_url FROM trips WHERE id = $1', [res.body.data.id])).rows[0];
    expect(row.ticket_status).toBe('pending');
    expect(row.flight_ticket_url).toBeTruthy();

    const detail = await api().get(`/api/v1/admin/trips/${res.body.data.id}`).set(auth(admin));
    expect(detail.status).toBe(200);
    expect(detail.body.data.trip.ticket_status).toBe('pending');
    expect(detail.body.data.trip.flight_ticket_url).toBeTruthy();
    expect(detail.body.data.trip.ticket_is_pdf).toBe(false);
  });

  it('accepte un PDF, refuse tout autre type', async () => {
    const gp = await registerUser('gp');
    expect((await tripRequest(gp).attach('flight_ticket_photo', PDF, 'billet.pdf')).status).toBe(201);
    const bad = await tripRequest(gp).attach('flight_ticket_photo', Buffer.from('<html><script>alert(1)</script></html>'), 'billet.png');
    expect(bad.status).toBe(400);
  });

  it('sans fichier, le trajet est créé avec le billet « manquant »', async () => {
    const gp = await registerUser('gp');
    const res = await tripRequest(gp);
    expect(res.status).toBe(201);
    const row = (await pool.query('SELECT ticket_status FROM trips WHERE id = $1', [res.body.data.id])).rows[0];
    expect(row.ticket_status).toBe('missing');
  });

  it('l\'admin valide ou refuse (motif obligatoire) et le GP est prévenu', async () => {
    const gp = await registerUser('gp');
    const admin = await createAdmin();
    const trip = (await tripRequest(gp).attach('flight_ticket_photo', PNG, 'billet.png')).body.data;

    const noReason = await api().post(`/api/v1/admin/trips/${trip.id}/ticket-review`).set(auth(admin)).send({ decision: 'rejected' });
    expect(noReason.status).toBe(400);
    const bad = await api().post(`/api/v1/admin/trips/${trip.id}/ticket-review`).set(auth(admin)).send({ decision: 'maybe' });
    expect(bad.status).toBe(400);

    const rej = await api().post(`/api/v1/admin/trips/${trip.id}/ticket-review`).set(auth(admin)).send({ decision: 'rejected', note: 'Photo floue' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.ticket_status).toBe('rejected');
    const ok = await api().post(`/api/v1/admin/trips/${trip.id}/ticket-review`).set(auth(admin)).send({ decision: 'approved' });
    expect(ok.status).toBe(200);

    const notes = (await pool.query(`SELECT title, message FROM notifications WHERE user_id = $1 ORDER BY created_at`, [gp.id])).rows;
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(notes.some((n: any) => /Photo floue/.test(n.message))).toBe(true);

    await new Promise((r) => setTimeout(r, 300));
    const log = (await pool.query(`SELECT metadata FROM admin_logs WHERE action = 'trip.ticket_review' ORDER BY created_at DESC LIMIT 1`)).rows[0];
    expect(log.metadata.decision).toBe('approved');
    expect(log.metadata.before).toBe('rejected');
  });

  it('un trajet sans billet ne peut pas être validé', async () => {
    const gp = await registerUser('gp');
    const admin = await createAdmin();
    const trip = (await tripRequest(gp)).body.data;
    const r = await api().post(`/api/v1/admin/trips/${trip.id}/ticket-review`).set(auth(admin)).send({ decision: 'approved' });
    expect(r.status).toBe(400);
  });

  it('exige le droit trips:write et permet de filtrer les billets à vérifier', async () => {
    const gp = await registerUser('gp');
    const boss = await createAdmin();
    const reader = await createAdmin('analyst');
    const trip = (await tripRequest(gp).attach('flight_ticket_photo', PNG, 'billet.png')).body.data;
    await tripRequest(gp);

    const denied = await api().post(`/api/v1/admin/trips/${trip.id}/ticket-review`).set(auth(reader)).send({ decision: 'approved' });
    expect(denied.status).toBe(403);

    const pending = await api().get('/api/v1/admin/trips?ticket_status=pending').set(auth(boss));
    expect(pending.status).toBe(200);
    expect(pending.body.data).toHaveLength(1);
    expect((await api().get('/api/v1/admin/trips?ticket_status=weird').set(auth(boss))).status).toBe(400);
  });
});

describe('fiches admin enrichies', () => {
  it('la fiche trajet donne la dernière position de chaque colis à bord', async () => {
    const gp = await registerUser('gp');
    const owner = await registerUser('expediteur');
    const admin = await createAdmin();
    const trip = (await tripRequest(gp).attach('flight_ticket_photo', PNG, 'billet.png')).body.data;
    const m = await createMission(owner);
    await pool.query(`UPDATE missions SET gp_id = $2, trip_id = $3, status = 'in_transit' WHERE id = $1`, [m.id, gp.id, trip.id]);
    await pool.query(`INSERT INTO mission_tracking (mission_id, status, location, latitude, longitude, created_by) VALUES ($1,'in_transit','Dakar',14.7,-17.4,$2)`, [m.id, gp.id]);
    await pool.query(`INSERT INTO mission_tracking (mission_id, status, location, latitude, longitude, created_by) VALUES ($1,'in_transit','En vol',41.2,-6.4,$2)`, [m.id, gp.id]);

    const d = (await api().get(`/api/v1/admin/trips/${trip.id}`).set(auth(admin))).body.data;
    expect(d.missions).toHaveLength(1);
    expect(Number(d.missions[0].last_lat)).toBeCloseTo(41.2);
    expect(d.events.length).toBe(2);
    expect(d.server_time).toBeTruthy();
  });

  it('la fiche mission expose le QR de remise sans révéler le jeton secret', async () => {
    const owner = await registerUser('expediteur');
    const admin = await createAdmin();
    const m = await createMission(owner, { payment_method: 'cod' });
    await api().post(`/api/v1/missions/${m.id}/delivery-qr`).set(auth(owner));
    const d = (await api().get(`/api/v1/admin/missions/${m.id}`).set(auth(admin))).body.data;
    expect(d.mission.delivery_qr_url).toMatch(/^data:image\/png/);
    expect(d.mission.delivery_confirm_url).toMatch(/\/d\/[0-9a-f]{32}$/);
    expect(d.mission.delivery_token).toBeUndefined();
  });

  it('la fiche utilisateur liste les envois avec mode de paiement, photos et QR', async () => {
    const owner = await registerUser('expediteur');
    const admin = await createAdmin();
    const m = await createMission(owner, { payment_method: 'wave' });
    await pool.query(`UPDATE missions SET package_photos = $2 WHERE id = $1`, [m.id, JSON.stringify(['data:image/png;base64,AAAA'])]);
    await api().post(`/api/v1/missions/${m.id}/qr-code`).set(auth(owner));
    const d = (await api().get(`/api/v1/admin/users/${owner.id}`).set(auth(admin))).body.data;
    const row = d.recent_missions.find((x: any) => x.id === m.id);
    expect(row.payment_method).toBe('wave');
    expect(row.package_photos).toHaveLength(1);
    expect(row.qr_code_url).toMatch(/^data:image\/png/);
  });
});
