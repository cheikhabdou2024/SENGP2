import { Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

export class WalletController {
  /**
   * Get current user's wallet (balances + earnings stats)
   * GET /api/v1/wallet/me
   */
  static async getMyWallet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const wallet = await WalletService.getWallet(req.user.id);

      ResponseUtil.success(res, wallet);
    } catch (error: any) {
      logger.error('Get wallet error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get wallet');
    }
  }

  /**
   * Get current user's transaction history
   * GET /api/v1/wallet/transactions
   */
  static async getTransactions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await WalletService.getTransactions(req.user.id, page, limit);

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get transactions error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get transactions');
    }
  }
}
