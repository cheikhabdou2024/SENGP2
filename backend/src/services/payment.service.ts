import pool from '../config/database';
import { Payment, NotificationType } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';
import { getProvider, getProviderByWebhookKey } from './providers';
import { NotificationService } from './notification.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CURRENCY = process.env.PAYMENT_CURRENCY || 'XOF';

export class PaymentService {
  /** Resolve a mission reference (UUID or human mission_code) to its row. */
  private static async resolveMission(ref: string): Promise<any> {
    const isUuid = UUID_REGEX.test(ref);
    const result = await pool.query(
      isUuid
        ? 'SELECT * FROM missions WHERE id = $1'
        : 'SELECT * FROM missions WHERE mission_code = $1',
      [ref]
    );
    if (result.rows.length === 0) {
      throw new Error('Mission not found');
    }
    return result.rows[0];
  }

  /**
   * Initiate a payment: create a pending row, open a provider checkout, and
   * return the redirect URL for the payer.
   */
  static async create(
    data: any,
    payerId: string
  ): Promise<{ payment: Payment; redirect_url: string }> {
    const mission = await this.resolveMission(data.mission_id || data.mission_code);

    if (mission.expediteur_id !== payerId) {
      throw new Error('You can only pay for your own missions');
    }

    const amount = data.amount ? Number(data.amount) : Number(mission.offered_price);
    if (!amount || amount <= 0) {
      throw new Error('Invalid payment amount');
    }

    const commissionPct = Number(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 10;
    const commission = Helpers.calculateCommission(amount, commissionPct);
    const net_amount = amount - commission;
    const payment_code = Helpers.generateCode('PAY');
    const provider = getProvider(data.payment_method);

    // Persist the pending payment first so we have a record even if the provider
    // call fails midway.
    const inserted = await pool.query(
      `INSERT INTO payments (
        payment_code, mission_id, payer_id, payee_id, amount, currency,
        commission, net_amount, payment_method, payment_provider, status, transaction_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'mission_payment')
      RETURNING *`,
      [
        payment_code,
        mission.id,
        payerId,
        mission.gp_id || null,
        amount,
        CURRENCY,
        commission,
        net_amount,
        data.payment_method,
        provider.method,
        ]
    );
    const payment = inserted.rows[0];

    try {
      const frontend = (process.env.FRONTEND_URL || '').split(',')[0] || '';
      const successUrl = process.env.PAYMENT_SUCCESS_URL || `${frontend}/paiement.html`;
      const errorUrl = process.env.PAYMENT_ERROR_URL || `${frontend}/creenvoi.html`;

      const checkout = await provider.createCheckout({
        amount,
        currency: CURRENCY,
        reference: payment_code,
        successUrl,
        errorUrl,
      });

      const updated = await pool.query(
        `UPDATE payments
         SET external_reference = $1, payment_details = $2
         WHERE id = $3
         RETURNING *`,
        [checkout.providerSessionId || null, checkout.raw ? JSON.stringify(checkout.raw) : null, payment.id]
      );

      logger.info(`Payment initiated: ${payment_code} (${provider.method}) for mission ${mission.mission_code}`);

      return { payment: updated.rows[0], redirect_url: checkout.redirectUrl };
    } catch (error: any) {
      await pool.query(
        `UPDATE payments SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        [error.message || 'Provider checkout failed', payment.id]
      );
      logger.error(`Payment ${payment_code} provider error:`, error.message);
      throw new Error('Failed to initiate payment with provider');
    }
  }

  /**
   * Handle a provider webhook/callback: verify, correlate, and (idempotently)
   * settle the payment. The GP wallet is credited later, at mission delivery.
   */
  static async handleWebhook(
    webhookKey: string,
    rawBody: Buffer | string | undefined,
    headers: any,
    parsedBody: any
  ): Promise<{ status: number; message: string }> {
    const provider = getProviderByWebhookKey(webhookKey);

    if (!provider.verifyWebhook(rawBody, headers, parsedBody)) {
      logger.warn(`Rejected ${webhookKey} webhook: signature/verification failed`);
      return { status: 400, message: 'Invalid signature' };
    }

    const parsed = provider.parseWebhook(parsedBody);

    // Correlate to our payment: by reference (Wave) or stored token (Orange).
    let payment: any;
    if (parsed.reference) {
      const r = await pool.query('SELECT * FROM payments WHERE payment_code = $1', [parsed.reference]);
      payment = r.rows[0];
    }
    if (!payment && parsed.token) {
      const r = await pool.query(
        `SELECT * FROM payments WHERE payment_details->>'notif_token' = $1`,
        [parsed.token]
      );
      payment = r.rows[0];
    }

    if (!payment) {
      logger.warn(`Webhook ${webhookKey}: no matching payment`);
      return { status: 404, message: 'Payment not found' };
    }

    // Defense-in-depth for token-correlated providers.
    if (parsed.token) {
      const stored = payment.payment_details?.notif_token;
      if (!stored || stored !== parsed.token) {
        logger.warn(`Webhook ${webhookKey}: notif_token mismatch for ${payment.payment_code}`);
        return { status: 400, message: 'Token mismatch' };
      }
    }

    // Idempotent: already settled.
    if (payment.status === 'completed') {
      return { status: 200, message: 'Already processed' };
    }

    if (parsed.status === 'completed') {
      await this.markCompleted(payment, parsed.providerTxnId);
      return { status: 200, message: 'Completed' };
    }

    if (parsed.status === 'failed') {
      await pool.query(
        `UPDATE payments SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        ['Provider reported failure', payment.id]
      );
      return { status: 200, message: 'Marked failed' };
    }

    return { status: 200, message: 'Pending' };
  }

  /**
   * Mark a payment completed and record the expéditeur's spend. The GP is paid
   * out of this payment when the mission is delivered (see MissionService).
   */
  private static async markCompleted(payment: any, providerTxnId?: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const upd = await client.query(
        `UPDATE payments
         SET status = 'completed', external_transaction_id = $1,
             processed_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status <> 'completed'
         RETURNING *`,
        [providerTxnId || null, payment.id]
      );

      // Another concurrent webhook won the race — nothing to do.
      if (upd.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      await client.query(
        `UPDATE expediteur_profiles SET total_spent = total_spent + $1 WHERE user_id = $2`,
        [payment.amount, payment.payer_id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    logger.info(`Payment completed: ${payment.payment_code}`);

    // Notify the payer (best-effort, outside the transaction).
    try {
      await NotificationService.create({
        user_id: payment.payer_id,
        notification_type: NotificationType.PAYMENT_RECEIVED,
        title: 'Paiement confirmé',
        message: `Votre paiement de ${Helpers.formatCurrency(Number(payment.amount))} a été confirmé.`,
      });
    } catch (e: any) {
      logger.warn('Failed to create payment notification:', e.message);
    }
  }

  static async getById(id: string): Promise<Payment | null> {
    const result = await pool.query(
      `SELECT p.*, m.mission_code
       FROM payments p
       LEFT JOIN missions m ON p.mission_id = m.id
       WHERE p.id = $1`,
      [id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /** Payments where the user is the payer or the payee. */
  static async getMyPayments(userId: string, page: number, limit: number) {
    const { offset } = Helpers.getPaginationParams(page, limit);

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM payments WHERE payer_id = $1 OR payee_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT p.*, m.mission_code
       FROM payments p
       LEFT JOIN missions m ON p.mission_id = m.id
       WHERE p.payer_id = $1 OR p.payee_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return {
      data: result.rows,
      pagination: {
        page: Math.max(1, page),
        limit,
        total,
        totalPages: Helpers.calculateTotalPages(total, limit),
      },
    };
  }
}
