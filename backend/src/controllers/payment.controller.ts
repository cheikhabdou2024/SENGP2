import { Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

export class PaymentController {
  /**
   * Initiate a payment
   * POST /api/v1/payments
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const { payment, redirect_url } = await PaymentService.create(req.body, req.user.id);

      ResponseUtil.created(res, { payment, redirect_url }, 'Payment initiated');
    } catch (error: any) {
      logger.error('Payment creation error:', error);

      if (error.message === 'Mission not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }
      if (error.message.includes('your own missions')) {
        ResponseUtil.forbidden(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Payment initiation failed');
    }
  }

  /**
   * Get payment by ID
   * GET /api/v1/payments/:id
   */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const payment: any = await PaymentService.getById(req.params.id);

      if (!payment) {
        ResponseUtil.notFound(res, 'Payment not found');
        return;
      }

      if (payment.payer_id !== req.user.id && payment.payee_id !== req.user.id) {
        ResponseUtil.forbidden(res, 'You cannot view this payment');
        return;
      }

      ResponseUtil.success(res, payment);
    } catch (error: any) {
      logger.error('Get payment error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get payment');
    }
  }

  /**
   * Get current user's payments
   * GET /api/v1/payments/my-payments
   */
  static async getMyPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await PaymentService.getMyPayments(req.user.id, page, limit);

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get my payments error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get payments');
    }
  }

  /**
   * Wave webhook (public, signature-verified)
   * POST /api/v1/payments/webhook/wave
   */
  static async webhookWave(req: AuthRequest, res: Response): Promise<void> {
    await PaymentController.handleWebhook('wave', req, res);
  }

  /**
   * Orange Money callback (public, token-verified)
   * POST /api/v1/payments/webhook/orange
   */
  static async webhookOrange(req: AuthRequest, res: Response): Promise<void> {
    await PaymentController.handleWebhook('orange', req, res);
  }

  private static async handleWebhook(key: string, req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await PaymentService.handleWebhook(
        key,
        (req as any).rawBody,
        req.headers,
        req.body
      );
      res.status(result.status).json({ success: result.status < 400, message: result.message });
    } catch (error: any) {
      logger.error(`Webhook ${key} error:`, error);
      // Respond 200 so the provider does not retry a permanent application error,
      // but log it for investigation.
      res.status(200).json({ success: false, message: 'Webhook processing error' });
    }
  }
}
