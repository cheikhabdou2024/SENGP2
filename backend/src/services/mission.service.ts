import pool from '../config/database';
import { Mission, MissionStatus, NotificationType, PaginatedResult } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';
import { NotificationService } from './notification.service';
import { MissionAlerts } from './mission-alerts.service';
import { withTransaction } from '../utils/transaction';
import { EDITABLE_MISSION_FIELDS } from '../utils/missionAccess';

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
          is_insured, insurance_cost, tracking_number, recipient_name, recipient_phone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
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
          (data as any).recipient_name || null,
          (data as any).recipient_phone || null,
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

      await NotificationService.notifyAdmins({
        notification_type: NotificationType.SYSTEM_ALERT,
        title: 'Nouvelle mission à affecter',
        message: `Mission ${mission.mission_code} : ${mission.departure_city} → ${mission.arrival_city}, ${mission.package_weight} kg. Affectez-la à un GP qui voyage vers cette destination.`,
        metadata: { kind: 'mission_created', mission_id: mission.id },
      });

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
    /** Ne renvoie que les missions encore non assignées (vue « à pourvoir » des GP). */
    unassignedOnly?: boolean;
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

    if (params.unassignedOnly) {
      whereClause += ' AND m.gp_id IS NULL';
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

    // Build dynamic update query. Les noms de colonnes sont concaténés dans le SQL : seuls
    // les champs de la liste blanche sont acceptés (défense en profondeur, en plus du contrôleur).
    Object.entries(data).forEach(([key, value]) => {
      if (!(EDITABLE_MISSION_FIELDS as readonly string[]).includes(key)) {
        throw new Error('Champ non modifiable : ' + key);
      }
      if (value !== undefined) {
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
    const mission = await withTransaction(async client => {
      // Check if mission is still available
      const checkResult = await client.query(
        'SELECT status, gp_id FROM missions WHERE id = $1 FOR UPDATE',
        [missionId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('Mission not found');
      }

      // GPs do not claim missions directly — the admin assigns them. Acceptance is
      // only allowed to CONFIRM a mission the admin assigned to THIS GP ('matched'
      // with this gp_id). Any other case is rejected.
      const current = checkResult.rows[0];
      const isAssignedConfirm = current.status === 'matched' && current.gp_id === gpId;
      if (!isAssignedConfirm) {
        throw new Error('Cette mission ne vous a pas été assignée');
      }

      const result = await client.query(
        `UPDATE missions
         SET status = 'accepted', gp_id = $1, trip_id = COALESCE($2, trip_id)
         WHERE id = $3
         RETURNING *`,
        [gpId, tripId || null, missionId]
      );
      const accepted = result.rows[0];

      // Update the trip (given explicitly or linked at assignment)
      const linkedTripId = tripId || accepted.trip_id;
      if (linkedTripId) {
        await client.query(
          `UPDATE trips
           SET current_packages = current_packages + 1
           WHERE id = $1`,
          [linkedTripId]
        );
      }
      return accepted;
    });

    logger.info(`Mission ${missionId} accepted by GP ${gpId}`);

    await MissionAlerts.gpResponded(mission, gpId, true);

    return mission;
  }

  /**
   * A GP declines a mission the admin assigned to them. The mission is released
   * back to the pool ('pending', gp_id cleared) so the admin can re-assign it.
   * Only the currently-assigned GP, on a still-'matched' mission, may decline.
   */
  static async declineAssignment(missionId: string, gpId: string): Promise<Mission> {
    const result = await pool.query(
      `UPDATE missions
       SET status = 'pending', gp_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND gp_id = $2 AND status = 'matched'
       RETURNING *`,
      [missionId, gpId]
    );
    if (result.rows.length === 0) {
      throw new Error('Mission not found or not awaiting your response');
    }
    logger.info(`Mission ${missionId} declined by GP ${gpId} — released to pool`);
    await MissionAlerts.gpResponded(result.rows[0], gpId, false);
    return result.rows[0];
  }

  /**
   * Public, read-only tracking by an opaque token (the tracking_number or
   * mission_code). Returns ONLY non-sensitive fields (no addresses, prices,
   * phones or internal ids) for the recipient's public tracking page.
   */
  static async getPublicTracking(token: string): Promise<any> {
    const mRes = await pool.query(
      `SELECT m.id, m.mission_code, m.tracking_number, m.status,
              m.departure_country, m.departure_city, m.arrival_country, m.arrival_city,
              m.package_weight, m.desired_departure_date, m.desired_arrival_date,
              m.created_at, m.completed_at,
              g.first_name AS gp_first_name
       FROM missions m
       LEFT JOIN users g ON m.gp_id = g.id
       WHERE m.tracking_number = $1 OR m.mission_code = $1
       LIMIT 1`,
      [token]
    );
    if (mRes.rows.length === 0) throw new Error('Not found');
    const m = mRes.rows[0];

    const tRes = await pool.query(
      `SELECT status, location, latitude, longitude, description, created_at
       FROM mission_tracking WHERE mission_id = $1 ORDER BY created_at DESC`,
      [m.id]
    );

    return {
      mission: {
        mission_code: m.mission_code,
        tracking_number: m.tracking_number,
        status: m.status,
        departure_country: m.departure_country,
        departure_city: m.departure_city,
        arrival_country: m.arrival_country,
        arrival_city: m.arrival_city,
        package_weight: m.package_weight,
        desired_departure_date: m.desired_departure_date,
        desired_arrival_date: m.desired_arrival_date,
        created_at: m.created_at,
        completed_at: m.completed_at,
        gp_first_name: m.gp_first_name,
      },
      tracking: tRes.rows,
    };
  }

  /**
   * Record a live GPS position for a mission (sent by the assigned GP while in
   * transit). Stored as a `location` tracking entry so the expéditeur's map can
   * show the latest point. Only the assigned GP, on an active mission, may post.
   */
  static async addLocation(
    missionId: string,
    gpId: string,
    latitude: number,
    longitude: number
  ): Promise<void> {
    const check = await pool.query(
      'SELECT gp_id, status FROM missions WHERE id = $1',
      [missionId]
    );
    if (check.rows.length === 0) throw new Error('Mission not found');
    const m = check.rows[0];
    if (m.gp_id !== gpId) throw new Error('Not your mission');
    const active = ['accepted', 'picked_up', 'in_transit', 'in_customs', 'out_for_delivery'];
    if (!active.includes(m.status)) throw new Error('Mission is not in transit');

    await pool.query(
      `INSERT INTO mission_tracking (mission_id, status, latitude, longitude, description, created_by)
       VALUES ($1, 'location', $2, $3, 'Position GPS', $4)`,
      [missionId, latitude, longitude, gpId]
    );
  }

  /**
   * Update mission status
   */
  static async updateStatus(
    id: string,
    status: MissionStatus,
    userId: string,
    opts: { internal?: boolean } = {}
  ): Promise<Mission> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Load current state for authorization + transition validation.
      const cur = await client.query(
        `SELECT status, gp_id, expediteur_id FROM missions WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (cur.rows.length === 0) {
        throw new Error('Mission not found');
      }
      const current = String(cur.rows[0].status || '').toLowerCase();
      // Two concurrent deliveries are serialised by the row lock above; the second
      // one must not credit the GP again.
      if (status === MissionStatus.DELIVERED && current === 'delivered') {
        throw new Error('La mission est déjà livrée');
      }
      const gpId = cur.rows[0].gp_id;
      const expediteurId = cur.rows[0].expediteur_id;

      // Trusted internal calls (e.g. recipient QR confirmation) skip these checks;
      // they perform their own validation before calling.
      if (!opts.internal) {
        // 1) Authorization: only the mission's GP or its expéditeur may change status.
        let role: 'gp' | 'expediteur' | null = null;
        if (gpId && userId === gpId) role = 'gp';
        else if (userId === expediteurId) role = 'expediteur';
        if (!role) {
          throw new Error("Vous n'êtes pas autorisé à modifier cette mission");
        }

        // 2) Terminal states are final.
        if (current === 'delivered' || current === 'cancelled') {
          throw new Error(`La mission est déjà ${current === 'delivered' ? 'livrée' : 'annulée'}`);
        }

        // 3) Allowed transitions per role.
        //    GP drives the delivery workflow; the expéditeur may only cancel
        //    while the mission has not been accepted yet.
        const GP_FLOW: Record<string, string[]> = {
          accepted: ['picked_up', 'delivered', 'cancelled'],
          picked_up: ['in_transit', 'out_for_delivery', 'delivered'],
          in_transit: ['in_customs', 'out_for_delivery', 'delivered'],
          in_customs: ['out_for_delivery', 'delivered'],
          out_for_delivery: ['delivered'],
        };
        const EXP_FLOW: Record<string, string[]> = {
          pending: ['cancelled'],
          matched: ['cancelled'],
        };
        const allowed = (role === 'gp' ? GP_FLOW : EXP_FLOW)[current] || [];
        if (status !== current && !allowed.includes(status)) {
          throw new Error(`Transition de statut non autorisée : ${current} → ${status}`);
        }
      }

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
            `UPDATE payments SET credited_at = CURRENT_TIMESTAMP, payee_id = $2
             WHERE id = (
               SELECT id FROM payments
               WHERE mission_id = $1 AND status = 'completed' AND transaction_type = 'mission_payment'
                 AND credited_at IS NULL
               ORDER BY completed_at DESC LIMIT 1
               FOR UPDATE
             )
             RETURNING net_amount`,
            [id, mission.gp_id]
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

      // Journey stages reported by the GP: keep the admins informed at every step.
      const stageLabels: Record<string, string> = {
        picked_up: 'Colis récupéré',
        in_transit: 'Colis en transit',
        in_customs: 'Colis en douane',
      };
      if (stageLabels[status] && !opts.internal) {
        await NotificationService.notifyAdmins({
          notification_type: status === MissionStatus.PICKED_UP ? NotificationType.MISSION_PICKUP : NotificationType.MISSION_TRANSIT,
          title: stageLabels[status],
          message: `Mission ${mission.mission_code} : ${stageLabels[status].toLowerCase()} (${mission.departure_city} → ${mission.arrival_city}).`,
          metadata: { kind: 'mission_' + status, mission_id: id },
        });
      }

      // Arrived at destination: reset the admin-confirmation gate and notify the
      // expéditeur + admin(s). The admin confirms arrival (by WhatsApp call) before
      // the GP is allowed to scan the recipient's QR.
      if (status === MissionStatus.OUT_FOR_DELIVERY) {
        try {
          await pool.query('UPDATE missions SET arrival_confirmed = FALSE WHERE id = $1', [id]);
          if (expediteurId) {
            await NotificationService.create({
              user_id: expediteurId,
              notification_type: NotificationType.MISSION_TRANSIT,
              title: 'GP arrivé à destination',
              message: `Le GP est arrivé à destination pour la mission ${mission.mission_code}. La remise du colis est imminente.`,
              action_url: 'suivi.html',
              metadata: { mission_id: id, mission_code: mission.mission_code },
            });
          }
          const admins = await pool.query(`SELECT id FROM users WHERE user_type = 'admin' AND deleted_at IS NULL`);
          for (const a of admins.rows) {
            await NotificationService.create({
              user_id: a.id,
              notification_type: NotificationType.MISSION_TRANSIT,
              title: 'Arrivée à confirmer',
              message: `Le GP indique être arrivé à destination pour ${mission.mission_code}. Confirmez l'arrivée (appel WhatsApp) pour autoriser la remise.`,
              metadata: { mission_id: id, mission_code: mission.mission_code },
            });
          }
        } catch (e: any) {
          logger.warn('Arrival notification failed:', e.message);
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
