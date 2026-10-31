import pool from '../../config/database';
import { Helpers } from '../../utils/helpers';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../../types';
import logger from '../../utils/logger';

/** Paiements et remboursements. */
export class AdminPaymentService {
  // ---------- Payments (read-only) ----------
  static async listPayments(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND p.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (p.payment_code ILIKE $${i} OR p.external_transaction_id ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM payments p ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT p.id, p.payment_code, p.amount, p.commission, p.net_amount, p.currency,
              p.payment_method, p.status, p.transaction_type, p.created_at,
              payer.first_name || ' ' || payer.last_name AS payer_name,
              payee.first_name || ' ' || payee.last_name AS payee_name
       FROM payments p
       LEFT JOIN users payer ON p.payer_id = payer.id
       LEFT JOIN users payee ON p.payee_id = payee.id
       ${where} ORDER BY p.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  /**
   * Refund a completed payment (administrative status change + payer notice).
   * NOTE: this records the refund in our system; the actual money movement with
   * the provider (Wave / Orange Money) must be done via their refund flow — a
   * provider refund hook can be wired here later.
   */
  static async refundPayment(id: string, _adminId: string, reason?: string) {
    const r = await pool.query(
      `UPDATE payments
          SET status = 'refunded', refund_reason = $2, refunded_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'completed' AND credited_at IS NULL
        RETURNING id, payment_code, payer_id, amount`,
      [id, reason || null]
    );
    if (r.rows.length === 0) {
      const exists = await pool.query('SELECT status, credited_at FROM payments WHERE id = $1', [id]);
      if (exists.rows.length === 0) throw new Error('Payment not found');
      if (exists.rows[0].status === 'completed' && exists.rows[0].credited_at) {
        throw new Error('Payment already credited to the GP: handle it as a claim or compensation');
      }
      throw new Error('Only completed payments can be refunded');
    }
    const p = r.rows[0];
    if (p.payer_id) {
      try {
        await NotificationService.create({
          user_id: p.payer_id,
          notification_type: NotificationType.SYSTEM_ALERT,
          title: 'Paiement remboursé',
          message: `Votre paiement ${p.payment_code} de ${Helpers.formatCurrency(Number(p.amount))} a été remboursé${reason ? ` : ${reason}` : ''}.`,
        });
      } catch (e) { logger.warn(`Payment ${id} refunded but notification failed`); }
    }
    return p;
  }

  /** All payments matching filters (no pagination) — for CSV export. */
  static async listPaymentsForExport(params: { search?: string; status?: string }) {
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND p.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (p.payment_code ILIKE $${i} OR p.external_transaction_id ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const r = await pool.query(
      `SELECT p.payment_code, p.amount, p.commission, p.net_amount, p.currency,
              p.payment_method, p.status, p.transaction_type, p.created_at,
              payer.first_name || ' ' || payer.last_name AS payer_name,
              payee.first_name || ' ' || payee.last_name AS payee_name
         FROM payments p
         LEFT JOIN users payer ON p.payer_id = payer.id
         LEFT JOIN users payee ON p.payee_id = payee.id
         ${where} ORDER BY p.created_at DESC`,
      args
    );
    return r.rows;
  }
}
