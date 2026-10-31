import { Response } from 'express';
import { MissionService } from '../services/mission.service';
import { MissionDeliveryService } from '../services/mission-delivery.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest, UserType } from '../types';
import logger from '../utils/logger';
import { missionAccessLevel, toPoolView, pickEditableFields } from '../utils/missionAccess';

export class MissionController {
  /** L'utilisateur connecté a-t-il un accès complet à cette mission (admin, expéditeur, GP assigné) ? */
  private static async canAccess(req: AuthRequest, missionId: string): Promise<boolean> {
    if (!req.user) return false;
    const mission = await MissionService.getById(missionId);
    return !!mission && missionAccessLevel(req.user, mission) === 'full';
  }

  /**
   * Create new mission
   * POST /api/v1/missions
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      if (req.user.user_type !== UserType.EXPEDITEUR) {
        ResponseUtil.forbidden(res, 'Only expediteurs can create missions');
        return;
      }

      const mission = await MissionService.create(req.body, req.user.id);

      ResponseUtil.created(res, mission, 'Mission created successfully');
    } catch (error: any) {
      logger.error('Mission creation error:', error);
      ResponseUtil.badRequest(res, error.message || 'Mission creation failed');
    }
  }

  /**
   * Get mission by ID
   * GET /api/v1/missions/:id
   */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const mission = await MissionService.getById(req.params.id);
      const access = mission ? missionAccessLevel(req.user, mission) : 'none';

      // Mission inexistante ou non autorisée : même réponse, pour ne pas révéler son existence.
      if (!mission || access === 'none') {
        ResponseUtil.notFound(res, 'Mission not found');
        return;
      }

      ResponseUtil.success(res, access === 'pool' ? toPoolView(mission) : mission);
    } catch (error: any) {
      logger.error('Get mission error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get mission');
    }
  }

  /**
   * Get all missions with filters
   * GET /api/v1/missions
   */
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as any;
      const departure_city = req.query.departure_city as string;
      const arrival_city = req.query.arrival_city as string;

      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      // Périmètre imposé par le rôle (jamais par la requête) :
      // admin = tout ; expéditeur = ses envois ; GP = missions à pourvoir (vue réduite) ou les siennes.
      const scope: { expediteur_id?: string; gp_id?: string } = {};
      let poolOnly = false;
      if (req.user.user_type === UserType.EXPEDITEUR) {
        scope.expediteur_id = req.user.id;
      } else if (req.user.user_type === UserType.GP) {
        if (status === 'pending') poolOnly = true;
        else scope.gp_id = req.user.id;
      }

      const result = await MissionService.getAll({
        page,
        limit,
        status,
        departure_city,
        arrival_city,
        ...scope,
        unassignedOnly: poolOnly,
      });

      const data = poolOnly ? result.data.map(toPoolView) : result.data;
      ResponseUtil.success(res, data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get missions error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get missions');
    }
  }

  /**
   * Get user's missions
   * GET /api/v1/missions/my-missions
   */
  static async getMyMissions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as any;

      const filters: any = { page, limit, status };

      if (req.user.user_type === UserType.EXPEDITEUR) {
        filters.expediteur_id = req.user.id;
      } else if (req.user.user_type === UserType.GP) {
        filters.gp_id = req.user.id;
      } else {
        ResponseUtil.forbidden(res, 'Invalid user type');
        return;
      }

      const result = await MissionService.getAll(filters);

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get my missions error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get missions');
    }
  }

  /**
   * Update mission
   * PUT /api/v1/missions/:id
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const current = await MissionService.getById(req.params.id);
      const isOwner = !!current && current.expediteur_id === req.user.id;
      const isAdmin = req.user.user_type === UserType.ADMIN;
      if (!current || (!isOwner && !isAdmin)) {
        ResponseUtil.notFound(res, 'Mission not found');
        return;
      }
      // Une mission déjà assignée ou en cours ne se modifie plus par cette route
      // (statut, prix, GP et paiement passent par les parcours dédiés).
      if (current.status !== 'pending') {
        ResponseUtil.forbidden(res, 'Cette mission ne peut plus être modifiée');
        return;
      }

      const changes = pickEditableFields(req.body);
      if (Object.keys(changes).length === 0) {
        ResponseUtil.badRequest(res, 'Aucun champ modifiable fourni');
        return;
      }

      const mission = await MissionService.update(req.params.id, changes);

      ResponseUtil.success(res, mission, 'Mission updated successfully');
    } catch (error: any) {
      logger.error('Update mission error:', error);

      if (error.message === 'Mission not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Update failed');
    }
  }

  /**
   * Accept mission (GP)
   * POST /api/v1/missions/:id/accept
   */
  static async accept(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      if (req.user.user_type !== UserType.GP) {
        ResponseUtil.forbidden(res, 'Only GPs can accept missions');
        return;
      }

      const { trip_id } = req.body;
      const mission = await MissionService.accept(req.params.id, req.user.id, trip_id);

      ResponseUtil.success(res, mission, 'Mission accepted successfully');
    } catch (error: any) {
      logger.error('Accept mission error:', error);

      if (error.message.includes('not available')) {
        ResponseUtil.conflict(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Accept failed');
    }
  }

  /**
   * A GP declines a mission the admin assigned to them.
   * POST /api/v1/missions/:id/decline  (GP only)
   */
  static async decline(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }
      if (req.user.user_type !== UserType.GP) {
        ResponseUtil.forbidden(res, 'Only GPs can decline missions');
        return;
      }
      const mission = await MissionService.declineAssignment(req.params.id, req.user.id);
      ResponseUtil.success(res, mission, 'Mission declined');
    } catch (error: any) {
      logger.error('Decline mission error:', error);
      ResponseUtil.badRequest(res, error.message || 'Decline failed');
    }
  }

  /**
   * Generate (or fetch) the proof-of-delivery QR for a mission.
   * POST /api/v1/missions/:id/delivery-qr  (expediteur owner, assigned GP, or admin)
   */
  static async deliveryQR(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }
      const mission = await MissionService.getById(req.params.id);
      if (!mission) {
        ResponseUtil.notFound(res, 'Mission not found');
        return;
      }
      const uid = req.user.id;
      const isOwner =
        mission.expediteur_id === uid ||
        mission.gp_id === uid ||
        req.user.user_type === UserType.ADMIN;
      if (!isOwner) {
        ResponseUtil.forbidden(res, 'Not your mission');
        return;
      }
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const data = await MissionDeliveryService.generateDeliveryQR(req.params.id, baseUrl);
      ResponseUtil.success(res, data, 'Delivery QR ready');
    } catch (error: any) {
      logger.error('Delivery QR error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to generate QR');
    }
  }

  /**
   * Set the recipient identity (expediteur owner only)
   * POST /api/v1/missions/:id/recipient  { name, phone }
   */
  static async setRecipient(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { ResponseUtil.unauthorized(res); return; }
      const data = await MissionDeliveryService.setRecipient(
        req.params.id, req.user.id, req.body.name, req.body.phone
      );
      ResponseUtil.success(res, data, 'Destinataire enregistré');
    } catch (error: any) {
      if (error.message && error.message.includes('not yours')) {
        ResponseUtil.forbidden(res, error.message);
        return;
      }
      ResponseUtil.badRequest(res, error.message || 'Échec');
    }
  }

  /**
   * Record a live GPS position (assigned GP only)
   * POST /api/v1/missions/:id/location  { lat, lng }
   */
  static async addLocation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }
      const lat = parseFloat(req.body.lat ?? req.body.latitude);
      const lng = parseFloat(req.body.lng ?? req.body.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        ResponseUtil.badRequest(res, 'lat and lng are required');
        return;
      }
      await MissionService.addLocation(req.params.id, req.user.id, lat, lng);
      ResponseUtil.success(res, undefined, 'Location recorded');
    } catch (error: any) {
      if (error.message === 'Not your mission') {
        ResponseUtil.forbidden(res, error.message);
        return;
      }
      if (error.message === 'Mission not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }
      ResponseUtil.badRequest(res, error.message || 'Failed to record location');
    }
  }

  /**
   * Update mission status
   * POST /api/v1/missions/:id/status
   */
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const { status } = req.body;
      const mission = await MissionService.updateStatus(
        req.params.id,
        status,
        req.user.id
      );

      ResponseUtil.success(res, mission, 'Status updated successfully');
    } catch (error: any) {
      logger.error('Update status error:', error);
      ResponseUtil.badRequest(res, error.message || 'Status update failed');
    }
  }

  /**
   * Generate QR Code
   * POST /api/v1/missions/:id/qr-code
   */
  static async generateQRCode(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!(await MissionController.canAccess(req, req.params.id))) {
        ResponseUtil.notFound(res, 'Mission not found');
        return;
      }
      // Un seul QR par envoi : le même code sert au colis et au destinataire (lien /d/<jeton>).
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const data = await MissionDeliveryService.generateDeliveryQR(req.params.id, baseUrl);

      ResponseUtil.success(res, { qr_code_url: data.qr_code_url }, 'QR Code generated');
    } catch (error: any) {
      logger.error('Generate QR code error:', error);
      ResponseUtil.badRequest(res, error.message || 'QR Code generation failed');
    }
  }

  /** GET /api/v1/missions/gp-lock — is the signed-in GP locked pending admin validation? */
  static async gpLock(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { ResponseUtil.unauthorized(res); return; }
      const locked = req.user.user_type === UserType.GP ? await MissionDeliveryService.isGpLocked(req.user.id) : false;
      ResponseUtil.success(res, { locked });
    } catch (error: any) {
      ResponseUtil.badRequest(res, error.message || 'Failed');
    }
  }

  /** POST /api/v1/missions/verify-pair { package_qr, recipient_qr } */
  static async verifyPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { ResponseUtil.unauthorized(res); return; }
      const { package_qr, recipient_qr } = req.body || {};
      if (!package_qr || !recipient_qr) { ResponseUtil.badRequest(res, 'Les deux QR codes sont requis'); return; }
      const r = await MissionDeliveryService.verifyPair(String(package_qr), String(recipient_qr), req.user.id);
      ResponseUtil.success(res, r, r.match ? 'QR compatibles — livraison confirmée' : 'QR incompatibles');
    } catch (error: any) {
      logger.error('Verify pair error:', error);
      ResponseUtil.badRequest(res, error.message || 'Vérification impossible');
    }
  }

  /** POST /api/v1/missions/scan-complete — GP finished scanning; admin must validate. */
  static async scanComplete(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { ResponseUtil.unauthorized(res); return; }
      const r = await MissionDeliveryService.completeScan(req.user.id);
      ResponseUtil.success(res, r, 'Scan terminé — en attente de validation par l\'administration');
    } catch (error: any) {
      ResponseUtil.badRequest(res, error.message || 'Échec');
    }
  }

  /**
   * Verify QR code and confirm delivery
   * POST /api/v1/missions/verify-qr
   */
  static async verifyDelivery(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      if (req.user.user_type !== UserType.GP) {
        ResponseUtil.forbidden(res, 'Only GPs can verify delivery');
        return;
      }

      const { qr_data } = req.body;
      if (!qr_data) {
        ResponseUtil.badRequest(res, 'QR code data is required');
        return;
      }

      const mission = await MissionDeliveryService.verifyDeliveryByQR(qr_data, req.user.id);

      ResponseUtil.success(res, { mission }, 'Livraison confirmée avec succès');
    } catch (error: any) {
      logger.error('Verify delivery error:', error);
      ResponseUtil.badRequest(res, error.message || 'Verification failed');
    }
  }

  /**
   * Get tracking history
   * GET /api/v1/missions/:id/tracking
   */
  static async getTracking(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!(await MissionController.canAccess(req, req.params.id))) {
        ResponseUtil.notFound(res, 'Mission not found');
        return;
      }
      const tracking = await MissionService.getTrackingHistory(req.params.id);

      ResponseUtil.success(res, tracking);
    } catch (error: any) {
      logger.error('Get tracking error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get tracking');
    }
  }

  /**
   * Track by tracking number
   * GET /api/v1/tracking/:trackingNumber
   */
  static async trackByNumber(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await MissionService.trackByNumber(req.params.trackingNumber);

      if (!result || !req.user || missionAccessLevel(req.user, result.mission) !== 'full') {
        ResponseUtil.notFound(res, 'Tracking number not found');
        return;
      }

      ResponseUtil.success(res, result);
    } catch (error: any) {
      logger.error('Track by number error:', error);
      ResponseUtil.badRequest(res, error.message || 'Tracking failed');
    }
  }
}
