import pool from '../../config/database';
import { Helpers } from '../../utils/helpers';
import { resolveEvidenceUrl } from '../../utils/s3';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../../types';

export const TICKET_STATUSES = ['missing', 'pending', 'approved', 'rejected'];

/** Trajets des GP. */
export class AdminTripService {
  // ---------- Trips ----------
  static async listTrips(params: { page: number; limit: number; search?: string; status?: string; gp_id?: string; ticket_status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND t.status = $${i++}`; args.push(params.status); }
    if (params.gp_id) { where += ` AND t.gp_id = $${i++}`; args.push(params.gp_id); }
    if (params.ticket_status) { where += ` AND t.ticket_status = $${i++}`; args.push(params.ticket_status); }
    if (params.search) {
      where += ` AND (t.trip_code ILIKE $${i} OR t.departure_city ILIKE $${i} OR t.arrival_city ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM trips t ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT t.id, t.trip_code, t.status, t.departure_city, t.arrival_city,
              t.departure_date, t.arrival_date, t.available_weight, t.current_packages, t.max_packages,
              t.flight_number, t.airline, t.ticket_status, t.gp_id,
              g.first_name || ' ' || g.last_name AS gp_name
       FROM trips t LEFT JOIN users g ON t.gp_id = g.id
       ${where} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  /** Daily trip counts by status — for the Trajets KPI sparklines. */
  static async getTripStatusSeries(from: string, to: string, interval: string) {
    const unit = ['day', 'week', 'month'].includes(interval) ? interval : 'day';
    const r = await pool.query(
      `SELECT to_char(date_trunc($3, created_at), 'YYYY-MM-DD') AS period,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'published') AS published,
              COUNT(*) FILTER (WHERE status = 'draft') AS draft,
              COUNT(*) FILTER (WHERE status = 'active') AS active,
              COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
         FROM trips
        WHERE created_at >= ($1)::date AND created_at < (($2)::date + interval '1 day')
        GROUP BY 1 ORDER BY 1`,
      [from, to, unit]
    );
    const series = r.rows.map((x: any) => ({ period: x.period, total:+x.total, published:+x.published, draft:+x.draft, active:+x.active, cancelled:+x.cancelled }));
    const totals = series.reduce((t: any, s: any) => ({ total:t.total+s.total, published:t.published+s.published, draft:t.draft+s.draft, active:t.active+s.active, cancelled:t.cancelled+s.cancelled }), { total:0,published:0,draft:0,active:0,cancelled:0 });
    return { series, totals };
  }

  /** All trips matching filters (no pagination) — for CSV export. */
  static async listTripsForExport(params: { search?: string; status?: string; gp_id?: string }) {
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND t.status = $${i++}`; args.push(params.status); }
    if (params.gp_id) { where += ` AND t.gp_id = $${i++}`; args.push(params.gp_id); }
    if (params.search) {
      where += ` AND (t.trip_code ILIKE $${i} OR t.departure_city ILIKE $${i} OR t.arrival_city ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const r = await pool.query(
      `SELECT t.trip_code, t.departure_city, t.arrival_city, t.departure_date, t.arrival_date,
              t.flight_number, t.airline, t.available_weight, t.current_packages, t.max_packages, t.status,
              g.first_name || ' ' || g.last_name AS gp
         FROM trips t LEFT JOIN users g ON t.gp_id = g.id ${where} ORDER BY t.created_at DESC`,
      args
    );
    return r.rows;
  }

  static async deleteTrip(id: string) {
    const result = await pool.query(`DELETE FROM trips WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) throw new Error('Trip not found (it may have linked missions)');
    return { id, deleted: true };
  }

  /**
   * Trip detail: GP (with identity check), flight ticket, linked missions, and the live position
   * of the parcels on board (last GPS point of each mission, plus the recent events).
   */
  static async getTripDetail(id: string) {
    const t = await pool.query(
      `SELECT t.*, g.first_name || ' ' || g.last_name AS gp_name, g.phone AS gp_phone, g.email AS gp_email,
              g.average_rating AS gp_rating, g.total_reviews AS gp_reviews, g.identity_verified_at AS gp_identity_verified_at,
              rv.first_name || ' ' || rv.last_name AS ticket_reviewed_by_name
         FROM trips t LEFT JOIN users g ON t.gp_id = g.id LEFT JOIN users rv ON t.ticket_reviewed_by = rv.id
        WHERE t.id = $1`, [id]
    );
    if (t.rows.length === 0) throw new Error('Trip not found');
    const trip = t.rows[0];
    if (trip.flight_ticket_url) {
      trip.ticket_is_pdf = /\.pdf$/i.test(trip.flight_ticket_url) || trip.flight_ticket_url.startsWith('data:application/pdf');
      trip.flight_ticket_url = resolveEvidenceUrl(trip.flight_ticket_url);
    }
    const missions = await pool.query(
      `SELECT m.id, m.mission_code, m.status, m.departure_city, m.arrival_city, m.offered_price AS price, m.package_weight AS weight,
              m.payment_method, m.arrival_confirmed, m.recipient_name,
              e.first_name || ' ' || e.last_name AS expediteur_name,
              EXISTS (SELECT 1 FROM payments p WHERE p.mission_id = m.id AND p.status = 'completed') AS paid,
              lp.latitude AS last_lat, lp.longitude AS last_lng, lp.created_at AS last_position_at, lp.location AS last_location
         FROM missions m
         LEFT JOIN users e ON e.id = m.expediteur_id
         LEFT JOIN LATERAL (
           SELECT latitude, longitude, created_at, location FROM mission_tracking
            WHERE mission_id = m.id AND latitude IS NOT NULL AND longitude IS NOT NULL
            ORDER BY created_at DESC LIMIT 1) lp ON TRUE
        WHERE m.trip_id = $1 ORDER BY m.created_at DESC`, [id]
    );
    const events = await pool.query(
      `SELECT tr.status, tr.location, tr.description, tr.created_at, m.mission_code
         FROM mission_tracking tr JOIN missions m ON m.id = tr.mission_id
        WHERE m.trip_id = $1 ORDER BY tr.created_at DESC LIMIT 15`, [id]
    );
    return { trip, missions: missions.rows, events: events.rows, server_time: new Date().toISOString() };
  }

  /** Approve or reject the flight ticket of a trip; the GP is told either way. */
  static async reviewTicket(id: string, decision: string, note: string | undefined, adminId: string) {
    if (!['approved', 'rejected'].includes(decision)) throw new Error('decision must be approved or rejected');
    const cleanNote = (note || '').trim().slice(0, 500);
    if (decision === 'rejected' && !cleanNote) throw new Error('A reason is required to reject a ticket');
    const cur = await pool.query('SELECT id, gp_id, trip_code, flight_ticket_url, ticket_status FROM trips WHERE id = $1', [id]);
    if (cur.rows.length === 0) throw new Error('Trip not found');
    if (!cur.rows[0].flight_ticket_url) throw new Error('This trip has no flight ticket to review');
    const r = await pool.query(
      `UPDATE trips SET ticket_status = $2, ticket_reviewed_by = $3, ticket_reviewed_at = CURRENT_TIMESTAMP,
              ticket_review_note = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1
       RETURNING id, trip_code, ticket_status, ticket_reviewed_at, ticket_review_note`,
      [id, decision, adminId, cleanNote || null]
    );
    const code = cur.rows[0].trip_code;
    await NotificationService.create({
      user_id: cur.rows[0].gp_id,
      notification_type: NotificationType.SYSTEM_ALERT,
      title: decision === 'approved' ? 'Billet d\'avion validé' : 'Billet d\'avion refusé',
      message: decision === 'approved'
        ? `Le billet de votre trajet ${code} a été validé.`
        : `Le billet de votre trajet ${code} a été refusé : ${cleanNote}. Créez le trajet à nouveau avec un billet lisible.`,
      metadata: { kind: 'ticket_review', trip_id: id, decision },
    }).catch(() => undefined);
    return { ...r.rows[0], previous_status: cur.rows[0].ticket_status };
  }

  /** Moderate a trip (publish / unpublish / cancel, adjust capacity). */
  static async updateTrip(id: string, data: any) {
    const allowed = ['status', 'available_weight', 'max_packages', 'flight_number', 'airline'];
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
}
