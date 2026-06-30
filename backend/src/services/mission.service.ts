import pool from '../config/database';
import { Mission, MissionStatus, NotificationType, PaginatedResult } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';
import QRCode from 'qrcode';
import crypto from 'crypto';
import axios from 'axios';
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
        'SELECT status, gp_id FROM missions WHERE id = $1',
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
        `SELECT status, gp_id, expediteur_id FROM missions WHERE id = $1`,
        [id]
      );
      if (cur.rows.length === 0) {
        throw new Error('Mission not found');
      }
      const current = String(cur.rows[0].status || '').toLowerCase();
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

    // Cache the QR on the mission. Best-effort: a write failure (e.g. a legacy
    // VARCHAR(500) qr_code_url column, before the TEXT patch) must NOT block
    // returning the generated QR to the expéditeur.
    try {
      await pool.query(
        'UPDATE missions SET qr_code_url = $1, qr_code_data = $2 WHERE id = $3',
        [qrCodeUrl, qrData, missionId]
      );
    } catch (e: any) {
      logger.warn(`Could not persist QR for mission ${missionId}: ${e.message}`);
    }

    return qrCodeUrl;
  }

  /**
   * Phase 2 — proof of delivery.
   * Ensure the mission has a secret `delivery_token` (carried by the package QR),
   * then return the public confirmation URL + a QR image (data URL) for it.
   */
  static async generateDeliveryQR(
    missionId: string,
    baseUrl: string
  ): Promise<{ token: string; confirm_url: string; qr_code_url: string }> {
    const mr = await pool.query(
      'SELECT id, delivery_token, expediteur_id, gp_id FROM missions WHERE id = $1',
      [missionId]
    );
    if (mr.rows.length === 0) throw new Error('Mission not found');
    let token = mr.rows[0].delivery_token;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await pool.query('UPDATE missions SET delivery_token = $1 WHERE id = $2', [token, missionId]);
    }
    const confirm_url = `${baseUrl}/d/${token}`;
    const qr_code_url = await QRCode.toDataURL(confirm_url, { margin: 1, width: 320 });
    return { token, confirm_url, qr_code_url };
  }

  /** Public, minimal mission info for the delivery-confirmation page. */
  static async getDeliveryInfo(token: string): Promise<any> {
    const r = await pool.query(
      `SELECT mission_code, tracking_number, status,
              departure_city, arrival_city, arrival_country, package_weight,
              recipient_name
       FROM missions WHERE delivery_token = $1`,
      [token]
    );
    if (r.rows.length === 0) throw new Error('Not found');
    return r.rows[0];
  }

  /** Set/update the recipient identity (expediteur owner only). */
  static async setRecipient(
    missionId: string,
    expediteurId: string,
    name?: string,
    phone?: string
  ): Promise<any> {
    const r = await pool.query(
      `UPDATE missions SET recipient_name = $1, recipient_phone = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND expediteur_id = $4
       RETURNING id, recipient_name, recipient_phone`,
      [name || null, phone || null, missionId, expediteurId]
    );
    if (r.rows.length === 0) throw new Error('Mission not found or not yours');
    return r.rows[0];
  }

  /**
   * Recipient confirms delivery by scanning the package QR. Idempotent: if the
   * mission is already delivered, it's a no-op. Otherwise it runs the full
   * delivered transition (wallet credit, etc.) and records a proof entry.
   */
  static async confirmDeliveryByToken(
    token: string,
    proof: { lat?: number; lng?: number } = {}
  ): Promise<{ already: boolean }> {
    const r = await pool.query(
      `SELECT id, status, gp_id, expediteur_id, arrival_city, arrival_country
       FROM missions WHERE delivery_token = $1`,
      [token]
    );
    if (r.rows.length === 0) throw new Error('Not found');
    const m = r.rows[0];
    if (m.status === 'cancelled') throw new Error('Mission cancelled');
    if (m.status === 'delivered') return { already: true };

    // Anti-fraude : si le destinataire partage sa position, elle doit être proche
    // de la ville d'arrivée. (Si pas de GPS ou géocodage indisponible, on ne bloque pas.)
    if (proof.lat != null && proof.lng != null) {
      const dest = await this.geocodeCity(m.arrival_city, m.arrival_country);
      if (dest) {
        const km = this.haversineKm(proof.lat, proof.lng, dest.lat, dest.lng);
        const limit = parseFloat(process.env.DELIVERY_GEOFENCE_KM || '60');
        if (km > limit) {
          throw new Error(
            `Vous semblez loin du lieu de livraison (${m.arrival_city} · ~${Math.round(km)} km). ` +
            `Confirmez la réception une fois sur place avec le colis.`
          );
        }
      }
    }

    const actor = m.gp_id || m.expediteur_id;
    // Full delivered transition (credits GP wallet, etc.). Trusted internal call:
    // the recipient already proved delivery (token + geofence) above.
    await this.updateStatus(m.id, MissionStatus.DELIVERED, actor, { internal: true });
    // Proof-of-delivery tracking entry (with the recipient's GPS if shared)
    await pool.query(
      `INSERT INTO mission_tracking (mission_id, status, latitude, longitude, description, created_by)
       VALUES ($1, 'delivered', $2, $3, 'Réception confirmée par le destinataire (QR)', $4)`,
      [m.id, proof.lat ?? null, proof.lng ?? null, actor]
    );
    return { already: false };
  }

  /** Process-level cache of geocoded city centres ("city,country" -> {lat,lng}). */
  private static geocodeCache: Map<string, { lat: number; lng: number } | null> = new Map();

  /** Geocode a city centre via OpenStreetMap Nominatim. Returns null on failure. */
  static async geocodeCity(
    city?: string,
    country?: string
  ): Promise<{ lat: number; lng: number } | null> {
    const q = [city, country].filter(Boolean).join(', ').trim();
    if (!q) return null;
    if (this.geocodeCache.has(q)) return this.geocodeCache.get(q) as any;
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q, format: 'json', limit: 1 },
        headers: { 'User-Agent': 'SENGP/1.0 (delivery-geofence)' },
        timeout: 6000,
      });
      const hit = Array.isArray(res.data) && res.data[0];
      const coords = hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) } : null;
      this.geocodeCache.set(q, coords);
      return coords;
    } catch (e) {
      logger.warn(`Geocoding failed for "${q}"`);
      return null; // ne pas bloquer la confirmation si le géocodage échoue
    }
  }

  /** Great-circle distance between two lat/lng points, in kilometres. */
  static haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /**
   * Verify QR code at delivery and mark mission as delivered
   */
  static async verifyDeliveryByQR(qrData: string, gpId: string): Promise<Mission> {
    let parsedData: any;
    try {
      parsedData = JSON.parse(qrData);
    } catch {
      throw new Error('Format QR code invalide');
    }

    const missionId = parsedData.id;
    if (!missionId) throw new Error('Données QR code invalides');

    // The scan must correspond to one of THIS GP's packages, not yet delivered.
    const mr = await pool.query(
      'SELECT id, gp_id, status, mission_code, expediteur_id, recipient_name FROM missions WHERE id = $1',
      [missionId]
    );
    if (mr.rows.length === 0) throw new Error('Mission introuvable');
    const mission = mr.rows[0];
    if (mission.gp_id !== gpId) throw new Error('Ce colis ne fait pas partie de vos missions');
    if (mission.status === 'delivered') throw new Error('Ce colis a déjà été livré');
    if (mission.status === 'cancelled') throw new Error('Cette mission a été annulée');

    // Canonical delivered transition: credits the GP wallet from the upfront
    // payment, increments stats, sets the completion date and notifies the GP
    // of their earnings. Trusted internal call (the QR match is the proof).
    await this.updateStatus(missionId, MissionStatus.DELIVERED, gpId, { internal: true });

    // Proof-of-delivery tracking entry (recipient's QR scanned by the GP).
    await pool.query(
      `INSERT INTO mission_tracking (mission_id, status, description, created_by)
       VALUES ($1, 'delivered', 'Colis livré — QR du destinataire scanné par le GP', $2)`,
      [missionId, gpId]
    );

    // Notify the expéditeur AND the admin(s) that the package reached the recipient.
    try {
      await NotificationService.create({
        user_id: mission.expediteur_id,
        notification_type: NotificationType.MISSION_DELIVERED,
        title: 'Colis livré ✅',
        message: `Votre colis ${mission.mission_code} a été remis${mission.recipient_name ? ' à ' + mission.recipient_name : ' au destinataire'} (QR confirmé).`,
        action_url: 'suivi.html',
        metadata: { mission_id: missionId, mission_code: mission.mission_code },
      });
      const admins = await pool.query(
        `SELECT id FROM users WHERE user_type = 'admin' AND deleted_at IS NULL`
      );
      for (const a of admins.rows) {
        await NotificationService.create({
          user_id: a.id,
          notification_type: NotificationType.MISSION_DELIVERED,
          title: 'Livraison confirmée',
          message: `Le colis ${mission.mission_code} a été livré au destinataire (QR scanné par le GP).`,
          metadata: { mission_id: missionId, mission_code: mission.mission_code },
        });
      }
    } catch (e: any) {
      logger.warn('Delivery notification (expéditeur/admin) failed:', e.message);
    }

    return (await this.getById(missionId)) as Mission;
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
