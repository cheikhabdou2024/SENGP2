import { MissionController } from '../src/controllers/mission.controller';
import { MissionService } from '../src/services/mission.service';
import { MissionDeliveryService } from '../src/services/mission-delivery.service';

jest.mock('../src/services/mission.service', () => ({
  MissionService: {
    getById: jest.fn(),
    getAll: jest.fn(),
    update: jest.fn(),
    getTrackingHistory: jest.fn(),
    trackByNumber: jest.fn(),
  },
}));
jest.mock('../src/services/mission-delivery.service', () => ({
  MissionDeliveryService: {
    generateDeliveryQR: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const svc = MissionService as jest.Mocked<typeof MissionService>;
const delivery = MissionDeliveryService as jest.Mocked<typeof MissionDeliveryService>;

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}

function makeReq(user: any, extra: any = {}) {
  return { user, params: {}, query: {}, body: {}, protocol: 'https', get: () => 'api.test', ...extra } as any;
}

const owner = { id: 'u-exp', user_type: 'expediteur' };
const stranger = { id: 'u-x', user_type: 'expediteur' };
const gp = { id: 'u-gp', user_type: 'gp' };
const otherGp = { id: 'u-gp2', user_type: 'gp' };
const admin = { id: 'u-adm', user_type: 'admin' };

const pendingMission: any = {
  id: 'm1',
  mission_code: 'MIS-1',
  status: 'pending',
  expediteur_id: 'u-exp',
  gp_id: null,
  arrival_city: 'Paris',
  expediteur_phone: '+221770000000',
  delivery_token: 'tok',
  qr_code_url: 'qr',
};
const assignedMission: any = { ...pendingMission, status: 'matched', gp_id: 'u-gp' };

beforeEach(() => jest.resetAllMocks());

describe('PUT /missions/:id', () => {
  it('refuse (404) un utilisateur qui n’est pas propriétaire', async () => {
    svc.getById.mockResolvedValue(pendingMission);
    const res = makeRes();
    await MissionController.update(makeReq(stranger, { params: { id: 'm1' }, body: { status: 'delivered' } }), res);
    expect(res.statusCode).toBe(404);
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('refuse un GP, même assigné', async () => {
    svc.getById.mockResolvedValue(assignedMission);
    const res = makeRes();
    await MissionController.update(makeReq(gp, { params: { id: 'm1' }, body: { status: 'delivered' } }), res);
    expect(res.statusCode).toBe(404);
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('refuse (403) la modification d’une mission déjà assignée', async () => {
    svc.getById.mockResolvedValue(assignedMission);
    const res = makeRes();
    await MissionController.update(makeReq(owner, { params: { id: 'm1' }, body: { package_description: 'x' } }), res);
    expect(res.statusCode).toBe(403);
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('ne transmet au service que les champs autorisés', async () => {
    svc.getById.mockResolvedValue(pendingMission);
    svc.update.mockResolvedValue(pendingMission);
    const res = makeRes();
    await MissionController.update(
      makeReq(owner, {
        params: { id: 'm1' },
        body: { status: 'delivered', gp_id: 'u-gp', offered_price: 1, package_description: 'Vêtements' },
      }),
      res
    );
    expect(svc.update).toHaveBeenCalledWith('m1', { package_description: 'Vêtements' });
    expect(res.statusCode).toBe(200);
  });

  it('refuse (400) un corps sans aucun champ modifiable', async () => {
    svc.getById.mockResolvedValue(pendingMission);
    const res = makeRes();
    await MissionController.update(makeReq(owner, { params: { id: 'm1' }, body: { status: 'delivered' } }), res);
    expect(res.statusCode).toBe(400);
    expect(svc.update).not.toHaveBeenCalled();
  });
});

describe('GET /missions/:id', () => {
  it('répond 404 à un tiers, comme pour une mission inexistante', async () => {
    svc.getById.mockResolvedValue(assignedMission);
    const res = makeRes();
    await MissionController.getById(makeReq(stranger, { params: { id: 'm1' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('renvoie la mission complète au propriétaire', async () => {
    svc.getById.mockResolvedValue(assignedMission);
    const res = makeRes();
    await MissionController.getById(makeReq(owner, { params: { id: 'm1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('delivery_token');
  });

  it('renvoie une vue réduite à un GP sur une mission non assignée', async () => {
    svc.getById.mockResolvedValue(pendingMission);
    const res = makeRes();
    await MissionController.getById(makeReq(otherGp, { params: { id: 'm1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'm1', arrival_city: 'Paris' });
    expect(res.body.data).not.toHaveProperty('delivery_token');
    expect(res.body.data).not.toHaveProperty('expediteur_phone');
  });
});

describe('GET /missions', () => {
  const page = { data: [pendingMission], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } };

  it('limite un expéditeur à ses propres envois, quoi que dise la requête', async () => {
    svc.getAll.mockResolvedValue(page as any);
    await MissionController.getAll(makeReq(owner, { query: { expediteur_id: 'autre' } }), makeRes());
    expect(svc.getAll).toHaveBeenCalledWith(expect.objectContaining({ expediteur_id: 'u-exp' }));
  });

  it('donne à un GP la liste réduite des missions à pourvoir', async () => {
    svc.getAll.mockResolvedValue(page as any);
    const res = makeRes();
    await MissionController.getAll(makeReq(gp, { query: { status: 'pending' } }), res);
    expect(svc.getAll).toHaveBeenCalledWith(expect.objectContaining({ unassignedOnly: true }));
    expect(res.body.data[0]).not.toHaveProperty('delivery_token');
    expect(res.body.data[0]).not.toHaveProperty('expediteur_phone');
  });

  it('limite un GP à ses missions quand il ne demande pas les missions à pourvoir', async () => {
    svc.getAll.mockResolvedValue(page as any);
    await MissionController.getAll(makeReq(gp, { query: {} }), makeRes());
    expect(svc.getAll).toHaveBeenCalledWith(expect.objectContaining({ gp_id: 'u-gp', unassignedOnly: false }));
  });

  it('laisse l’admin voir toutes les missions', async () => {
    svc.getAll.mockResolvedValue(page as any);
    await MissionController.getAll(makeReq(admin), makeRes());
    const args = svc.getAll.mock.calls[0][0] as any;
    expect(args.expediteur_id).toBeUndefined();
    expect(args.gp_id).toBeUndefined();
  });
});

describe('QR et suivi', () => {
  it('n’émet pas de QR (jeton de livraison) pour un tiers', async () => {
    svc.getById.mockResolvedValue(assignedMission);
    const res = makeRes();
    await MissionController.generateQRCode(makeReq(stranger, { params: { id: 'm1' } }), res);
    expect(res.statusCode).toBe(404);
    expect(delivery.generateDeliveryQR).not.toHaveBeenCalled();
  });

  it('n’expose pas l’historique de suivi à un tiers', async () => {
    svc.getById.mockResolvedValue(assignedMission);
    const res = makeRes();
    await MissionController.getTracking(makeReq(stranger, { params: { id: 'm1' } }), res);
    expect(res.statusCode).toBe(404);
    expect(svc.getTrackingHistory).not.toHaveBeenCalled();
  });

  it('n’expose pas le suivi par numéro à un tiers', async () => {
    svc.trackByNumber.mockResolvedValue({ mission: assignedMission, tracking: [] } as any);
    const res = makeRes();
    await MissionController.trackByNumber(makeReq(stranger, { params: { trackingNumber: 'TRK-1' } }), res);
    expect(res.statusCode).toBe(404);
  });
});
