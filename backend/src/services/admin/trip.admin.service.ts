import pool from '../../config/database';
import { Helpers } from '../../utils/helpers';

/** Trajets des GP. */
export class AdminTripService {
  // ---------- Trips ----------
  static async listTrips(params: { page: number; limit: number; search?: string; status?: string; gp_id?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND t.status = $${i++}`; args.push(params.status); }
    if (params.gp_id) { where += ` AND t.gp_id = $${i++}`; args.push(params.gp_id); }
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
}
