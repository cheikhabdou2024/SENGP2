import pool from '../config/database';
import { Mission, MissionStatus, NotificationType, PaginatedResult } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';
import QRCode from 'qrcode';
import { NotificationService } from './notification.service';

export class MissionService {
  /**
   * Create a new mission
   */
  static async create(data: Partial<Mission>, expediteurId: string): Promise<Mission> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Generate mission code and tracking number
      const mission_code = Helpers.generateCode('MIS');
      const tracking_number = Helpers.generateTrackingNumber();

      // Calculate insurance cost if insured
      const insurance_cost = data.is_insured && data.package_value
        ? Helpers.calculateInsuranceFee(data.package_value)
        : 0;

      // Insert mission
      const result = await client.query(
        `INSERT INTO missions (
          mission_code, expediteur_id, departure_country, departure_city, pickup_address,
          arrival_country, arrival_city, delivery_address, package_weight, package_length,
          package_width, package_height, package_description, package_value, package_photos,
          desired_departure_date, desired_arrival_date, offered_price, is_price_negotiable,
          is_insured, insurance_cost, tracking_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING *`,
        [
          mission_code,
          expediteurId,
          data.departure_country,
          data.departure_city,
          data.pickup_address,
          data.arrival_country,
          data.arrival_city,
          data.delivery_address,
          data.package_weight,
          data.package_length,
          data.package_width,
          data.package_height,
          data.package_description,
          data.package_value,
          JSON.stringify(data.package_photos || []),
          data.desired_departure_date,
          data.desired_arrival_date,
          data.offered_price,
          data.is_price_negotiable || false,
          data.is_insured !== false,
          insurance_cost,
          tracking_number,
        ]
      );

      const mission = result.rows[0];

      // Update expediteur profile
      await client.query(
        `UPDATE expediteur_profiles
         SET total_shipments = total_shipments + 1
         WHERE user_id = $1`,
        [expediteurId]
      );

      await client.query('COMMIT');

      logger.info(`Mission created: ${mission.mission_code} by user ${expediteurId}`);

      return mission;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get mission by ID
   */
  static async getById(id: string): Promise<Mission | null> {
    const result = await pool.query(
      `SELECT m.*,
              e.first_name as expediteur_first_name,
              e.last_name as expediteur_last_name,
              e.phone as expediteur_phone,
              g.first_name as gp_first_name,
              g.last_name as gp_last_name,
              g.phone as gp_phone
       FROM missions m
       LEFT JOIN users e ON m.expediteur_id = e.id
       LEFT JOIN users g ON m.gp_id = g.id
       WHERE m.id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get missions with pagination and filters
   */
  static async getAll(params: {
    page: number;
    limit: number;
    status?: MissionStatus;
    expediteur_id?: string;
    gp_id?: string;
    departure_city?: string;
    arrival_city?: string;
  }): Promise<PaginatedResult<Mission>> {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);

    // Build WHERE conditions
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramIndex = 1;

    // NOTE: the data query JOINs users (which also has a `status` column), so every
    // missions column referenced here must be qualified with the `m.` alias to avoid
    // an "ambiguous column" error. The count query below aliases missions as `m` too.
    if (params.status) {
      whereClause += ` AND m.status = $${paramIndex}`;
      queryParams.push(params.status);
      paramIndex++;
    }

    if (params.expediteur_id) {
      whereClause += ` AND m.expediteur_id = $${paramIndex}`;
      queryParams.push(params.expediteur_id);
      paramIndex++;
    }

    if (params.gp_id) {
      whereClause += ` AND m.gp_id = $${paramIndex}`;
      queryParams.push(params.gp_id);
      paramIndex++;
    }

    if (params.departure_city) {
      whereClause += ` AND m.departure_city ILIKE $${paramIndex}`;
      queryParams.push(`%${params.departure_city}%`);
      paramIndex++;
    }

    if (params.arrival_city) {
      whereClause += ` AND m.arrival_city ILIKE $${paramIndex}`;
      queryParams.push(`%${params.arrival_city}%`);
      paramIndex++;
    }

    // Get total count with separate query (alias missions as m to match whereClause)
    const countQuery = `SELECT COUNT(*) FROM missions m ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data with JOIN for user details
    const dataQuery = `
      SELECT m.*,
             e.first_name || ' ' || e.last_name as expediteur_name,
             e.phone as expediteur_phone,
             g.first_name || ' ' || g.last_name as gp_name,
             g.phone as gp_phone,
             CONCAT(m.package_length, 'x', m.package_width, 'x', m.package_height) as dimensions,
             m.package_weight as weight,
             m.offered_price as price,
             m.desired_departure_date as departure_date
      FROM missions m
      LEFT JOIN users e ON m.expediteur_id = e.id
      LEFT JOIN users g ON m.gp_id = g.id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataParams = [...queryParams, limit, offset];
    const result = await pool.query(dataQuery, dataParams);

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Helpers.calculateTotalPages(total, limit),
      },
    };
  }

  /**
   * Update mission
   */
  static async update(id: string, data: Partial<Mission>): Promise<Mission> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'mission_code') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE missions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Mission not found');
    }

    logger.info(`Mission updated: ${id}`);
    return result.rows[0];
  }

  /**
   * Accept mission (GP)
   */
  static async accept(
    missionId: string,
    gpId: string,
    tripId?: string
  ): Promise<Mission> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if mission is still available
      const checkResult = await client.query(
        'SELECT status FROM missions WHERE id = $1',
        [missionId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('Mission not found');
      }

      if (checkResult.rows[0].status !== 'pending') {
        throw new Error('Mission is no longer available');
      }

      // Update mission
      const result = await client.query(
        `UPDATE missions
         SET status = 'accepted', gp_id = $1, trip_id = $2
         WHERE id = $3
         RETURNING *`,
        [gpId, tripId, missionId]
      );

      const mission = result.rows[0];

      // Update trip if provided
      if (tripId) {
        await client.query(
          `UPDATE trips
           SET current_packages = current_packages + 1
           WHERE id = $1`,
          [tripId]
        );
      }

      await client.query('COMMIT');

      logger.info(`Mission ${missionId} accepted by GP ${gpId}`);

      return mission;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update mission status
   */
  static async updateStatus(
    id: string,
    status: MissionStatus,
    userId: string
  ): Promise<Mission> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE missions SET status = $1 WHERE id = $2 RETURNING *`,
        [status, id]
      );

      if (result.rows.length === 0) {
        throw new Error('Mission not found');
      }

      const mission = result.rows[0];

      // Add tracking entry
      await client.query(
        `INSERT INTO mission_tracking (mission_id, status, description, created_by)
         VALUES ($1, $2, $3, $4)`,
        [id, status, `Status changed to ${status}`, userId]
      );

      // If delivered, update completion date, credit the GP, and pay them out.
      let creditedNet = 0;
      if (status === MissionStatus.DELIVERED) {
        await client.query(
          `UPDATE missions SET completed_at = CURRENT_TIMESTAMP, actual_delivery_date = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );

        // Update GP stats
        await client.query(
          `UPDATE gp_profiles
           SET total_missions_completed = total_missions_completed + 1
           WHERE user_id = $1`,
          [mission.gp_id]
        );

        // Credit the GP wallet from the mission's completed (upfront) payment.
        if (mission.gp_id) {
          const payRes = await client.query(
            `SELECT net_amount FROM payments
             WHERE mission_id = $1 AND status = 'completed' AND transaction_type = 'mission_payment'
             ORDER BY completed_at DESC LIMIT 1`,
            [id]
          );

          if (payRes.rows.length > 0) {
            creditedNet = Number(payRes.rows[0].net_amount) || 0;

            await client.query(
              `INSERT INTO wallet_balances (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
              [mission.gp_id]
            );
            await client.query(
              `UPDATE wallet_balances
               SET available_balance = available_balance + $1, total_earned = total_earned + $1
               WHERE user_id = $2`,
              [creditedNet, mission.gp_id]
            );
            await client.query(
              `UPDATE gp_profiles SET total_earnings = total_earnings + $1 WHERE user_id = $2`,
              [creditedNet, mission.gp_id]
            );
          }
        }
      }

      await client.query('COMMIT');

      logger.info(`Mission ${id} status updated to ${status}`);

      // Notify the GP of their earnings (best-effort, outside the transaction).
      if (creditedNet > 0 && mission.gp_id) {
        try {
          await NotificationService.create({
            user_id: mission.gp_id,
            notification_type: NotificationType.PAYMENT_RECEIVED,
            title: 'Gains crédités',
            message: `Vous avez gagné ${Helpers.formatCurrency(creditedNet)} pour la mission ${mission.mission_code}.`,
          });
        } catch (e: any) {
          logger.warn('Failed to create earnings notification:', e.message);
        }
      }

      return mission;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate QR Code for mission
   */
  static async generateQRCode(missionId: string): Promise<string> {
    const mission = await this.getById(missionId);

    if (!mission) {
      throw new Error('Mission not found');
    }

    const qrData = JSON.stringify({
      mission_code: mission.mission_code,
      tracking_number: mission.tracking_number,
      id: mission.id,
    });

    const qrCodeUrl = await QRCode.toDataURL(qrData);

    // Update mission with QR code
    await pool.query(
      'UPDATE missions SET qr_code_url = $1, qr_code_data = $2 WHERE id = $3',
      [qrCodeUrl, qrData, missionId]
    );

    return qrCodeUrl;
  }

  /**
   * Get mission tracking history
   */
  static async getTrackingHistory(missionId: string) {
    const result = await pool.query(
      `SELECT mt.*, u.first_name, u.last_name
       FROM mission_tracking mt
       LEFT JOIN users u ON mt.created_by = u.id
       WHERE mt.mission_id = $1
       ORDER BY mt.created_at DESC`,
      [missionId]
    );

    return result.rows;
  }

  /**
   * Track mission by tracking number
   */
  static async trackByNumber(trackingNumber: string) {
    const result = await pool.query(
      `SELECT m.*,
              e.first_name as expediteur_first_name,
              e.phone as expediteur_phone,
              g.first_name as gp_first_name,
              g.phone as gp_phone
       FROM missions m
       LEFT JOIN users e ON m.expediteur_id = e.id
       LEFT JOIN users g ON m.gp_id = g.id
       WHERE m.tracking_number = $1`,
      [trackingNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const mission = result.rows[0];
    const tracking = await this.getTrackingHistory(mission.id);

    return {
      mission,
      tracking,
    };
  }
}
