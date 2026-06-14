import pool from '../config/database';
import { Helpers } from '../utils/helpers';

export class WalletService {
  /** Ensure a wallet row exists for the user, then return it. */
  static async getOrCreate(userId: string): Promise<any> {
    await pool.query(
      `INSERT INTO wallet_balances (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const result = await pool.query('SELECT * FROM wallet_balances WHERE user_id = $1', [userId]);
    return result.rows[0];
  }

  /**
   * Wallet balances plus a few earnings stats used by gains.html.
   */
  static async getWallet(userId: string): Promise<any> {
    const wallet = await this.getOrCreate(userId);

    const missionsResult = await pool.query(
      `SELECT total_missions_completed FROM gp_profiles WHERE user_id = $1`,
      [userId]
    );
    const missionsCompleted = parseInt(missionsResult.rows[0]?.total_missions_completed) || 0;

    const monthResult = await pool.query(
      `SELECT COALESCE(SUM(p.net_amount), 0) AS this_month
       FROM payments p
       JOIN missions m ON p.mission_id = m.id
       WHERE m.gp_id = $1
         AND p.status = 'completed'
         AND m.status = 'delivered'
         AND date_trunc('month', m.completed_at) = date_trunc('month', CURRENT_DATE)`,
      [userId]
    );
    const thisMonth = Number(monthResult.rows[0]?.this_month) || 0;

    const totalEarned = Number(wallet.total_earned) || 0;
    const average = missionsCompleted > 0 ? Math.round(totalEarned / missionsCompleted) : 0;

    return {
      available_balance: Number(wallet.available_balance) || 0,
      pending_balance: Number(wallet.pending_balance) || 0,
      total_earned: totalEarned,
      total_withdrawn: Number(wallet.total_withdrawn) || 0,
      currency: wallet.currency,
      this_month: thisMonth,
      average,
      missions_completed: missionsCompleted,
    };
  }

  /**
   * Unified, paginated transaction history (payments + withdrawals) for gains.html.
   */
  static async getTransactions(userId: string, page: number, limit: number) {
    const { offset } = Helpers.getPaginationParams(page, limit);

    const countResult = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM payments WHERE payer_id = $1 OR payee_id = $1)
       + (SELECT COUNT(*) FROM withdrawals WHERE gp_id = $1) AS total`,
      [userId]
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT * FROM (
         SELECT
           p.id,
           CASE WHEN p.payee_id = $1 THEN 'income' ELSE 'expense' END AS direction,
           CASE WHEN p.payee_id = $1 THEN p.net_amount ELSE p.amount END AS amount,
           p.status,
           p.payment_method AS method,
           p.payment_code AS reference,
           'payment' AS kind,
           p.created_at
         FROM payments p
         WHERE p.payer_id = $1 OR p.payee_id = $1
         UNION ALL
         SELECT
           w.id,
           'withdrawal' AS direction,
           w.amount,
           w.status,
           w.withdrawal_method AS method,
           w.withdrawal_code AS reference,
           'withdrawal' AS kind,
           w.created_at
         FROM withdrawals w
         WHERE w.gp_id = $1
       ) tx
       ORDER BY tx.created_at DESC
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
