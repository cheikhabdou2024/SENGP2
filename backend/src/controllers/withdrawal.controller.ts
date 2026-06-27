import { Response } from 'express';
import { WithdrawalService } from '../services/withdrawal.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

export class WithdrawalController {
  /**
   * Request a withdrawal (GP)
   * POST /api/v1/withdrawals
   */
  static async request(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const { amount, method, account_number, account_name } = req.body;
      const withdrawal = await WithdrawalService.request(req.user.id, {
        amount,
        method,
        account_number,
        account_name,
      });

      ResponseUtil.created(res, withdrawal, 'Withdrawal requested');
    } catch (error: any) {
      logger.error('Withdrawal request error:', error);

      if (error.message.includes('Insufficient')) {
        ResponseUtil.conflict(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Withdrawal request failed');
    }
  }

  /**
   * Get current GP's withdrawals
   * GET /api/v1/withdrawals/my-withdrawals
   */
  static async getMine(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await WithdrawalService.listMine(req.user.id, page, limit);

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get my withdrawals error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get withdrawals');
    }
  }

  /**
   * List all withdrawals (admin)
   * GET /api/v1/withdrawals
   */
  static async listAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      const result = await WithdrawalService.listAll(page, limit, status);

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('List withdrawals error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to list withdrawals');
    }
  }

  /**
   * Approve a withdrawal (admin)
   * PUT /api/v1/withdrawals/:id/approve
   */
  static async approve(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const withdrawal = await WithdrawalService.approve(req.params.id, req.user.id);

      ResponseUtil.success(res, withdrawal, 'Withdrawal approved');
    } catch (error: any) {
      logger.error('Approve withdrawal error:', error);

      if (error.message.includes('not found')) {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Approval failed');
    }
  }

  /**
   * Reject a withdrawal (admin)
   * PUT /api/v1/withdrawals/:id/reject
   */
  static async reject(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const withdrawal = await WithdrawalService.reject(
        req.params.id,
        req.user.id,
        req.body.reason
      );

      ResponseUtil.success(res, withdrawal, 'Withdrawal rejected');
    } catch (error: any) {
      logger.error('Reject withdrawal error:', error);

      if (error.message.includes('not found')) {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Rejection failed');
    }
  }
}
