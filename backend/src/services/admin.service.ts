import pool from '../config/database';
import bcrypt from 'bcryptjs';
import { Helpers } from '../utils/helpers';
import { resolveEvidenceUrl } from '../utils/s3';
import { NotificationService } from './notification.service';
import { NotificationType } from '../types';
import { ALL_PERMISSIONS } from '../utils/permissions';
import logger from '../utils/logger';

/**
 * Admin service: read-only global overview + full CRUD over the main entities.
 * All methods assume the caller has already been authorised as ADMIN.
 */
export class AdminService {
  /** Global dashboard overview (counts and money totals). */
  static async getStats() {
    const [users, missions, trips, payments, withdrawals, claims] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
          COUNT(*) FILTER (WHERE user_type = 'expediteur' AND deleted_at IS NULL) AS expediteurs,
          COUNT(*) FILTER (WHERE user_type = 'gp' AND deleted_at IS NULL) AS gps,
          COUNT(*) FILTER (WHERE user_type = 'admin' AND deleted_at IS NULL) AS admins,
          COUNT(*) FILTER (WHERE status = 'suspended' AND deleted_at IS NULL) AS suspended
        FROM users`),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
          COUNT(*) FILTER (WHERE status = 'in_transit') AS in_transit,
          COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM missions`),
      pool.query(`SELECT COUNT(*) AS total FROM trips`),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS gross_volume,
          COALESCE(SUM(commission) FILTER (WHERE status = 'completed'), 0) AS commission_total
        FROM payments`),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount
        FROM withdrawals`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'open') AS open FROM claims`),
    ]);

    return {
      users: users.rows[0],
      missions: missions.rows[0],
      trips: trips.rows[0],
      payments: payments.rows[0],
      withdrawals: withdrawals.rows[0],
      claims: claims.rows[0],
    };
  }

  // ---------- Users ----------
  static async listUsers(params: { page: number; limit: number; search?: string; user_type?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE deleted_at IS NULL';
    const args: any[] = [];
    let i = 1;
    if (params.user_type) { where += ` AND user_type = $${i++}`; args.push(params.user_type); }
    if (params.status) { where += ` AND status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i} OR phone ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM users ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT id, email, phone, user_type, first_name, last_name, status,
              is_email_verified, country, city, average_rating, created_at, last_login_at
       FROM users ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async updateUser(id: string, data: any) {
    const allowed = ['first_name', 'last_name', 'phone', 'user_type', 'status', 'country', 'city', 'is_email_verified'];
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = $${i++}`); args.push(data[key]); }
    }
    if (data.password) {
      const hash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      sets.push(`password_hash = $${i++}`); args.push(hash);
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
       RETURNING id, email, phone, user_type, first_name, last_name, status, is_email_verified, country, city`,
      args
    );
    if (result.rows.length === 0) throw new Error('User not found');
    return result.rows[0];
  }

  /** Soft-delete a user (keeps referential integrity for missions/payments). */
  static async deleteUser(id: string) {
    const result = await pool.query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, status = 'suspended'
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) throw new Error('User not found');
    return { id, deleted: true };
  }

  /** Full user detail: profile, KYC docs (presigned), and activity summary. */
  static async getUserDetail(id: string) {
    const u = await pool.query(
      `SELECT id, email, phone, user_type, first_name, last_name, date_of_birth,
              profile_photo_url, status, is_email_verified, is_phone_verified,
              identity_document_type, identity_document_url, identity_document_url_back,
              identity_verified_at, verified_by, country, city, address,
              average_rating, total_reviews, created_at, last_login_at
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (u.rows.length === 0) throw new Error('User not found');
    const user = u.rows[0];
    if (user.identity_document_url) user.identity_document_url = resolveEvidenceUrl(user.identity_document_url);
    if (user.identity_document_url_back) user.identity_document_url_back = resolveEvidenceUrl(user.identity_document_url_back);

    const profileTable = user.user_type === 'gp' ? 'gp_profiles' : user.user_type === 'expediteur' ? 'expediteur_profiles' : null;
    let profile = null;
    if (profileTable) {
      const pr = await pool.query(`SELECT * FROM ${profileTable} WHERE user_id = $1`, [id]);
      profile = pr.rows[0] || null;
    }

    const [asExp, asGp, pay, claims, recent] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM missions WHERE expediteur_id = $1`, [id]),
      pool.query(`SELECT COUNT(*) FROM missions WHERE gp_id = $1`, [id]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE payer_id = $1 AND status = 'completed'`, [id]),
      pool.query(`SELECT COUNT(*) FROM claims WHERE claimant_id = $1`, [id]),
      pool.query(
        `SELECT id, mission_code, status, departure_city, arrival_city, offered_price AS price, created_at
           FROM missions WHERE expediteur_id = $1 OR gp_id = $1
          ORDER BY created_at DESC LIMIT 5`, [id]),
    ]);

    return {
      user,
      profile,
      stats: {
        missions_as_expediteur: parseInt(asExp.rows[0].count),
        missions_as_gp: parseInt(asGp.rows[0].count),
        total_paid: pay.rows[0].total,
        claims: parseInt(claims.rows[0].count),
      },
      recent_missions: recent.rows,
    };
  }

  /** Admin creates a user directly (with profile + wallet, like registration). */
  static async createUser(data: any) {
    const required = ['email', 'password', 'user_type', 'first_name', 'last_name'];
    for (const f of required) if (!data[f]) throw new Error(`${f} is required`);
    if (!['expediteur', 'gp', 'admin'].includes(data.user_type)) throw new Error('Invalid user_type');
    if (String(data.password).length < 8) throw new Error('Password must be at least 8 characters');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const dup = await client.query('SELECT id FROM users WHERE email = $1', [String(data.email).toLowerCase()]);
      if (dup.rows.length) throw new Error('Email already registered');
      const hash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      const ins = await client.query(
        `INSERT INTO users (email, phone, password_hash, user_type, first_name, last_name, country, city, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified')
         RETURNING id, email, phone, user_type, first_name, last_name, status, created_at`,
        [String(data.email).toLowerCase(), data.phone || null, hash, data.user_type,
         data.first_name, data.last_name, data.country || null, data.city || null]
      );
      const nu = ins.rows[0];
      if (data.user_type === 'gp') {
        await client.query('INSERT INTO gp_profiles (user_id) VALUES ($1)', [nu.id]);
        await client.query('INSERT INTO wallet_balances (user_id) VALUES ($1)', [nu.id]);
      } else if (data.user_type === 'expediteur') {
        await client.query('INSERT INTO expediteur_profiles (user_id) VALUES ($1)', [nu.id]);
      }
      await client.query('COMMIT');
      return nu;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ---------- KYC / identity verification ----------
  /** Users who uploaded an ID document but are not yet verified. */
  static async listKyc(params: { page: number; limit: number; search?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = `WHERE deleted_at IS NULL AND identity_verified_at IS NULL
                 AND (identity_document_url IS NOT NULL OR identity_document_url_back IS NOT NULL)`;
    const args: any[] = [];
    let i = 1;
    if (params.search) {
      where += ` AND (email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i} OR phone ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM users ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT id, email, phone, first_name, last_name, user_type, status, country, city,
              identity_document_type, identity_document_url, identity_document_url_back,
              is_email_verified, created_at
         FROM users ${where} ORDER BY created_at ASC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    const data = rows.rows.map((r: any) => {
      if (r.identity_document_url) r.identity_document_url = resolveEvidenceUrl(r.identity_document_url);
      if (r.identity_document_url_back) r.identity_document_url_back = resolveEvidenceUrl(r.identity_document_url_back);
      return r;
    });
    return { data, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async approveKyc(userId: string, adminId: string) {
    const r = await pool.query(
      `UPDATE users
          SET identity_verified_at = CURRENT_TIMESTAMP, verified_by = $2,
              status = CASE WHEN status = 'pending' THEN 'verified' ELSE status END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, email, first_name, user_type`,
      [userId, adminId]
    );
    if (r.rows.length === 0) throw new Error('User not found');
    try {
      await NotificationService.create({
        user_id: userId,
        notification_type: NotificationType.ACCOUNT_VERIFIED,
        title: 'Identité vérifiée ✅',
        message: 'Votre pièce d\'identité a été validée. Votre compte est maintenant vérifié.',
        action_url: 'profile.html',
      });
    } catch (e) { logger.warn(`KYC approved for ${userId} but notification failed`); }
    return r.rows[0];
  }

  static async rejectKyc(userId: string, adminId: string, reason?: string) {
    const r = await pool.query(
      `UPDATE users
          SET identity_document_url = NULL, identity_document_url_back = NULL,
              identity_verified_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, email, first_name`,
      [userId]
    );
    if (r.rows.length === 0) throw new Error('User not found');
    try {
      await NotificationService.create({
        user_id: userId,
        notification_type: NotificationType.SYSTEM_ALERT,
        title: 'Pièce d\'identité refusée',
        message: reason
          ? `Votre pièce d'identité a été refusée : ${reason}. Merci de la soumettre à nouveau.`
          : 'Votre pièce d\'identité a été refusée. Merci de la soumettre à nouveau.',
        action_url: 'profile.html',
      });
    } catch (e) { logger.warn(`KYC rejected for ${userId} but notification failed`); }
    return { id: r.rows[0].id, rejected: true };
  }

  // ---------- Missions ----------
  static async listMissions(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND m.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (m.mission_code ILIKE $${i} OR m.departure_city ILIKE $${i} OR m.arrival_city ILIKE $${i} OR m.tracking_number ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM missions m ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT m.id, m.mission_code, m.status, m.arrival_confirmed, m.departure_city, m.arrival_city,
              m.offered_price AS price, m.package_weight AS weight, m.tracking_number, m.created_at,
              e.first_name || ' ' || e.last_name AS expediteur_name,
              g.first_name || ' ' || g.last_name AS gp_name
       FROM missions m
       LEFT JOIN users e ON m.expediteur_id = e.id
       LEFT JOIN users g ON m.gp_id = g.id
       ${where} ORDER BY m.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async updateMission(id: string, data: any) {
    const allowed = ['status', 'final_price', 'offered_price'];
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = $${i++}`); args.push(data[key]); }
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);
    const result = await pool.query(`UPDATE missions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, args);
    if (result.rows.length === 0) throw new Error('Mission not found');
    return result.rows[0];
  }

  /**
   * Assign a still-unassigned ('pending') mission to a GP and notify them.
   * The GP then confirms via POST /missions/:id/accept or releases it via
   * /missions/:id/decline. The `status = 'pending'` guard makes this safe against
   * double-assignment. The GP notification is best-effort (assignment is the
   * source of truth and must not roll back if the notification insert fails).
   */
  static async assignMission(missionId: string, gpId: string) {
    if (!gpId) throw new Error('gp_id is required');

    // The GP must exist and actually be a GP.
    const gp = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND user_type = 'gp' AND deleted_at IS NULL`,
      [gpId]
    );
    if (gp.rows.length === 0) throw new Error('GP not found');

    // Atomically claim the mission only if it is still pending.
    const upd = await pool.query(
      `UPDATE missions
       SET gp_id = $1, status = 'matched', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = 'pending'
       RETURNING id, mission_code, departure_city, arrival_city, arrival_country,
                 package_weight, offered_price, final_price, desired_departure_date`,
      [gpId, missionId]
    );
    if (upd.rows.length === 0) {
      const exists = await pool.query('SELECT 1 FROM missions WHERE id = $1', [missionId]);
      throw new Error(
        exists.rows.length === 0 ? 'Mission not found' : 'Mission is not available for assignment'
      );
    }

    const m = upd.rows[0];
    const route = `${m.departure_city} → ${m.arrival_city}`;
    const price = m.final_price ?? m.offered_price;

    // The mission only stores a DATE (no time). The meaningful date+time for the
    // GP is their matching trip's departure (trips.departure_date is a TIMESTAMP).
    let departureDate: any = m.desired_departure_date;
    let departureHasTime = false;
    try {
      const trip = await pool.query(
        `SELECT departure_date FROM trips
         WHERE gp_id = $1 AND status NOT IN ('cancelled','completed')
           AND (LOWER(arrival_city) = LOWER($2) OR LOWER(arrival_country) = LOWER($3))
         ORDER BY departure_date ASC LIMIT 1`,
        [gpId, m.arrival_city, m.arrival_country || '']
      );
      if (trip.rows[0]?.departure_date) {
        departureDate = trip.rows[0].departure_date; // full timestamp (with time)
        departureHasTime = true;
      }
    } catch (e) { /* fall back to the mission date */ }

    // Notify the GP with the mission details so the notifications page can
    // render the accept/decline card from real data.
    try {
      await NotificationService.create({
        user_id: gpId,
        notification_type: NotificationType.MISSION_ASSIGNED,
        title: `Mission assignée : ${route}`,
        message: `Une nouvelle mission (${m.mission_code}) vous a été assignée. Acceptez ou déclinez depuis vos notifications.`,
        action_url: 'notifications.html',
        metadata: {
          mission_id: m.id,
          mission_code: m.mission_code,
          route,
          departure_city: m.departure_city,
          arrival_city: m.arrival_city,
          departure_date: departureDate,
          departure_has_time: departureHasTime,
          package_weight: m.package_weight,
          price,
        },
      });
    } catch (e) {
      logger.warn(`Mission ${missionId} assigned to GP ${gpId} but notification failed`);
    }

    return m;
  }

  /**
   * Confirm the GP's arrival at destination (after the admin's WhatsApp call).
   * Unlocks delivery: the GP can now scan the recipient's QR. Notifies the GP.
   */
  static async confirmArrival(missionId: string) {
    const upd = await pool.query(
      `UPDATE missions SET arrival_confirmed = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'out_for_delivery'
       RETURNING id, mission_code, gp_id`,
      [missionId]
    );
    if (upd.rows.length === 0) {
      const exists = await pool.query('SELECT 1 FROM missions WHERE id = $1', [missionId]);
      throw new Error(
        exists.rows.length === 0 ? 'Mission not found' : "La mission n'est pas en attente de confirmation d'arrivée"
      );
    }
    const m = upd.rows[0];
    if (m.gp_id) {
      try {
        await NotificationService.create({
          user_id: m.gp_id,
          notification_type: NotificationType.MISSION_TRANSIT,
          title: 'Arrivée confirmée',
          message: `Arrivée confirmée pour ${m.mission_code}. Vous pouvez maintenant scanner le QR du destinataire pour livrer.`,
          action_url: 'alivrer.html',
          metadata: { mission_id: m.id, mission_code: m.mission_code },
        });
      } catch (e: any) {
        logger.warn(`Arrival confirmed for ${missionId} but GP notification failed`);
      }
    }
    return m;
  }

  /** Hard-delete a mission and all its dependents (admin cleanup), in a transaction. */
  static async deleteMission(id: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Detach withdrawals that point at this mission's payments, then remove dependents.
      await client.query(
        `UPDATE withdrawals SET payment_id = NULL
         WHERE payment_id IN (SELECT id FROM payments WHERE mission_id = $1)`,
        [id]
      );
      await client.query(`DELETE FROM payments WHERE mission_id = $1`, [id]);
      await client.query(`DELETE FROM reviews WHERE mission_id = $1`, [id]);
      await client.query(`DELETE FROM claims WHERE mission_id = $1`, [id]);
      await client.query(`DELETE FROM mission_tracking WHERE mission_id = $1`, [id]);
      const result = await client.query(`DELETE FROM missions WHERE id = $1 RETURNING id`, [id]);
      if (result.rows.length === 0) throw new Error('Mission not found');
      await client.query('COMMIT');
      return { id, deleted: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Full mission detail: parties + trip + tracking timeline + payment/claims. */
  static async getMissionDetail(id: string) {
    const m = await pool.query(
      `SELECT m.*,
              e.first_name || ' ' || e.last_name AS expediteur_name, e.phone AS expediteur_phone, e.email AS expediteur_email,
              g.first_name || ' ' || g.last_name AS gp_name, g.phone AS gp_phone, g.email AS gp_email,
              t.trip_code, t.departure_date AS trip_departure_date, t.flight_number, t.airline
         FROM missions m
         LEFT JOIN users e ON m.expediteur_id = e.id
         LEFT JOIN users g ON m.gp_id = g.id
         LEFT JOIN trips t ON m.trip_id = t.id
        WHERE m.id = $1`,
      [id]
    );
    if (m.rows.length === 0) throw new Error('Mission not found');
    const mission = m.rows[0];
    // Presign package photos + QR when they are stored as S3 keys.
    let photos = mission.package_photos;
    if (typeof photos === 'string') { try { photos = JSON.parse(photos); } catch { photos = []; } }
    if (Array.isArray(photos)) mission.package_photos = photos.map((p: string) => resolveEvidenceUrl(p));
    if (mission.qr_code_url) mission.qr_code_url = resolveEvidenceUrl(mission.qr_code_url);

    const [tracking, payment, claims] = await Promise.all([
      pool.query(
        `SELECT tr.id, tr.status, tr.location, tr.latitude, tr.longitude, tr.description, tr.created_at,
                u.first_name || ' ' || u.last_name AS by_name
           FROM mission_tracking tr
           LEFT JOIN users u ON tr.created_by = u.id
          WHERE tr.mission_id = $1 ORDER BY tr.created_at ASC`, [id]),
      pool.query(
        `SELECT payment_code, amount, commission, net_amount, payment_method, status, created_at
           FROM payments WHERE mission_id = $1 ORDER BY created_at DESC`, [id]),
      pool.query(
        `SELECT claim_code, claim_type, status, priority, created_at
           FROM claims WHERE mission_id = $1 ORDER BY created_at DESC`, [id]),
    ]);
    return { mission, tracking: tracking.rows, payments: payment.rows, claims: claims.rows };
  }

  /**
   * Reassign a mission to a different GP (works whatever the current state,
   * unlike assignMission which only claims a still-pending mission). Resets the
   * mission to 'matched' + clears arrival confirmation, and notifies the new GP.
   */
  static async reassignMission(missionId: string, gpId: string) {
    if (!gpId) throw new Error('gp_id is required');
    const gp = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND user_type = 'gp' AND deleted_at IS NULL`, [gpId]
    );
    if (gp.rows.length === 0) throw new Error('GP not found');
    const upd = await pool.query(
      `UPDATE missions
          SET gp_id = $1, status = 'matched', arrival_confirmed = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, mission_code, departure_city, arrival_city, offered_price, final_price`,
      [gpId, missionId]
    );
    if (upd.rows.length === 0) throw new Error('Mission not found');
    const m = upd.rows[0];
    const route = `${m.departure_city} → ${m.arrival_city}`;
    try {
      await NotificationService.create({
        user_id: gpId,
        notification_type: NotificationType.MISSION_ASSIGNED,
        title: `Mission réassignée : ${route}`,
        message: `La mission ${m.mission_code} vous a été (ré)assignée. Acceptez ou déclinez depuis vos notifications.`,
        action_url: 'notifications.html',
        metadata: { mission_id: m.id, mission_code: m.mission_code, route, price: m.final_price ?? m.offered_price },
      });
    } catch (e) { logger.warn(`Mission ${missionId} reassigned but notification failed`); }
    return m;
  }

  // ---------- Trips ----------
  static async listTrips(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND t.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (t.trip_code ILIKE $${i} OR t.departure_city ILIKE $${i} OR t.arrival_city ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM trips t ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT t.id, t.trip_code, t.status, t.departure_city, t.arrival_city,
              t.departure_date, t.arrival_date, t.available_weight, t.current_packages, t.max_packages,
              g.first_name || ' ' || g.last_name AS gp_name
       FROM trips t LEFT JOIN users g ON t.gp_id = g.id
       ${where} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async deleteTrip(id: string) {
    const result = await pool.query(`DELETE FROM trips WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) throw new Error('Trip not found (it may have linked missions)');
    return { id, deleted: true };
  }

  /** Trip detail: GP + linked missions. */
  static async getTripDetail(id: string) {
    const t = await pool.query(
      `SELECT t.*, g.first_name || ' ' || g.last_name AS gp_name, g.phone AS gp_phone, g.email AS gp_email
         FROM trips t LEFT JOIN users g ON t.gp_id = g.id WHERE t.id = $1`, [id]
    );
    if (t.rows.length === 0) throw new Error('Trip not found');
    const missions = await pool.query(
      `SELECT id, mission_code, status, departure_city, arrival_city, offered_price AS price, package_weight AS weight
         FROM missions WHERE trip_id = $1 ORDER BY created_at DESC`, [id]
    );
    return { trip: t.rows[0], missions: missions.rows };
  }

  /** Moderate a trip (publish / unpublish / cancel, adjust capacity). */
  static async updateTrip(id: string, data: any) {
    const allowed = ['status', 'available_weight', 'max_packages'];
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = $${i++}`); args.push(data[key]); }
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);
    const r = await pool.query(`UPDATE trips SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, args);
    if (r.rows.length === 0) throw new Error('Trip not found');
    return r.rows[0];
  }

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

  // ---------- Claims ----------
  static async listClaims(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND c.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (c.claim_code ILIKE $${i} OR c.title ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM claims c ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT c.id, c.claim_code, c.claim_type, c.title, c.description, c.status, c.priority, c.resolution,
              c.compensation_amount, c.evidence_urls, c.created_at,
              u.first_name || ' ' || u.last_name AS claimant_name,
              m.mission_code
       FROM claims c
       LEFT JOIN users u ON c.claimant_id = u.id
       LEFT JOIN missions m ON c.mission_id = m.id
       ${where} ORDER BY c.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    // Presign stored evidence keys so the admin can play/download attachments.
    const data = rows.rows.map((r: any) => {
      let ev = r.evidence_urls;
      if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (_) { ev = []; } }
      if (Array.isArray(ev)) r.evidence_urls = ev.map((v: string) => resolveEvidenceUrl(v));
      return r;
    });
    return { data, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async updateClaim(id: string, adminId: string, data: any) {
    const allowed = ['status', 'priority', 'resolution', 'compensation_amount'];
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = $${i++}`); args.push(data[key]); }
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    sets.push(`assigned_to = $${i++}`); args.push(adminId);
    if (data.status === 'resolved' || data.status === 'closed') sets.push(`resolved_at = CURRENT_TIMESTAMP`);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);
    const result = await pool.query(`UPDATE claims SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, args);
    if (result.rows.length === 0) throw new Error('Claim not found');
    return result.rows[0];
  }

  // ---------- Admin roles (RBAC) ----------
  static async listRoles() {
    const r = await pool.query(
      `SELECT ar.id, ar.key, ar.name, ar.description, ar.permissions, ar.is_system,
              ar.created_at, ar.updated_at,
              (SELECT COUNT(*) FROM users u WHERE u.admin_role_id = ar.id AND u.deleted_at IS NULL) AS admin_count
         FROM admin_role ar
        ORDER BY ar.is_system DESC, ar.name ASC`
    );
    return { data: r.rows, catalog: ALL_PERMISSIONS };
  }

  /** Validate a permission list against the known catalog (allows '*'). */
  private static sanitizePermissions(permissions: any): string[] {
    if (!Array.isArray(permissions)) throw new Error('permissions must be an array');
    const valid = new Set<string>([...ALL_PERMISSIONS, '*']);
    const clean = [...new Set(permissions.map((p) => String(p)))];
    const bad = clean.filter((p) => !valid.has(p));
    if (bad.length) throw new Error(`Unknown permissions: ${bad.join(', ')}`);
    return clean;
  }

  static async createRole(data: { key?: string; name: string; description?: string; permissions: any }) {
    if (!data.name) throw new Error('name is required');
    const key = (data.key || data.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!key) throw new Error('A valid key or name is required');
    const perms = this.sanitizePermissions(data.permissions || []);
    const exists = await pool.query('SELECT 1 FROM admin_role WHERE key = $1', [key]);
    if (exists.rows.length) throw new Error('A role with this key already exists');
    const r = await pool.query(
      `INSERT INTO admin_role (key, name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, key, name, description, permissions, is_system, created_at, updated_at`,
      [key, data.name, data.description || null, JSON.stringify(perms)]
    );
    return r.rows[0];
  }

  static async updateRole(id: string, data: { name?: string; description?: string; permissions?: any }) {
    const cur = await pool.query('SELECT is_system FROM admin_role WHERE id = $1', [id]);
    if (cur.rows.length === 0) throw new Error('Role not found');
    // System-role permissions are managed in code (re-synced on deploy); editing
    // them from the UI would silently revert. Name/description stay editable.
    if (cur.rows[0].is_system && data.permissions !== undefined) {
      throw new Error('Permissions of a system role cannot be edited (managed in code)');
    }
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    if (data.name !== undefined) { sets.push(`name = $${i++}`); args.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${i++}`); args.push(data.description); }
    if (data.permissions !== undefined) {
      sets.push(`permissions = $${i++}`); args.push(JSON.stringify(this.sanitizePermissions(data.permissions)));
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    args.push(id);
    const r = await pool.query(
      `UPDATE admin_role SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, key, name, description, permissions, is_system, created_at, updated_at`,
      args
    );
    return r.rows[0];
  }

  static async deleteRole(id: string) {
    const cur = await pool.query('SELECT is_system FROM admin_role WHERE id = $1', [id]);
    if (cur.rows.length === 0) throw new Error('Role not found');
    if (cur.rows[0].is_system) throw new Error('System roles cannot be deleted');
    const assigned = await pool.query(
      'SELECT COUNT(*) FROM users WHERE admin_role_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (parseInt(assigned.rows[0].count) > 0) {
      throw new Error('Reassign the admins on this role before deleting it');
    }
    await pool.query('DELETE FROM admin_role WHERE id = $1', [id]);
    return { id, deleted: true };
  }

  /** Assign an admin role to a user (promoting them to admin in the process). */
  static async setUserRole(userId: string, roleId: string) {
    if (!roleId) throw new Error('role_id is required');
    const role = await pool.query('SELECT id, key, name, permissions FROM admin_role WHERE id = $1', [roleId]);
    if (role.rows.length === 0) throw new Error('Role not found');
    const r = await pool.query(
      `UPDATE users
          SET admin_role_id = $1, user_type = 'admin', status = 'verified', updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING id, email, user_type, admin_role_id`,
      [roleId, userId]
    );
    if (r.rows.length === 0) throw new Error('User not found');
    return { ...r.rows[0], role: role.rows[0] };
  }

  // ---------- Audit log ----------
  static async listAudit(params: { page: number; limit: number; search?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.search) {
      where += ` AND (l.action ILIKE $${i} OR l.entity_type ILIKE $${i} OR l.description ILIKE $${i}
                 OR a.email ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM admin_logs l LEFT JOIN users a ON l.admin_id = a.id ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.description, l.ip_address,
              l.metadata, l.created_at,
              a.first_name || ' ' || a.last_name AS admin_name, a.email AS admin_email
         FROM admin_logs l
         LEFT JOIN users a ON l.admin_id = a.id
         ${where} ORDER BY l.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  /**
   * One-time bootstrap: promote an existing user to ADMIN using a shared secret.
   * Guarded by ADMIN_BOOTSTRAP_SECRET (so it cannot be abused without the secret).
   * The promoted user is given the super_admin role so they get full permissions.
   */
  static async bootstrapAdmin(email: string, secret: string) {
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expected) throw new Error('Admin bootstrap is not configured');
    if (secret !== expected) throw new Error('Invalid bootstrap secret');
    const result = await pool.query(
      `UPDATE users
          SET user_type = 'admin', status = 'verified',
              admin_role_id = COALESCE(admin_role_id, (SELECT id FROM admin_role WHERE key = 'super_admin')),
              updated_at = CURRENT_TIMESTAMP
        WHERE email = $1 AND deleted_at IS NULL
        RETURNING id, email, user_type`,
      [String(email).toLowerCase()]
    );
    if (result.rows.length === 0) throw new Error('No user found with that email');
    return result.rows[0];
  }

  /**
   * Secret-gated password reset (recovery when no email flow exists). Guarded by
   * ADMIN_BOOTSTRAP_SECRET so it cannot be abused without the shared secret.
   */
  static async resetPassword(email: string, secret: string, newPassword: string) {
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expected) throw new Error('Password reset is not configured');
    if (secret !== expected) throw new Error('Invalid bootstrap secret');
    if (!newPassword || String(newPassword).length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const hash = await bcrypt.hash(String(newPassword), 12);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE email = $2 AND deleted_at IS NULL
       RETURNING id, email, user_type`,
      [hash, String(email).toLowerCase()]
    );
    if (result.rows.length === 0) throw new Error('No user found with that email');
    return result.rows[0];
  }
}
