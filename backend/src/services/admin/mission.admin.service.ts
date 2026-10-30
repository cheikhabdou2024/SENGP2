import pool from '../../config/database';
import { Helpers } from '../../utils/helpers';
import { resolveEvidenceUrl } from '../../utils/s3';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../../types';
import logger from '../../utils/logger';

/** Missions : suivi, affectation, arrivée à destination et fin de voyage. */
export class AdminMissionService {
  // ---------- Missions ----------
  static async listMissions(params: { page: number; limit: number; search?: string; status?: string; expediteur_id?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND m.status = $${i++}`; args.push(params.status); }
    if (params.expediteur_id) { where += ` AND m.expediteur_id = $${i++}`; args.push(params.expediteur_id); }
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
              g.first_name || ' ' || g.last_name AS gp_name, g.phone AS gp_phone, m.updated_at
       FROM missions m
       LEFT JOIN users e ON m.expediteur_id = e.id
       LEFT JOIN users g ON m.gp_id = g.id
       ${where} ORDER BY m.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  /** Daily mission counts by current status — for the Missions KPI sparklines. */
  static async getMissionStatusSeries(from: string, to: string, interval: string) {
    const unit = ['day', 'week', 'month'].includes(interval) ? interval : 'day';
    const r = await pool.query(
      `SELECT to_char(date_trunc($3, created_at), 'YYYY-MM-DD') AS period,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'in_transit') AS in_transit,
              COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
              COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
         FROM missions
        WHERE created_at >= ($1)::date AND created_at < (($2)::date + interval '1 day')
        GROUP BY 1 ORDER BY 1`,
      [from, to, unit]
    );
    const series = r.rows.map((x: any) => ({ period: x.period, total:+x.total, pending:+x.pending, in_transit:+x.in_transit, delivered:+x.delivered, cancelled:+x.cancelled }));
    const totals = series.reduce((t: any, s: any) => ({ total:t.total+s.total, pending:t.pending+s.pending, in_transit:t.in_transit+s.in_transit, delivered:t.delivered+s.delivered, cancelled:t.cancelled+s.cancelled }), { total:0,pending:0,in_transit:0,delivered:0,cancelled:0 });
    return { series, totals };
  }

  /** All missions matching filters (no pagination) — for CSV export. */
  static async listMissionsForExport(params: { search?: string; status?: string; expediteur_id?: string }) {
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND m.status = $${i++}`; args.push(params.status); }
    if (params.expediteur_id) { where += ` AND m.expediteur_id = $${i++}`; args.push(params.expediteur_id); }
    if (params.search) {
      where += ` AND (m.mission_code ILIKE $${i} OR m.departure_city ILIKE $${i} OR m.arrival_city ILIKE $${i} OR m.tracking_number ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const r = await pool.query(
      `SELECT m.mission_code, m.departure_city, m.arrival_city, m.arrival_country,
              m.offered_price, m.final_price, m.package_weight, m.status, m.tracking_number, m.created_at,
              e.first_name || ' ' || e.last_name AS expediteur, g.first_name || ' ' || g.last_name AS gp
         FROM missions m LEFT JOIN users e ON m.expediteur_id = e.id LEFT JOIN users g ON m.gp_id = g.id
         ${where} ORDER BY m.created_at DESC`,
      args
    );
    return r.rows;
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

  /** GPs who tapped « Scan terminé » and are locked until the admin validates. */
  static async listScanReviews() {
    const r = await pool.query(
      `SELECT u.id, u.first_name || ' ' || u.last_name AS gp_name, u.phone AS gp_phone,
              gp.scan_requested_at,
              (SELECT COUNT(*)::int FROM missions m WHERE m.gp_id = u.id AND m.status = 'delivered'
                 AND m.completed_at >= COALESCE(gp.scan_released_at, NOW() - INTERVAL '30 days')) AS delivered,
              (SELECT COUNT(*)::int FROM missions m WHERE m.gp_id = u.id
                 AND m.status IN ('picked_up','in_transit','out_for_delivery')) AS remaining
       FROM gp_profiles gp JOIN users u ON u.id = gp.user_id
       WHERE gp.scan_review_pending = TRUE
       ORDER BY gp.scan_requested_at ASC`
    );
    return r.rows;
  }

  /** Admin validates the end of the GP's scan: the GP regains access to the app. */
  static async releaseGp(gpId: string) {
    const upd = await pool.query(
      `UPDATE gp_profiles SET scan_review_pending = FALSE, scan_released_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND scan_review_pending = TRUE RETURNING user_id`,
      [gpId]
    );
    if (upd.rows.length === 0) throw new Error("Ce GP n'est pas en attente de validation");
    // Voyage terminé : les trajets du GP dont tous les colis sont livrés passent à « completed ».
    try {
      await pool.query(
        `UPDATE trips SET status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE gp_id = $1 AND status IN ('draft', 'published', 'active')
           AND id IN (SELECT trip_id FROM missions WHERE gp_id = $1 AND trip_id IS NOT NULL AND status = 'delivered')
           AND id NOT IN (SELECT trip_id FROM missions WHERE trip_id IS NOT NULL AND status NOT IN ('delivered', 'cancelled'))`,
        [gpId]
      );
    } catch (e: any) { logger.warn('Trip completion failed: ' + e.message); }
    try {
      await NotificationService.create({
        user_id: gpId,
        notification_type: NotificationType.MISSION_TRANSIT,
        title: 'Accès rétabli',
        message: "L'administration a validé la fin de votre voyage. Vous pouvez de nouveau utiliser l'application.",
        action_url: 'dashgp.html',
      });
    } catch (e: any) { logger.warn('Release notification failed: ' + e.message); }
    return { id: gpId, released: true };
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
}
