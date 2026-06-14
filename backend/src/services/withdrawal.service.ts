import pool from '../config/database';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';
import { NotificationType } from '../types';
import { NotificationService } from './notification.service';
import { WalletService } from './wallet.service';

const MIN_WITHDRAWAL = Number(process.env.MIN_WITHDRAWAL_AMOUNT) || 5000;

export class WithdrawalService {
  /**
   * GP requests a withdrawal. Validates against the minimum and available
   * balance, then (atomically) creates a pending withdrawal and holds the funds
   * by debiting the available balance.
   */
  static async request(
    gpId: string,
    data: { amount: number; method: string; account_number: string; account_name?: string }
  ): Promise<any> {
    const amount = Number(data.amount);
    if (!amount || amount < MIN_WITHDRAWAL) {
      throw new Error(`Minimum withdrawal is ${Helpers.formatCurrency(MIN_WITHDRAWAL)}`);
    }
    if (!data.method) {
      throw new Error('Withdrawal method is required');
    }
    if (!data.account_number) {
      throw new Error('Account number is required');
    }

    await WalletService.getOrCreate(gpId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Hold the funds: debit available_balance only if sufficient.
      const debit = await client.query(
        `UPDATE wallet_balances
         SET available_balance = available_balance - $1
         WHERE user_id = $2 AND available_balance >= $1
         RETURNING available_balance`,
        [amount, gpId]
      );

      if (debit.rows.length === 0) {
        throw new Error('Insufficient available balance');
      }

      const withdrawal_code = Helpers.generateCode('WTH');
      const inserted = await client.query(
        `INSERT INTO withdrawals (
           withdrawal_code, gp_id, amount, withdrawal_method, account_number, account_name, status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [withdrawal_code, gpId, amount, data.method, data.account_number, data.account_name || null]
      );

      await client.query('COMMIT');

      logger.info(`Withdrawal requested: ${withdrawal_code} by GP ${gpId}`);
      return inserted.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async listMine(gpId: string, page: number, limit: number) {
    return this.list({ gp_id: gpId }, page, limit);
  }

  static async listAll(page: number, limit: number, status?: string) {
    return this.list({ status }, page, limit);
  }

  private static async list(
    filters: { gp_id?: string; status?: string },
    page: number,
    limit: number
  ) {
    const { offset } = Helpers.getPaginationParams(page, limit);

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let i = 1;
    if (filters.gp_id) {
      where += ` AND w.gp_id = $${i++}`;
      params.push(filters.gp_id);
    }
    if (filters.status) {
      where += ` AND w.status = $${i++}`;
      params.push(filters.status);
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM withdrawals w ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT w.*, u.first_name || ' ' || u.last_name AS gp_name, u.phone AS gp_phone
       FROM withdrawals w
       LEFT JOIN users u ON w.gp_id = u.id
       ${where}
       ORDER BY w.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
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

  /**
   * Admin approves a withdrawal: mark completed and record the payout against the
   * wallet's total_withdrawn. (The actual money transfer is done manually.)
   */
  static async approve(id: string, adminId: string): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE withdrawals
         SET status = 'completed', approved_by = $1, approved_at = CURRENT_TIMESTAMP,
             processed_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status = 'pending'
         RETURNING *`,
        [adminId, id]
      );

      if (result.rows.length === 0) {
        throw new Error('Withdrawal not found or not pending');
      }
      const withdrawal = result.rows[0];

      await client.query(
        `UPDATE wallet_balances
         SET total_withdrawn = total_withdrawn + $1
         WHERE user_id = $2`,
        [withdrawal.amount, withdrawal.gp_id]
      );

      await client.query('COMMIT');

      await this.notify(
        withdrawal.gp_id,
        'Retrait approuvé',
        `Votre retrait de ${Helpers.formatCurrency(Number(withdrawal.amount))} a été approuvé.`
      );

      logger.info(`Withdrawal approved: ${withdrawal.withdrawal_code} by admin ${adminId}`);
      return withdrawal;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Admin rejects a withdrawal: refund the held funds back to available_balance.
   */
  static async reject(id: string, adminId: string, reason: string): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE withdrawals
         SET status = 'rejected', approved_by = $1, approved_at = CURRENT_TIMESTAMP,
             rejection_reason = $2
         WHERE id = $3 AND status = 'pending'
         RETURNING *`,
        [adminId, reason || null, id]
      );

      if (result.rows.length === 0) {
        throw new Error('Withdrawal not found or not pending');
      }
      const withdrawal = result.rows[0];

      await client.query(
        `UPDATE wallet_balances
         SET available_balance = available_balance + $1
         WHERE user_id = $2`,
        [withdrawal.amount, withdrawal.gp_id]
      );

      await client.query('COMMIT');

      await this.notify(
        withdrawal.gp_id,
        'Retrait rejeté',
        `Votre retrait de ${Helpers.formatCurrency(Number(withdrawal.amount))} a été rejeté${
          reason ? `: ${reason}` : ''
        }. Les fonds ont été recrédités.`
      );

      logger.info(`Withdrawal rejected: ${withdrawal.withdrawal_code} by admin ${adminId}`);
      return withdrawal;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private static async notify(userId: string, title: string, message: string): Promise<void> {
    try {
      await NotificationService.create({
        user_id: userId,
        notification_type: NotificationType.SYSTEM_ALERT,
        title,
        message,
      });
    } catch (e: any) {
      logger.warn('Failed to create withdrawal notification:', e.message);
    }
  }
}
