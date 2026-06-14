import { Response } from 'express';
import { ClaimService } from '../services/claim.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest, UserType } from '../types';
import logger from '../utils/logger';

export class ClaimController {
  /**
   * Create new claim
   * POST /api/v1/claims
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const claim = await ClaimService.create(req.body, req.user.id);

      ResponseUtil.created(res, claim, 'Claim created successfully');
    } catch (error: any) {
      logger.error('Claim creation error:', error);

      if (error.message === 'Mission not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Claim creation failed');
    }
  }

  /**
   * Get claim by ID
   * GET /api/v1/claims/:id
   */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const claim = await ClaimService.getById(req.params.id);

      if (!claim) {
        ResponseUtil.notFound(res, 'Claim not found');
        return;
      }

      // Only the claimant or an admin may view a claim
      const isAdmin = req.user.user_type === UserType.ADMIN;
      if (!isAdmin && (claim as any).claimant_id !== req.user.id) {
        ResponseUtil.forbidden(res, 'You cannot view this claim');
        return;
      }

      ResponseUtil.success(res, claim);
    } catch (error: any) {
      logger.error('Get claim error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get claim');
    }
  }

  /**
   * Get all claims with filters (admin)
   * GET /api/v1/claims
   */
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as any;
      const claim_type = req.query.claim_type as any;
      const priority = req.query.priority as string;

      const result = await ClaimService.getAll({ page, limit, status, claim_type, priority });

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get claims error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get claims');
    }
  }

  /**
   * Get current user's claims
   * GET /api/v1/claims/my-claims
   */
  static async getMyClaims(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as any;

      const result = await ClaimService.getAll({
        page,
        limit,
        status,
        claimant_id: req.user.id,
      });

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get my claims error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get claims');
    }
  }

  /**
   * Update claim
   * PUT /api/v1/claims/:id
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const isAdmin = req.user.user_type === UserType.ADMIN;
      const claim = await ClaimService.update(req.params.id, req.user.id, isAdmin, req.body);

      ResponseUtil.success(res, claim, 'Claim updated successfully');
    } catch (error: any) {
      logger.error('Update claim error:', error);

      if (error.message === 'Claim not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      if (error.message.includes('your own claims')) {
        ResponseUtil.forbidden(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Update failed');
    }
  }

  /**
   * Resolve claim (admin)
   * POST /api/v1/claims/:id/resolve
   */
  static async resolve(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const { resolution, status, compensation_amount } = req.body;
      const claim = await ClaimService.resolve(req.params.id, req.user.id, {
        resolution,
        status,
        compensation_amount,
      });

      ResponseUtil.success(res, claim, 'Claim resolved successfully');
    } catch (error: any) {
      logger.error('Resolve claim error:', error);

      if (error.message === 'Claim not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Resolution failed');
    }
  }
}
