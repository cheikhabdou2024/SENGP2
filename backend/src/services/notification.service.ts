import pool from '../config/database';
import { Notification, NotificationType, PaginatedResult } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';

/**
 * Maps the canonical `notification_type` enum to the short category key the
 * frontend uses to pick an icon (notifications.html `icons` map).
 */
const TYPE_ICON_MAP: Record<string, string> = {
  mission_matched: 'tracking',
  mission_assigned: 'tracking',
  mission_accepted: 'tracking',
  mission_pickup: 'tracking',
  mission_transit: 'tracking',
  mission_delivered: 'delivery',
  payment_received: 'payment',
  claim_created: 'support',
  claim_resolved: 'support',
  review_received: 'feedback',
  account_verified: 'support',
  system_alert: 'support',
};

export class NotificationService {
  /**
   * Decorate a row with the aliases the frontend reads (`notification_id`, `type`).
   */
  private static decorate(row: any): any {
    return {
      ...row,
      notification_id: row.id,
      type: TYPE_ICON_MAP[row.notification_type] || undefined,
    };
  }

  /**
   * Create a notification for a user. Intended for server-side use (other
   * services) and the admin send endpoint.
   */
  static async create(data: {
    user_id: string;
    notification_type: NotificationType;
    title: string;
    message: string;
    action_url?: string;
    metadata?: any;
  }): Promise<Notification> {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, notification_type, title, message, action_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.user_id,
        data.notification_type,
        data.title,
        data.message,
        data.action_url || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );

    logger.info(`Notification created for user ${data.user_id} (${data.notification_type})`);
    return this.decorate(result.rows[0]);
  }

  /**
   * Get a user's notifications (paginated, newest first).
   */
  static async getByUser(
    userId: string,
    params: { page: number; limit: number; unreadOnly?: boolean }
  ): Promise<PaginatedResult<Notification>> {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);

    let whereClause = 'WHERE user_id = $1';
    if (params.unreadOnly) {
      whereClause += ' AND is_read = FALSE';
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM notifications ${whereClause}`,
      [userId]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT * FROM notifications
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return {
      data: result.rows.map((row) => this.decorate(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Helpers.calculateTotalPages(total, limit),
      },
    };
  }

  /**
   * Count a user's unread notifications.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Mark a single notification as read (scoped to the owner).
   */
  static async markAsRead(id: string, userId: string): Promise<Notification> {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Notification not found');
    }

    return this.decorate(result.rows[0]);
  }

  /**
   * Mark all of a user's notifications as read. Returns the number updated.
   */
  static async markAllAsRead(userId: string): Promise<number> {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    logger.info(`Marked ${result.rowCount} notifications read for user ${userId}`);
    return result.rowCount || 0;
  }

  /**
   * Delete a notification (scoped to the owner).
   */
  static async delete(id: string, userId: string): Promise<void> {
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rowCount === 0) {
      throw new Error('Notification not found');
    }
  }
}
